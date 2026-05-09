// ============================================================
// MADE – Server Entry Point
// ============================================================

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { WebSocketServer } from 'ws';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { Octokit } from 'octokit';

import { SessionManager } from './services/SessionManager.js';
import { AgentManager } from './services/AgentManager.js';
import { TerminalManager } from './services/TerminalManager.js';
import { FileManager } from './services/FileManager.js';
import { GitManager } from './services/GitManager.js';
import { ContainerManager } from './services/ContainerManager.js';
import { createWSHandler } from './websocket/handler.js';

// ------------------------------------------------------------------
// Environment
// ------------------------------------------------------------------

const PORT = parseInt(process.env.MADE_PORT ?? '3000', 10);
const HOST = process.env.MADE_HOST ?? '0.0.0.0';
const AUTH_TOKEN = process.env.MADE_TOKEN; // optional
const PROJECT_DIR =
  process.env.MADE_PROJECT_DIR ?? process.cwd();
const AGENT_CMD = process.env.MADE_AGENT_CMD ?? 'openclaw';
const DOCKER_ENABLED = process.env.MADE_DOCKER_ENABLED === 'true';

// GitHub OAuth configuration
const GITHUB_CLIENT_ID = process.env.MADE_GITHUB_CLIENT_ID ?? '';
const GITHUB_CLIENT_SECRET = process.env.MADE_GITHUB_CLIENT_SECRET ?? '';
const GITHUB_TOKEN = process.env.MADE_GITHUB_TOKEN ?? ''; // optional PAT for API calls without OAuth
const GITHUB_AUTH_ENABLED = !!(GITHUB_CLIENT_ID || GITHUB_TOKEN);

// ------------------------------------------------------------------
// Paths
// ------------------------------------------------------------------

const STATIC_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../static',
);
const UPLOADS_DIR = path.join(PROJECT_DIR, '.sessions', '_uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ------------------------------------------------------------------
// Services
// ------------------------------------------------------------------

const sessionManager = new SessionManager(PROJECT_DIR);
const agentManager = new AgentManager();
const terminalManager = new TerminalManager(sessionManager);
const fileManager = new FileManager(sessionManager);
const gitManager = new GitManager(sessionManager);
const containerManager = new ContainerManager();

// Docker enabled flag (mutable at runtime via toggle endpoint)
let dockerEnabled = DOCKER_ENABLED;

// ------------------------------------------------------------------
// GitHub Auth – in-memory token store
// ------------------------------------------------------------------

const githubTokens = new Map<string, { token: string; user: { login: string; avatar: string; name: string } }>();

// Simple cookie-based session ID for auth
const AUTH_COOKIE = 'made_sid';
const sessionAuthMap = new Map<string, string>(); // cookieSid -> githubUserId

function getAuthSid(req: express.Request): string | undefined {
  const cookieHeader = req.headers.cookie ?? '';
  const match = cookieHeader.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`));
  return match?.[1];
}

function getTokenForRequest(req: express.Request): string | undefined {
  // Prefer OAuth token for the user
  const sid = getAuthSid(req);
  if (sid) {
    const ghUserId = sessionAuthMap.get(sid);
    if (ghUserId) {
      const entry = githubTokens.get(ghUserId);
      if (entry) return entry.token;
    }
  }
  // Fallback to configured PAT
  return GITHUB_TOKEN || undefined;
}

function getOctokitForRequest(req: express.Request): Octokit | null {
  const token = getTokenForRequest(req);
  if (!token) return null;
  return new Octokit({ auth: token });
}

// ------------------------------------------------------------------
// Express app
// ------------------------------------------------------------------

const app = express();
app.use(express.json());

// ---- Auth middleware ----------------------------------------------------
// If GitHub auth env vars are set, require auth for all /api/ routes except /api/auth/*
app.use('/api', (req, res, next) => {
  if (!GITHUB_AUTH_ENABLED) return next();
  if (req.path.startsWith('/auth/')) return next();
  const token = getTokenForRequest(req);
  if (!token) {
    res.status(401).json({ error: 'GitHub authentication required' });
    return;
  }
  next();
});

// Serve static frontend (if any)
app.use(express.static(STATIC_DIR));

// ---- Multer (file upload) ------------------------------------------------

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});
const upload = multer({ storage });

// ------------------------------------------------------------------
// GitHub OAuth routes
// ------------------------------------------------------------------

// Redirect to GitHub OAuth authorize URL
app.get('/api/auth/github', (_req, res) => {
  if (!GITHUB_CLIENT_ID) {
    res.status(400).json({ error: 'GitHub OAuth not configured' });
    return;
  }
  const state = crypto.randomBytes(16).toString('hex');
  const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo&state=${state}`;
  res.redirect(url);
});

