// ═══════════════════════════════════════════════════════════
// Ace Workspace — Open-source multiplayer coding agent workspace
// Pure Node.js, zero dependencies
// ═══════════════════════════════════════════════════════════

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import { WebSocketServer } from "ws";
import { execSync, spawn } from "node:child_process";
import { saveSessions, loadSessions, saveUsers, loadUsers } from "./persist.mjs";

// ─── Config ──────────────────────────────────────────────
const PORT = parseInt(process.env.ACE_PORT || "3000");
const HOST = process.env.ACE_HOST || "0.0.0.0";
const PROJECT_DIR = process.env.ACE_PROJECT_DIR || process.cwd();
const AGENT_CMD = process.env.ACE_AGENT_CMD || "claude";

// ─── State ───────────────────────────────────────────────
const sessions = loadSessions();
const users = loadUsers();
const wsClients = new Map(); // ws -> { userId, sessionId }
let saveTimeout = null;
function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => { saveSessions(sessions); saveUsers(users); }, 2000);
}

// ─── Helpers ─────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10); }
function now() { return Date.now(); }
function json(obj, status = 200) { return { status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) }; }

function broadcastToSession(sessionId, msg) {
  const data = JSON.stringify(msg);
  for (const [ws, info] of wsClients) {
    if (info.sessionId === sessionId && ws.readyState === 1) {
      ws.send(data);
    }
  }
}

