// ============================================================
// MADE – Server Entry Point
// ============================================================

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { WebSocketServer } from 'ws';
import multer from 'multer';
import { v4 as uuid } from 'uuid';

import { SessionManager } from './services/SessionManager.js';
import { AgentManager } from './services/AgentManager.js';
import { TerminalManager } from './services/TerminalManager.js';
import { FileManager } from './services/FileManager.js';
import { GitManager } from './services/GitManager.js';
import { createWSHandler } from './websocket/handler.js';

// ------------------------------------------------------------------
// Environment
// ------------------------------------------------------------------

const PORT = parseInt(process.env.MADE_PORT ?? '3000', 10);
const HOST = process.env.MADE_HOST ?? '0.0.0.0';
const AUTH_TOKEN = process.env.MADE_TOKEN; // optional
const PROJECT_DIR =
  process.env.MADE_PROJECT_DIR ?? process.cwd();
const AGENT_CMD = process.env.MADE_AGENT_CMD ?? 'claude';

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

// ------------------------------------------------------------------
// Express app
// ------------------------------------------------------------------

const app = express();
app.use(express.json());

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
// REST API routes
// ------------------------------------------------------------------

// List sessions
app.get('/api/sessions', (_req, res) => {
  const sessions = sessionManager.list();
  res.json(sessions);
});

// Create session
app.post('/api/sessions', (req, res) => {
  const { name, repoUrl } = req.body as { name?: string; repoUrl?: string };
  const session = sessionManager.create(name);

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

// Delete a session
app.delete('/api/sessions/:id', (req, res) => {
  const session = sessionManager.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  sessionManager.close(req.params.id);
  res.json({ success: true });
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