// Handle OAuth callback
app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query as { code?: string };
  if (!code) {
    res.status(400).json({ error: 'Missing authorization code' });
    return;
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      res.status(401).json({ error: 'Failed to obtain GitHub token' });
      return;
    }

    const accessToken = tokenData.access_token;

    // Fetch user info
    const octokit = new Octokit({ auth: accessToken });
    const { data: ghUser } = await octokit.rest.users.getAuthenticated();

    const userInfo = {
      login: ghUser.login,
      avatar: ghUser.avatar_url,
      name: ghUser.name || ghUser.login,
    };

    // Store token in memory
    githubTokens.set(ghUser.id.toString(), { token: accessToken, user: userInfo });

    // Create session cookie
    const sid = crypto.randomBytes(32).toString('hex');
    sessionAuthMap.set(sid, ghUser.id.toString());

    // Set cookie and redirect to app
    res.cookie(AUTH_COOKIE, sid, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'lax',
    });
    res.redirect('/');
  } catch (err) {
    console.error('GitHub OAuth callback error:', err);
    res.status(500).json({ error: 'GitHub OAuth callback failed' });
  }
});

// Check auth status
app.get('/api/auth/status', (req, res) => {
  if (!GITHUB_AUTH_ENABLED) {
    // Auth not required – always "authenticated" in the sense that the app works
    // But if a PAT is set, report that GitHub is connected
    if (GITHUB_TOKEN) {
      res.json({
        authenticated: true,
        user: null,
        githubConnected: true,
      });
      return;
    }
    res.json({ authenticated: true, user: null, githubConnected: false });
    return;
  }

  const sid = getAuthSid(req);
  if (!sid) {
    res.json({ authenticated: false, user: null, githubConnected: false });
    return;
  }

  const ghUserId = sessionAuthMap.get(sid);
  if (!ghUserId) {
    res.json({ authenticated: false, user: null, githubConnected: false });
    return;
  }

  const entry = githubTokens.get(ghUserId);
  if (!entry) {
    res.json({ authenticated: false, user: null, githubConnected: false });
    return;
  }

  res.json({ authenticated: true, user: entry.user, githubConnected: true });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const sid = getAuthSid(req);
  if (sid) {
    const ghUserId = sessionAuthMap.get(sid);
    if (ghUserId) githubTokens.delete(ghUserId);
    sessionAuthMap.delete(sid);
  }
  res.clearCookie(AUTH_COOKIE);
  res.json({ success: true });
});

// ------------------------------------------------------------------
// GitHub API proxy routes
// ------------------------------------------------------------------

// List user's repos
app.get('/api/github/repos', async (req, res) => {
  const octokit = getOctokitForRequest(req);
  if (!octokit) {
    res.status(401).json({ error: 'GitHub not authenticated' });
    return;
  }
  try {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 50,
    });
    res.json(data.map(r => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      owner: r.owner?.login,
      description: r.description,
      private: r.private,
      html_url: r.html_url,
      default_branch: r.default_branch,
      updated_at: r.updated_at,
    })));
  } catch (err: any) {
    console.error('GitHub repos error:', err.message);
    res.status(500).json({ error: 'Failed to list repos' });
  }
});