function broadcastAll(msg) {
  const data = JSON.stringify(msg);
  for (const [ws] of wsClients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

// ─── Session Management ──────────────────────────────────
function createSession(name, userId) {
  const id = uid();
  const branch = `ace/${id}-${name.replace(/[^a-z0-9]/gi, "-")}`;
  const workDir = path.join(PROJECT_DIR, ".sessions", id);
  fs.mkdirSync(workDir, { recursive: true });

  const session = {
    id, name, branch, workDir,
    createdAt: now(), updatedAt: now(),
    messages: [{
      id: uid(), sessionId: id, userId: "system", userName: "Ace",
      type: "system", content: `Session "${name}" created. Branch: ${branch}`,
      timestamp: now(),
    }],
    participants: new Map(),
    agentRunning: false, agentPid: null,
    lastCommit: null, summary: "",
  };
  sessions.set(id, session);
  scheduleSave();
  return session;
}

function sessionToJSON(s) {
  return {
    id: s.id, name: s.name, branch: s.branch,
    createdAt: s.createdAt, updatedAt: s.updatedAt,
    agentRunning: s.agentRunning, lastCommit: s.lastCommit,
    summary: s.summary, participantCount: s.participants.size,
    messageCount: s.messages.length,
  };
}

// ─── Agent Execution ─────────────────────────────────────
function spawnAgent(sessionId, prompt, userId, model = "opus") {
  const session = sessions.get(sessionId);
  if (!session || session.agentRunning) return;

  session.agentRunning = true;
  broadcastAll({ type: "session_updated", session: sessionToJSON(session) });

  const startMsg = {
    id: uid(), sessionId, userId: "system", userName: "Ace",
    type: "agent_start", content: prompt, timestamp: now(),
    metadata: { model, triggeredBy: userId },
  };
  session.messages.push(startMsg);
  broadcastToSession(sessionId, { type: "message", message: startMsg });

  // Build agent command
  const modelFlags = {
    opus: "--model claude-opus-4-20250514",
    sonnet: "--model claude-sonnet-4-20250514",
    haiku: "--model claude-haiku-4-20250514",
  };
  const modelFlag = modelFlags[model] || "";
  const safePrompt = prompt.replace(/"/g, '\\"').replace(/`/g, "\\`");

  let cmd, args;
  if (AGENT_CMD === "claude") {
    args = ["--dangerously-skip-permissions", ...modelFlag.split(" "), "-p", prompt, "--output-format", "stream-json"];
    cmd = "claude";
  } else if (AGENT_CMD === "codex") {
    args = ["--full-auto", prompt];
    cmd = "codex";
  } else if (AGENT_CMD === "opencode") {
    args = ["-p", prompt];
    cmd = "opencode";
  } else {
    args = ["-c", `${AGENT_CMD} ${modelFlag} "${safePrompt}"`];
    cmd = "bash";
  }

  try {
    const proc = spawn(cmd, args, {
      cwd: session.workDir,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    session.agentPid = proc.pid;

    let buffer = "";
    proc.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const streamMsg = {
          id: uid(), sessionId, userId: "agent", userName: "Agent",
          type: "agent_stream", content: line, timestamp: now(),
        };
        session.messages.push(streamMsg);
        broadcastToSession(sessionId, { type: "message", message: streamMsg });
      }
    });

    proc.stderr.on("data", (chunk) => {
      const streamMsg = {
        id: uid(), sessionId, userId: "agent", userName: "Agent",
        type: "agent_stream", content: chunk.toString(), timestamp: now(),
      };
      session.messages.push(streamMsg);
      broadcastToSession(sessionId, { type: "message", message: streamMsg });
    });

    proc.on("close", (code) => {
      const doneMsg = {
        id: uid(), sessionId, userId: "agent", userName: "Agent",
        type: "agent_done", content: `Agent finished (exit: ${code})`, timestamp: now(),
      };
      session.messages.push(doneMsg);
      broadcastToSession(sessionId, { type: "message", message: doneMsg });

      session.agentRunning = false;
      session.agentPid = null;
      session.updatedAt = now();

      // Auto commit
      try {
        execSync("git add -A", { cwd: session.workDir, stdio: "ignore" });
        execSync(`git commit -m ${JSON.stringify(prompt.slice(0, 72))} --no-gpg-sign --allow-empty`, {
          cwd: session.workDir, stdio: "ignore",
          env: { ...process.env, GIT_AUTHOR_NAME: "Ace Agent", GIT_AUTHOR_EMAIL: "ace@sabbk.com", GIT_COMMITTER_NAME: "Ace Agent", GIT_COMMITTER_EMAIL: "ace@sabbk.com" },
        });
        session.lastCommit = prompt.slice(0, 72);
        session.summary = prompt.slice(0, 100);
      } catch {}

      broadcastAll({ type: "session_updated", session: sessionToJSON(session) });
    });
  } catch (err) {
    const errMsg = {
      id: uid(), sessionId, userId: "system", userName: "Ace",
      type: "agent_done", content: `Agent error: ${err.message}`, timestamp: now(),
    };
    session.messages.push(errMsg);
    broadcastToSession(sessionId, { type: "message", message: errMsg });
    session.agentRunning = false;
  }
}

// ─── Terminal ────────────────────────────────────────────
async function execInSession(sessionId, command, userId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  return new Promise((resolve) => {
    execSync(command, {
      cwd: session.workDir,
      timeout: 30000,
      encoding: "utf8",
      env: { ...process.env },
    });
    const output = execSync(command, { cwd: session.workDir, timeout: 30000, encoding: "utf8" }) || "(no output)";
    const msg = {
      id: uid(), sessionId, userId, userName: users.get(userId)?.name || "User",
      type: "terminal", content: `$ ${command}\n${output}`, timestamp: now(),
    };
    session.messages.push(msg);
    broadcastToSession(sessionId, { type: "message", message: msg });
    resolve();
  }).catch((err) => {
    const msg = {
      id: uid(), sessionId, userId, userName: users.get(userId)?.name || "User",
      type: "terminal", content: `$ ${command}\n${err.stdout || ""}\n${err.stderr || err.message}`, timestamp: now(),
    };
    session.messages.push(msg);
    broadcastToSession(sessionId, { type: "message", message: msg });
  });
}

// ─── HTTP Router ─────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

async function handleAPI(req, res, urlPath, method) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const send = (r) => { res.writeHead(r.status, r.headers); res.end(r.body); };

  // Routes
  if (urlPath === "/health" && method === "GET") return send(json({ status: "ok", version: "0.1.0" }));

  if (urlPath === "/api/sessions" && method === "GET") {
    return send(json({ sessions: Array.from(sessions.values()).map(sessionToJSON) }));
  }
  if (urlPath === "/api/sessions" && method === "POST") {
    const body = await parseBody(req);
    const name = body.name || "New Session";
    const s = createSession(name, body.userId || "anon");
    broadcastAll({ type: "session_created", session: sessionToJSON(s) });
    return send(json(sessionToJSON(s)));
  }

  const sessionMatch = urlPath.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionMatch && method === "GET") {
    const s = sessions.get(sessionMatch[1]);
    if (!s) return send(json({ error: "Not found" }, 404));
    return send(json({
      ...sessionToJSON(s),
      messages: s.messages.slice(-200),
      participants: Array.from(s.participants.entries()).map(([id, p]) => ({ id, ...p })),
    }));
  }
  if (sessionMatch && method === "DELETE") {
    sessions.delete(sessionMatch[1]);
    broadcastAll({ type: "session_deleted", sessionId: sessionMatch[1] });
    return send(json({ ok: true }));
  }

  const agentMatch = urlPath.match(/^\/api\/sessions\/([^/]+)\/agent$/);
  if (agentMatch && method === "POST") {
    const body = await parseBody(req);
    if (!body.prompt) return send(json({ error: "prompt required" }, 400));
    spawnAgent(agentMatch[1], body.prompt, body.userId || "anon", body.model || "opus");
    return send(json({ ok: true, message: "Agent started" }));
  }

  const execMatch = urlPath.match(/^\/api\/sessions\/([^/]+)\/exec$/);
  if (execMatch && method === "POST") {
    const body = await parseBody(req);
    if (!body.command) return send(json({ error: "command required" }, 400));
    await execInSession(execMatch[1], body.command, body.userId || "anon");
    return send(json({ ok: true }));
  }

  const messagesMatch = urlPath.match(/^\/api\/sessions\/([^/]+)\/messages$/);
  if (messagesMatch && method === "GET") {
    const s = sessions.get(messagesMatch[1]);
    if (!s) return send(json({ error: "Not found" }, 404));
    return send(json({ messages: s.messages.slice(-200) }));
  }

  if (urlPath === "/api/users" && method === "POST") {
    const body = await parseBody(req);
    const id = body.id || uid();
    const user = { id, name: body.name || "Anonymous", avatar: body.avatar || "" };
    users.set(id, user);
    return send(json(user));
  }
  if (urlPath === "/api/users" && method === "GET") {
    return send(json({ users: Array.from(users.values()) }));
  }

  // ─── File Browser ──────────────────────────────────────
  const filesMatch = urlPath.match(/^\/api\/sessions\/([^/]+)\/files(.*)$/);
  if (filesMatch && method === "GET") {
    const s = sessions.get(filesMatch[1]);
    if (!s) return send(json({ error: "Not found" }, 404));
    const relPath = filesMatch[2] || "/";
    const absPath = path.join(s.workDir, relPath === "/" ? "" : relPath);
    // Security: prevent path traversal
    if (!absPath.startsWith(s.workDir)) return send(json({ error: "Forbidden" }, 403));
    if (!fs.existsSync(absPath)) return send(json({ error: "Not found" }, 404));
    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(absPath).map(name => {
        const p = path.join(absPath, name);
        const st = fs.statSync(p);
        return { name, type: st.isDirectory() ? "dir" : "file", size: st.size, modified: st.mtimeMs };
      });
      return send(json({ path: relPath, entries }));
    } else {
      const ext = path.extname(absPath);
      const types = { ".js": "text/javascript", ".ts": "text/typescript", ".json": "application/json", ".md": "text/markdown", ".html": "text/html", ".css": "text/css", ".py": "text/x-python", ".rs": "text/rust", ".go": "text/go", ".txt": "text/plain" };
      res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
      fs.createReadStream(absPath).pipe(res);
      return;
    }
  }

  // ─── File Write ────────────────────────────────────────
  const fileWriteMatch = urlPath.match(/^\/api\/sessions\/([^/]+)\/files(.*)$/);
  if (fileWriteMatch && method === "PUT") {
    const s = sessions.get(fileWriteMatch[1]);
    if (!s) return send(json({ error: "Not found" }, 404));
    const relPath = fileWriteMatch[2];
    const absPath = path.join(s.workDir, relPath);
    if (!absPath.startsWith(s.workDir)) return send(json({ error: "Forbidden" }, 403));
    const body = await parseBody(req);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, body.content || "");
    return send(json({ ok: true, path: relPath }));
  }

  // ─── Live Preview Proxy ────────────────────────────────
  const previewMatch = urlPath.match(/^\/api\/sessions\/([^/]+)\/preview(.*)$/);
  if (previewMatch && method === "GET") {
    const s = sessions.get(previewMatch[1]);
    if (!s) return send(json({ error: "Not found" }, 404));
    const relPath = previewMatch[2] || "/index.html";
    const absPath = path.join(s.workDir, relPath);
    if (!absPath.startsWith(s.workDir)) return send(json({ error: "Forbidden" }, 403));
    if (!fs.existsSync(absPath)) return send(json({ error: "Preview file not found. Build your project first." }, 404));
    const ext = path.extname(absPath);
    const types = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    fs.createReadStream(absPath).pipe(res);
    return;
  }

  send(json({ error: "Not found" }, 404));
}

