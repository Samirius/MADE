// ═══════════════════════════════════════════════════════════
// MADE — Persistence Layer
// Simple JSON file store. Sessions survive restarts.
// ═══════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.MADE_DATA_DIR || process.env.ACE_DATA_DIR || path.join(process.cwd(), ".made-data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function saveSessions(sessions) {
  ensureDir();
  const data = {};
  for (const [id, s] of sessions) {
    data[id] = {
      id: s.id, name: s.name, branch: s.branch, workDir: s.workDir,
      createdAt: s.createdAt, updatedAt: s.updatedAt,
      createdBy: s.createdBy || "anon",
      agentRunning: false, // Never persist running state
      lastCommit: s.lastCommit, summary: s.summary,
      messages: s.messages.slice(-500), // Keep last 500 messages
      plan: s.plan || null,
    };
  }
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
}

export function loadSessions() {
  ensureDir();
  if (!fs.existsSync(SESSIONS_FILE)) return new Map();
  try {
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
    const sessions = new Map();
    for (const [id, s] of Object.entries(data)) {
      sessions.set(id, {
        ...s,
        participants: new Map(),
        agentRunning: false,
        agentPid: null,
      });
    }
    return sessions;
  } catch {
    return new Map();
  }
}

export function saveUsers(users) {
  ensureDir();
  const data = {};
  for (const [id, u] of users) { data[id] = u; }
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

export function loadUsers() {
  ensureDir();
  if (!fs.existsSync(USERS_FILE)) return new Map();
  try {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    const users = new Map();
    for (const [id, u] of Object.entries(data)) { users.set(id, u); }
    return users;
  } catch {
    return new Map();
  }
}