// List issues for a repo
app.get('/api/github/repos/:owner/:repo/issues', async (req, res) => {
  const octokit = getOctokitForRequest(req);
  if (!octokit) {
    res.status(401).json({ error: 'GitHub not authenticated' });
    return;
  }
  const { owner, repo } = req.params;
  try {
    const { data } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      sort: 'updated',
      direction: 'desc',
      per_page: 30,
    });
    // Filter out PRs (GitHub returns PRs as issues)
    const issues = data.filter(i => !i.pull_request);
    res.json(issues.map(i => ({
      number: i.number,
      title: i.title,
      state: i.state,
      user: i.user?.login,
      labels: i.labels?.map(l => typeof l === 'string' ? l : l.name),
      body: i.body,
      html_url: i.html_url,
      created_at: i.created_at,
      updated_at: i.updated_at,
    })));
  } catch (err: any) {
    console.error('GitHub issues error:', err.message);
    res.status(500).json({ error: 'Failed to list issues' });
  }
});

// List PRs for a repo
app.get('/api/github/repos/:owner/:repo/pulls', async (req, res) => {
  const octokit = getOctokitForRequest(req);
  if (!octokit) {
    res.status(401).json({ error: 'GitHub not authenticated' });
    return;
  }
  const { owner, repo } = req.params;
  try {
    const { data } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      sort: 'updated',
      direction: 'desc',
      per_page: 30,
    });
    res.json(data.map(p => ({
      number: p.number,
      title: p.title,
      state: p.state,
      user: p.user?.login,
      body: p.body,
      html_url: p.html_url,
      head_ref: p.head?.ref,
      base_ref: p.base?.ref,
      created_at: p.created_at,
      updated_at: p.updated_at,
    })));
  } catch (err: any) {
    console.error('GitHub pulls error:', err.message);
    res.status(500).json({ error: 'Failed to list pull requests' });
  }
});

// Create session from a GitHub issue
app.post('/api/sessions/from-issue', async (req, res) => {
  const octokit = getOctokitForRequest(req);
  if (!octokit) {
    res.status(401).json({ error: 'GitHub not authenticated' });
    return;
  }
  const { owner, repo, issueNumber } = req.body as { owner?: string; repo?: string; issueNumber?: number };
  if (!owner || !repo || !issueNumber) {
    res.status(400).json({ error: 'Missing owner, repo, or issueNumber' });
    return;
  }
  try {
    // Fetch the issue
    const { data: issue } = await octokit.rest.issues.get({ owner, repo, issue_number: issueNumber });
    const sessionName = issue.title || `Issue #${issueNumber}`;
    const repoUrl = `https://github.com/${owner}/${repo}.git`;

    // Create session
    const session = sessionManager.create(sessionName);

    // Clone the repo
    try {
      const { simpleGit } = await import('simple-git');
      await simpleGit().clone(repoUrl, session.workspacePath);
    } catch (cloneErr: any) {
      // Continue even if clone fails – report it
      console.error('Clone error:', cloneErr.message);
    }

    // Post a comment on the issue linking to the session
    try {
      const serverUrl = `http://${HOST}:${PORT}`;
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: `🛠 **MADE Session Created**: [${sessionName}](${serverUrl})\n\nSession ID: \`${session.id}\`\n\nWorking on this issue in [MADE](${serverUrl}).`,
      });
    } catch (commentErr: any) {
      console.error('Comment error:', commentErr.message);
    }

    res.json({ ...session, issueNumber, issueTitle: issue.title });
  } catch (err: any) {
    console.error('Create session from issue error:', err.message);
    res.status(500).json({ error: 'Failed to create session from issue' });
  }
});

// Create session from a GitHub PR
app.post('/api/sessions/from-pr', async (req, res) => {
  const octokit = getOctokitForRequest(req);
  if (!octokit) {
    res.status(401).json({ error: 'GitHub not authenticated' });
    return;
  }
  const { owner, repo, prNumber } = req.body as { owner?: string; repo?: string; prNumber?: number };
  if (!owner || !repo || !prNumber) {
    res.status(400).json({ error: 'Missing owner, repo, or prNumber' });
    return;
  }
  try {
    // Fetch the PR
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
    const sessionName = pr.title || `PR #${prNumber}`;
    const repoUrl = `https://github.com/${owner}/${repo}.git`;

    // Create session
    const session = sessionManager.create(sessionName);

    // Clone the repo
    try {
      const { simpleGit } = await import('simple-git');
      await simpleGit().clone(repoUrl, session.workspacePath);
    } catch (cloneErr: any) {
      console.error('Clone error:', cloneErr.message);
    }

    // Post a comment on the PR linking to the session
    try {
      const serverUrl = `http://${HOST}:${PORT}`;
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber, // PR comments use the issues API
        body: `🛠 **MADE Session Created**: [${sessionName}](${serverUrl})\n\nSession ID: \`${session.id}\`\n\nReviewing this PR in [MADE](${serverUrl}).`,
      });
    } catch (commentErr: any) {
      console.error('Comment error:', commentErr.message);
    }

    res.json({ ...session, prNumber, prTitle: pr.title });
  } catch (err: any) {
    console.error('Create session from PR error:', err.message);
    res.status(500).json({ error: 'Failed to create session from PR' });
  }
});