// ─── Static Files ────────────────────────────────────────
function serveStatic(req, res, urlPath) {
  const staticDir = path.join(process.cwd(), "static");
  let filePath;
  if (urlPath === "/" || urlPath === "/index.html") {
    filePath = path.join(staticDir, "index.html");
  } else if (urlPath.startsWith("/static/")) {
    filePath = path.join(staticDir, urlPath.replace("/static/", ""));
  } else {
    return false;
  }

  if (!fs.existsSync(filePath)) return false;

  const ext = path.extname(filePath);
  const types = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

// ─── HTTP Server ─────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const urlPath = url.pathname;
  const method = req.method;

  // Static files first
  if (serveStatic(req, res, urlPath)) return;

  // API routes
  if (urlPath.startsWith("/api/") || urlPath === "/health") {
    return handleAPI(req, res, urlPath, method);
  }

  // SPA fallback
  const indexPath = path.join(process.cwd(), "static", "index.html");
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { "Content-Type": "text/html" });
    fs.createReadStream(indexPath).pipe(res);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Ace Workspace - static/index.html not found");
  }
});

// ─── WebSocket Server ────────────────────────────────────
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.type === "join") {
        wsClients.set(ws, { userId: data.userId, sessionId: data.sessionId });
        const session = sessions.get(data.sessionId);
        if (session) {
          session.participants.set(data.userId, { name: data.userName || "User", connected: true });
          broadcastToSession(data.sessionId, { type: "user_joined", userId: data.userId, userName: data.userName });
        }
      }

      if (data.type === "chat") {
        const session = sessions.get(data.sessionId);
        if (!session) return;
        const msg = {
          id: uid(), sessionId: data.sessionId, userId: data.userId,
          userName: data.userName || "User", type: "chat",
          content: data.content, timestamp: now(),
        };
        session.messages.push(msg);
        broadcastToSession(data.sessionId, { type: "message", message: msg });
        scheduleSave();
      }

      if (data.type === "agent_prompt") {
        spawnAgent(data.sessionId, data.prompt, data.userId, data.model || "opus");
      }

      if (data.type === "terminal") {
        execInSession(data.sessionId, data.command, data.userId);
      }
    } catch (err) {
      console.error("WS error:", err);
    }
  });

  ws.on("close", () => {
    const info = wsClients.get(ws);
    if (info) {
      const session = sessions.get(info.sessionId);
      if (session) {
        session.participants.set(info.userId, { name: session.participants.get(info.userId)?.name || "User", connected: false });
        broadcastToSession(info.sessionId, { type: "user_left", userId: info.userId });
      }
      wsClients.delete(ws);
    }
  });
});

