/// <reference types="bun-types" />

// ═══════════════════════════════════════════════════════════
// Ace Workspace — Open-source multiplayer coding agent workspace
// Like Slack + GitHub + Copilot + cloud VMs had a baby
// ═══════════════════════════════════════════════════════════

import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { createBunWebSocket } from "hono/bun-ws";

const { upgradeWebSocket, websocket } = createBunWebSocket();

// ─── Types ───────────────────────────────────────────────
interface Message {
  id: string;
  sessionId: string;
  userId: string;
  userName: string;
  type: "chat" | "agent_start" | "agent_stream" | "agent_done" | "terminal" | "system" | "plan_update" | "pr_created" | "commit";
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface Session {
  id: string;
  name: string;
  branch: string;
  workDir: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  participants: Map<string, { name: string; connected: boolean }>;
  agentRunning: boolean;
  agentPid: number | null;
  lastCommit: string | null;
  summary: string;
}

interface UserProfile {
  id: string;
  name: string;
  avatar: string;
}

// ─── State ───────────────────────────────────────────────
const sessions = new Map<string, Session>();
const connections = new Map<string, any>(); // ws -> { userId, sessionId }
const users = new Map<string, UserProfile>();
const projectDir = process.env.ACE_PROJECT_DIR || process.cwd();

// ─── Helpers ─────────────────────────────────────────────
function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function now(): number {
  return Date.now();
}

function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

function broadcastToSession(sessionId: string, msg: any) {
  const data = JSON.stringify(msg);
  for (const [ws, info] of connections) {
    if (info.sessionId === sessionId) {
      try { ws.send(data); } catch {}
    }
  }
}

function broadcastAll(msg: any) {
  const data = JSON.stringify(msg);
  for (const [ws] of connections) {
    try { ws.send(data); } catch {}
  }
}

// ─── Session Management ──────────────────────────────────
function createSession(name: string, userId: string): Session {
  const id = uid();
  const branch = `ace/${id}-${name.replace(/[^a-z0-9]/gi, "-")}`;

  // Create worktree directory
  const workDir = `${projectDir}/.sessions/${id}`;
  Bun.write(`${workDir}/.gitkeep`, "");

  const session: Session = {
    id,
    name,
    branch,
    workDir,
    createdAt: now(),
    updatedAt: now(),
    messages: [{
      id: uid(),
      sessionId: id,
      userId: "system",
      userName: "Ace",
      type: "system",
      content: `Session "${name}" created. Branch: ${branch}`,
      timestamp: now(),
    }],
    participants: new Map(),
    agentRunning: false,
    agentPid: null,
    lastCommit: null,
    summary: "",
  };

  sessions.set(id, session);
  return session;
}

// ─── Agent Execution ─────────────────────────────────────
async function spawnAgent(sessionId: string, prompt: string, userId: string, model: string = "opus") {
  const session = getSession(sessionId);
  if (!session || session.agentRunning) return;

  session.agentRunning = true;

  // System message
  const startMsg: Message = {
    id: uid(), sessionId, userId: "system", userName: "Ace",
    type: "agent_start", content: prompt, timestamp: now(),
    metadata: { model, triggeredBy: userId },
  };
  session.messages.push(startMsg);
  broadcastToSession(sessionId, { type: "message", message: startMsg });

  // Build command based on available agents
  const agentCmd = process.env.ACE_AGENT_CMD || "claude";
  const modelFlag = model === "opus" ? "--model claude-opus-4-20250514" : "";
  const cmd = `${agentCmd} --dangerously-skip-permissions ${modelFlag} -p "${prompt.replace(/"/g, '\\"')}" --output-format stream-json`;

  try {
    const proc = Bun.spawn(cmd.split(" "), {
      cwd: session.workDir || projectDir,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });
    session.agentPid = proc.pid;

    // Stream output
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const streamMsg: Message = {
          id: uid(), sessionId, userId: "agent", userName: "Agent",
          type: "agent_stream", content: line, timestamp: now(),
        };
        session.messages.push(streamMsg);
        broadcastToSession(sessionId, { type: "message", message: streamMsg });
      }
    }

    await proc.exited;