// List sessions
app.get('/api/sessions', (_req, res) => {
  const sessions = sessionManager.list();
  res.json(sessions);
});

// Create session
app.post('/api/sessions', async (req, res) => {
  const { name, repoUrl } = req.body as { name?: string; repoUrl?: string };
  const session = sessionManager.create(name);

  // Create container if Docker is enabled
  if (dockerEnabled) {
    try {
      await containerManager.create(session.id, session.workspacePath);
    } catch (err) {
      console.error('Container creation failed:', err);
    }
  }

  if (repoUrl) {
    // Clone the repo into the workspace
    import('simple-git').then(({ simpleGit }) => {
      simpleGit().clone(repoUrl, session.workspacePath).then(() => {
        res.json(session);
      }).catch((err: Error) => {
        res.json({ ...session, cloneError: err.message });
      });
    });
  } else {
    // Auto-init a git repo in the workspace
    gitManager
      .init(session.id)
      .then(() => {
        res.json(session);
      })
      .catch(() => {
        res.json(session);
      });
  }
});

// Get session details
app.get('/api/sessions/:id', (req, res) => {
  const session = sessionManager.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

// Get message history
app.get('/api/sessions/:id/messages', (req, res) => {
  const limit = parseInt(req.query.limit as string, 10) || 100;
  const messages = sessionManager.getMessages(req.params.id, limit);
  res.json(messages);
});

// Fork a session
app.post('/api/sessions/:id/fork', async (req, res) => {
  const sourceSession = sessionManager.get(req.params.id);
  if (!sourceSession) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const { name, prompt } = req.body as { name?: string; prompt?: string };
  const forkName = name || `Fork of ${sourceSession.name}`;

  // Create the new session
  const newSession = sessionManager.create(forkName);

  try {
    // Copy the entire workspace directory from source to the new session
    fs.cpSync(sourceSession.workspacePath, newSession.workspacePath, { recursive: true, force: true });
  } catch (err: any) {
    console.error('Fork workspace copy error:', err.message);
  }

  // If a prompt is provided, store it as the first system message
  if (prompt) {
    sessionManager.addMessage(newSession.id, 'system', prompt, 'system');
  }

  // Initialize git in the new workspace
  try {
    await gitManager.init(newSession.id);
  } catch {
    // Continue even if git init fails
  }

  res.json(newSession);
});

// Delete a session
app.delete('/api/sessions/:id', async (req, res) => {
  const session = sessionManager.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  // Stop container if Docker is enabled
  if (dockerEnabled && containerManager.hasContainer(req.params.id)) {
    await containerManager.stop(req.params.id);
  }
  sessionManager.close(req.params.id);
  res.json({ success: true });
});

// Docker status
app.get('/api/docker/status', async (_req, res) => {
  const available = await containerManager.isAvailable();
  res.json({
    available,
    enabled: dockerEnabled,
    containers: containerManager.containerCount,
  });
});

// Server config (agent command, etc.)
app.get('/api/config', (_req, res) => {
  res.json({
    agentCmd: AGENT_CMD || '',
    hasAgent: AGENT_CMD !== '',
  });
});

// Docker toggle
app.post('/api/docker/toggle', async (req, res) => {
  const { enabled } = req.body as { enabled?: boolean };
  const available = await containerManager.isAvailable();
  if (!available) {
    res.status(400).json({ error: 'Docker is not available on this system' });
    return;
  }
  dockerEnabled = enabled ?? !dockerEnabled;
  res.json({ enabled: dockerEnabled });
});

// File upload
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  const url = `/uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.originalname });
});

// Serve uploaded files
app.use('/uploads', express.static(UPLOADS_DIR));

// Dashboard suggestions endpoint
app.get('/api/dashboard/suggestions', async (_req, res) => {
  const sessions = sessionManager.list();
  const suggestions: Array<{ text: string; action: { type: string; sessionId?: string } }> = [];
  let activeAgents = 0;
  let recentCommits = 0;

  if (sessions.length === 0) {
    suggestions.push({ text: 'Create your first session to get started', action: { type: 'create_session' } });
    res.json({ summary: 'No sessions yet', suggestions, stats: { totalSessions: 0, activeAgents: 0, recentCommits: 0 } });
    return;
  }

  const now = Date.now();
  const oneHour = 3600000;
  const oneDay = 86400000;

  for (const session of sessions) {
    const messages = sessionManager.getMessages(session.id, 10);
    const lastActivity = session.updatedAt;
    const timeSinceActivity = now - lastActivity;

    // Check for running agents
    const agentList = agentManager.listAgents(session.id);
    const runningAgents = agentList.filter(a => a.running);
    activeAgents += runningAgents.length;

    // Check for recent activity (within last hour)
    if (timeSinceActivity < oneHour && messages.length > 0) {
      suggestions.push({
        text: `Resume working on ${session.name}`,
        action: { type: 'navigate_session', sessionId: session.id },
      });
    }

    // Check for idle agents
    if (runningAgents.length === 0 && session.status === 'active' && timeSinceActivity > oneHour && timeSinceActivity < oneDay) {
      suggestions.push({
        text: `Check on agent in ${session.name}`,
        action: { type: 'navigate_session', sessionId: session.id },
      });
    }

    // Check for uncommitted changes via git status
    try {
      const gitStatus = await gitManager.status(session.id);
      if (gitStatus.modified.length > 0 || gitStatus.untracked.length > 0) {
        suggestions.push({
          text: `Review changes in ${session.name}`,
          action: { type: 'navigate_session', sessionId: session.id },
        });
      }
    } catch {
      // Git may not be initialized for this session – skip
    }

    // Count recent commits
    try {
      const commits = await gitManager.log(session.id, 50);
      recentCommits += commits.filter(c => {
        const commitDate = new Date(c.date).getTime();
        return now - commitDate < oneDay;
      }).length;
    } catch {
      // Git log may fail – skip
    }
  }

  const summary = `${sessions.length} session${sessions.length !== 1 ? 's' : ''}, ${activeAgents} active agent${activeAgents !== 1 ? 's' : ''}, ${recentCommits} recent commit${recentCommits !== 1 ? 's' : ''}`;

  res.json({
    summary,
    suggestions: suggestions.slice(0, 10),
    stats: {
      totalSessions: sessions.length,
      activeAgents,
      recentCommits,
    },
  });
});

// SPA fallback – serve index.html for unknown routes
app.get('*', (_req, res) => {
  const indexFile = path.join(STATIC_DIR, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ------------------------------------------------------------------
// HTTP + WebSocket server
// ------------------------------------------------------------------

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

const handleWS = createWSHandler({
  sessionManager,
  agentManager,
  terminalManager,
  fileManager,
  gitManager,
  containerManager,
  dockerEnabled: () => dockerEnabled,
  authToken: AUTH_TOKEN,
});

wss.on('connection', handleWS);

// ------------------------------------------------------------------
// Start
// ------------------------------------------------------------------

server.listen(PORT, HOST, () => {
  console.log(`\n  🛠  MADE server running at http://${HOST}:${PORT}`);
  console.log(`     Project dir : ${PROJECT_DIR}`);
  console.log(`     Agent cmd   : ${AGENT_CMD}`);
  console.log(`     Auth token  : ${AUTH_TOKEN ? '✓ (enabled)' : '✗ (open)'}`);
  console.log(`     GitHub auth : ${GITHUB_AUTH_ENABLED ? '✓ (enabled)' : '✗ (disabled)'}`);
  console.log(`     Static dir  : ${STATIC_DIR}\n`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✗ Port ${PORT} is already in use. Set MADE_PORT to a different port.\n`);
    process.exit(1);
  } else {
    throw err;
  }
});