// ─── Terminal WebSocket Server ───────────────────────────
const termWss = new WebSocketServer({ noServer: true });
const termSessions = new Map(); // sessionId -> { proc, sockets: Set }

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } else if (url.pathname.startsWith("/term/")) {
    termWss.handleUpgrade(req, socket, head, (ws) => {
      const sessionId = url.pathname.replace("/term/", "");
      ws.sessionId = sessionId;
      termWss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

termWss.on("connection", (ws) => {
  const sessionId = ws.sessionId;
  const session = sessions.get(sessionId);
  if (!session) { ws.close(); return; }

  // Create or reuse PTY
  let termState = termSessions.get(sessionId);
  if (!termState) {
    const proc = spawn("bash", [], {
      cwd: session.workDir,
      env: { ...process.env, TERM: "xterm-256color", PS1: "\\[\\033[01;32m\\]\\$\\[\\033[00m\\] " },
      stdio: ["pipe", "pipe", "pipe"],
    });
    termState = { proc, sockets: new Set() };
    termSessions.set(sessionId, termState);

    proc.stdout.on("data", (data) => {
      const payload = JSON.stringify({ type: "output", data: data.toString() });
      for (const s of termState.sockets) { if (s.readyState === 1) s.send(payload); }
    });
    proc.stderr.on("data", (data) => {
      const payload = JSON.stringify({ type: "output", data: data.toString() });
      for (const s of termState.sockets) { if (s.readyState === 1) s.send(payload); }
    });
    proc.on("close", () => {
      termSessions.delete(sessionId);
      for (const s of termState.sockets) { if (s.readyState === 1) s.close(); }
    });
  }

  termState.sockets.add(ws);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "input" && termState.proc.stdin.writable) {
        termState.proc.stdin.write(msg.data);
      }
      if (msg.type === "resize") {
        // Would need node-pty for proper resize, ignored for now
      }
    } catch {}
  });

  ws.on("close", () => {
    termState.sockets.delete(ws);
    if (termState.sockets.size === 0) {
      termState.proc.kill();
      termSessions.delete(sessionId);
    }
  });
});

// ─── Start ───────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  console.log(`\n  ⚡ Ace Workspace`);
  console.log(`  ─────────────────────────────`);
  console.log(`  http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`  Project: ${PROJECT_DIR}`);
  console.log(`  Agent: ${AGENT_CMD}`);
  console.log(`  ─────────────────────────────\n`);
});