    const doneMsg: Message = {
      id: uid(), sessionId, userId: "agent", userName: "Agent",
      type: "agent_done", content: `Agent finished (exit code: ${proc.exitCode})`, timestamp: now(),
      metadata: { exitCode: proc.exitCode },
    };
    session.messages.push(doneMsg);
    broadcastToSession(sessionId, { type: "message", message: doneMsg });

  } catch (err: any) {
    const errMsg: Message = {
      id: uid(), sessionId, userId: "system", userName: "Ace",
      type: "agent_done", content: `Agent error: ${err.message}`, timestamp: now(),
    };
    session.messages.push(errMsg);
    broadcastToSession(sessionId, { type: "message", message: errMsg });
  }

  session.agentRunning = false;
  session.agentPid = null;
  session.updatedAt = now();

  // Auto git add + commit
  try {
    const gitAdd = Bun.spawn(["git", "add", "-A"], { cwd: session.workDir || projectDir });
    await gitAdd.exited;
    const gitCommit = Bun.spawn(
      ["git", "commit", "-m", prompt.slice(0, 72), "--no-gpg-sign"],
      { cwd: session.workDir || projectDir, env: { ...process.env, GIT_AUTHOR_NAME: "Ace Agent", GIT_AUTHOR_EMAIL: "ace@sabbk.com", GIT_COMMITTER_NAME: "Ace Agent", GIT_COMMITTER_EMAIL: "ace@sabbk.com" } }
    );
    await gitCommit.exited;
    if (gitCommit.exitCode === 0) {
      session.lastCommit = prompt.slice(0, 72);
      session.summary = prompt.slice(0, 100);
    }
  } catch {}

  broadcastAll({ type: "session_updated", session: sessionToJSON(session) });
}

