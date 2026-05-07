// ═══════════════════════════════════════════════════════════
// MADE Session Manager — session lifecycle, agent queue, persistence
// ═══════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { saveSessions, loadSessions } from "./persist.mjs";

const PROJECT_DIR = process.env.MADE_PROJECT_DIR || process.env.ACE_PROJECT_DIR || process.cwd();

export class SessionManager {
  constructor() {
    this.sessions = loadSessions();
    this._saveTimeout = null;
  }

  // ─── Helpers ────────────────────────────────────────────
  static uid() { return Math.random().toString(36).slice(2, 10); }
  static now() { return Date.now(); }

  // ─── Persistence ────────────────────────────────────────
  scheduleSave() {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => saveSessions(this.sessions), 2000);
  }

  // ─── CRUD ───────────────────────────────────────────────

  /**
   * Create a new session.
   * @param {string} name - Session name
   * @param {string} userId - Creator user ID
   * @param {object} opts - { workDir, branch }
   * @returns {object} Session object
   */
  create(name, userId, opts = {}) {
    const id = SessionManager.uid();
    const branch = opts.branch || `made/${id}-${name.replace(/[^a-z0-9]/gi, "-")}`;
    const workDir = opts.workDir || path.join(PROJECT_DIR, ".sessions", id);

    fs.mkdirSync(workDir, { recursive: true });

    // Initialize git repo
    try {
      execSync("git init", { cwd: workDir, stdio: "ignore" });
      execSync(`git checkout -b ${branch}`, { cwd: workDir, stdio: "ignore" });
      fs.writeFileSync(path.join(workDir, "README.md"), `# ${name}\n\nMADE session.\n`);
      execSync("git add -A", { cwd: workDir, stdio: "ignore" });
      execSync('git commit -m "init: MADE session" --no-gpg-sign', {
        cwd: workDir, stdio: "ignore",
        env: { ...process.env, GIT_AUTHOR_NAME: "MADE", GIT_AUTHOR_EMAIL: "made@sabbk.com", GIT_COMMITTER_NAME: "MADE", GIT_COMMITTER_EMAIL: "made@sabbk.com" },
      });
    } catch (e) { console.error("Session state save error:", e); }

    const session = {
      id, name, branch, workDir,
      createdAt: SessionManager.now(),
      updatedAt: SessionManager.now(),
      createdBy: userId || "anon",
      messages: [{
        id: SessionManager.uid(), sessionId: id,
        userId: "system", userName: "MADE",
        type: "system", content: `Session "${name}" created. Branch: ${branch}`,
        timestamp: SessionManager.now(),
      }],
      plan: null,
      participants: new Map(),
      agentRunning: false,
      agentPid: null,
      agentQueue: [],
      lastCommit: null,
      summary: "",
    };

    this.sessions.set(id, session);
    this.scheduleSave();
    return session;
  }

  get(id) { return this.sessions.get(id); }

  list() { return Array.from(this.sessions.values()); }

  delete(id) {
    const deleted = this.sessions.delete(id);
    if (deleted) this.scheduleSave();
    return deleted;
  }

  // ─── Serialization ──────────────────────────────────────

  toJSON(session) {
    return {
      id: session.id,
      name: session.name,
      branch: session.branch,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      createdBy: session.createdBy || "anon",
      agentRunning: session.agentRunning,
      lastCommit: session.lastCommit,
      summary: session.summary,
      participantCount: session.participants.size,
      messageCount: session.messages.length,
      hasPlan: !!session.plan,
      queueLength: session.agentQueue?.length || 0,
    };
  }

  // ─── Messages ───────────────────────────────────────────

  addMessage(sessionId, msg) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const message = {
      id: SessionManager.uid(),
      sessionId,
      timestamp: SessionManager.now(),
      ...msg,
    };
    session.messages.push(message);
    this.scheduleSave();
    return message;
  }

  editMessage(sessionId, msgId, updates) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const msg = session.messages.find(m => m.id === msgId);
    if (!msg) return null;
    Object.assign(msg, updates, { editedAt: SessionManager.now() });
    this.scheduleSave();
    return msg;
  }

  deleteMessage(sessionId, msgId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    const idx = session.messages.findIndex(m => m.id === msgId);
    if (idx === -1) return false;
    session.messages.splice(idx, 1);
    this.scheduleSave();
    return true;
  }

  // ─── Agent Queue ────────────────────────────────────────

  enqueueAgent(sessionId, { prompt, userId, model }) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.agentQueue.push({ prompt, userId, model });
  }

  dequeueAgent(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.agentQueue.length === 0) return null;
    return session.agentQueue.shift();
  }

  // ─── Plan ───────────────────────────────────────────────

  setPlan(sessionId, plan, userId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.plan = {
      content: plan.content || "",
      title: plan.title || "Plan",
      updatedAt: SessionManager.now(),
      updatedBy: userId || "anon",
    };
    this.scheduleSave();
    return session.plan;
  }

  deletePlan(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.plan = null;
    this.scheduleSave();
  }

  // ─── Participants ───────────────────────────────────────

  join(sessionId, userId, userName) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.participants.set(userId, { name: userName || "User", connected: true });
  }

  leave(sessionId, userId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const p = session.participants.get(userId);
    if (p) p.connected = false;
  }
}

export default SessionManager;