// ─── Terminal Execution ──────────────────────────────────
async function execInSession(sessionId: string, command: string, userId: string) {
  const session = getSession(sessionId);
  if (!session) return;

  try {
    const proc = Bun.spawn(["bash", "-c", command], {
      cwd: session.workDir || projectDir,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : "");

    const msg: Message = {
      id: uid(), sessionId, userId, userName: users.get(userId)?.name || "User",
      type: "terminal", content: `$ ${command}\n${output}`, timestamp: now(),
      metadata: { exitCode, command },
    };
    session.messages.push(msg);
    broadcastToSession(sessionId, { type: "message", message: msg });
  } catch (err: any) {
    const msg: Message = {
      id: uid(), sessionId, userId, userName: users.get(userId)?.name || "User",
      type: "terminal", content: `$ ${command}\nError: ${err.message}`, timestamp: now(),
    };
    session.messages.push(msg);
    broadcastToSession(sessionId, { type: "message", message: msg });
  }
}

// ─── JSON serialization for sessions ─────────────────────
function sessionToJSON(s: Session) {
  return {
    id: s.id,
    name: s.name,
    branch: s.branch,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    agentRunning: s.agentRunning,
    lastCommit: s.lastCommit,
    summary: s.summary,
    participantCount: s.participants.size,
    messageCount: s.messages.length,
  };
}

// ═══════════════════════════════════════════════════════════
// HTTP API + WebSocket Server
// ═══════════════════════════════════════════════════════════
const app = new Hono();

// ─── Static Files ────────────────────────────────────────
app.use("/static/*", serveStatic({ root: "./" }));

// ─── Health ──────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

// ─── Sessions API ────────────────────────────────────────
app.get("/api/sessions", (c) => {
  const list = Array.from(sessions.values()).map(sessionToJSON);
  return c.json({ sessions: list });
});

app.post("/api/sessions", async (c) => {
  const body = await c.req.json();
  const name = body.name || "New Session";
  const userId = body.userId || "anonymous";
  const session = createSession(name, userId);
  broadcastAll({ type: "session_created", session: sessionToJSON(session) });
  return c.json(sessionToJSON(session));
});

app.get("/api/sessions/:id", (c) => {
  const session = getSession(c.req.param("id"));
  if (!session) return c.json({ error: "Session not found" }, 404);
  return c.json({
    ...sessionToJSON(session),
    messages: session.messages.slice(-200), // last 200 messages
    participants: Array.from(session.participants.entries()).map(([id, p]) => ({ id, ...p })),
  });
});

app.delete("/api/sessions/:id", (c) => {
  const id = c.req.param("id");
  sessions.delete(id);
  broadcastAll({ type: "session_deleted", sessionId: id });
  return c.json({ ok: true });
});

// ─── Messages API ────────────────────────────────────────
app.get("/api/sessions/:id/messages", (c) => {
  const session = getSession(c.req.param("id"));
  if (!session) return c.json({ error: "Session not found" }, 404);
  const since = parseInt(c.req.query("since") || "0");
  const msgs = session.messages.filter(m => m.timestamp > since);
  return c.json({ messages: msgs });
});

// ─── Agent API ───────────────────────────────────────────
app.post("/api/sessions/:id/agent", async (c) => {
  const sessionId = c.req.param("id");
  const body = await c.req.json();
  const { prompt, userId, model } = body;
  if (!prompt) return c.json({ error: "prompt required" }, 400);

  // Non-blocking: spawn agent in background
  spawnAgent(sessionId, prompt, userId || "anonymous", model || "opus");

  return c.json({ ok: true, message: "Agent started" });
});

// ─── Terminal API ────────────────────────────────────────
app.post("/api/sessions/:id/exec", async (c) => {
  const sessionId = c.req.param("id");
  const body = await c.req.json();
  const { command, userId } = body;
  if (!command) return c.json({ error: "command required" }, 400);

  await execInSession(sessionId, command, userId || "anonymous");
  return c.json({ ok: true });
});

// ─── Users API ───────────────────────────────────────────
app.post("/api/users", async (c) => {
  const body = await c.req.json();
  const id = body.id || uid();
  const user: UserProfile = {
    id,
    name: body.name || "Anonymous",
    avatar: body.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${body.name || "A"}`,
  };
  users.set(id, user);
  return c.json(user);
});

app.get("/api/users", (c) => {
  return c.json({ users: Array.from(users.values()) });
});

// ─── WebSocket ───────────────────────────────────────────
app.get("/ws", upgradeWebSocket(() => ({
  onOpen(ws, event) {
    console.log("WebSocket connected");
  },
  onMessage(ws, event) {
    try {
      const data = JSON.parse(event.data.toString());

      switch (data.type) {
        case "join": {
          connections.set(ws as any, { userId: data.userId, sessionId: data.sessionId });
          const session = getSession(data.sessionId);
          if (session) {
            session.participants.set(data.userId, { name: data.userName || "User", connected: true });
            broadcastToSession(data.sessionId, {
              type: "user_joined",
              userId: data.userId,
              userName: data.userName,
            });
          }
          break;
        }
        case "chat": {
          const session = getSession(data.sessionId);
          if (!session) break;
          const msg: Message = {
            id: uid(), sessionId: data.sessionId, userId: data.userId,
            userName: data.userName || "User", type: "chat",
            content: data.content, timestamp: now(),
          };
          session.messages.push(msg);
          broadcastToSession(data.sessionId, { type: "message", message: msg });
          break;
        }
        case "agent_prompt": {
          // Real-time agent prompt from chat
          spawnAgent(data.sessionId, data.prompt, data.userId, data.model);
          break;
        }
        case "terminal": {
          execInSession(data.sessionId, data.command, data.userId);
          break;
        }
      }
    } catch (err) {
      console.error("WS message error:", err);
    }
  },
  onClose(ws) {
    const info = connections.get(ws as any);
    if (info) {
      const session = getSession(info.sessionId);
      if (session) {
        session.participants.set(info.userId, { name: session.participants.get(info.userId)?.name || "User", connected: false });
        broadcastToSession(info.sessionId, { type: "user_left", userId: info.userId });
      }
      connections.delete(ws as any);
    }
  },
})));

// ─── Serve SPA ───────────────────────────────────────────
app.get("/", serveStatic({ path: "./static/index.html" }));

// ═══════════════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════════════
const port = parseInt(process.env.ACE_PORT || "3000");
const host = process.env.ACE_HOST || "0.0.0.0";

console.log(`⚡ Ace Workspace starting on http://${host}:${port}`);

Bun.serve({
  fetch: app.fetch,
  port,
  hostname: host,
  websocket,
});

export default app;
