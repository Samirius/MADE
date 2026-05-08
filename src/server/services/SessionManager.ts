// ============================================================
// MADE – SessionManager
// Manages the lifecycle of development sessions.
// ============================================================

import { v4 as uuid } from 'uuid';
import path from 'node:path';
import fs from 'node:fs';
import type {
  Session,
  Message,
  PlanStep,
  SessionStatus,
  MessageType,
} from '../../shared/types.js';

/** Internal bookkeeping kept per session (not exposed to clients). */
interface SessionState {
  session: Session;
  users: Set<string>;
  messages: Message[];
  plan: PlanStep[] | null;
}

const MAX_MESSAGES = 1000;

export class SessionManager {
  private sessions = new Map<string, SessionState>();
  private sessionsDir: string;

  constructor(projectDir: string) {
    this.sessionsDir = path.join(projectDir, '.sessions');
    fs.mkdirSync(this.sessionsDir, { recursive: true });
  }

  // ------------------------------------------------------------------
  // CRUD
  // ------------------------------------------------------------------

  /** Create a new session with its own workspace & git branch. */
  create(name?: string): Session {
    const id = uuid();
    const workspacePath = path.join(this.sessionsDir, id);
    const branch = `session/${id}`;

    fs.mkdirSync(workspacePath, { recursive: true });

    const now = Date.now();
    const session: Session = {
      id,
      name: name ?? `Session ${id.slice(0, 8)}`,
      branch,
      workspacePath,
      createdAt: now,
      updatedAt: now,
      status: 'active',
    };

    this.sessions.set(id, {
      session,
      users: new Set(),
      messages: [],
      plan: null,
    });

    return session;
  }

  /** Retrieve a session by id. */
  get(id: string): Session | undefined {
    return this.sessions.get(id)?.session;
  }

  /** List all sessions (including closed). */
  list(): Session[] {
    return Array.from(this.sessions.values()).map((s) => s.session);
  }

  // ------------------------------------------------------------------
  // Membership
  // ------------------------------------------------------------------

  /** Add a user to the session. Returns false if session not found. */
  join(id: string, userId: string): boolean {
    const state = this.sessions.get(id);
    if (!state) return false;
    state.users.add(userId);
    state.session.updatedAt = Date.now();
    state.session.status = 'active';
    return true;
  }

  /** Remove a user from the session. */
  leave(id: string, userId: string): void {
    const state = this.sessions.get(id);
    if (!state) return;
    state.users.delete(userId);
    state.session.updatedAt = Date.now();
    if (state.users.size === 0) {
      state.session.status = 'idle';
    }
  }

  /** Get the set of user IDs currently in the session. */
  getUsers(id: string): Set<string> | undefined {
    return this.sessions.get(id)?.users;
  }

  // ------------------------------------------------------------------
  // Messages
  // ------------------------------------------------------------------

  /** Append a message to the session history. */
  addMessage(
    sessionId: string,
    userId: string,
    content: string,
    type: MessageType,
    metadata?: Record<string, unknown>,
  ): Message | undefined {
    const state = this.sessions.get(sessionId);
    if (!state) return undefined;

    const msg: Message = {
      id: uuid(),
      sessionId,
      userId,
      content,
      type,
      timestamp: Date.now(),
      metadata,
    };

    state.messages.push(msg);

    // Enforce max message limit (FIFO eviction)
    if (state.messages.length > MAX_MESSAGES) {
      state.messages = state.messages.slice(-MAX_MESSAGES);
    }

    state.session.updatedAt = Date.now();
    return msg;
  }

  /** Get recent messages for a session. */
  getMessages(sessionId: string, limit = 100): Message[] {
    const state = this.sessions.get(sessionId);
    if (!state) return [];
    return state.messages.slice(-limit);
  }

  // ------------------------------------------------------------------
  // Plan
  // ------------------------------------------------------------------

  /** Replace the entire plan for a session. */
  setPlan(sessionId: string, steps: PlanStep[]): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.plan = steps;
    state.session.updatedAt = Date.now();
  }

  /** Update a single step within the plan. */
  updatePlanStep(
    sessionId: string,
    stepId: string,
    update: Partial<Pick<PlanStep, 'status' | 'description' | 'output'>>,
  ): void {
    const state = this.sessions.get(sessionId);
    if (!state || !state.plan) return;

    const step = state.plan.find((s) => s.id === stepId);
    if (!step) return;

    if (update.status !== undefined) step.status = update.status;
    if (update.description !== undefined) step.description = update.description;
    if (update.output !== undefined) step.output = update.output;

    state.session.updatedAt = Date.now();
  }

  /** Get the current plan (or null). */
  getPlan(sessionId: string): PlanStep[] | null {
    return this.sessions.get(sessionId)?.plan ?? null;
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  /** Close a session – marks it closed, keeps data on disk. */
  close(id: string): void {
    const state = this.sessions.get(id);
    if (!state) return;
    state.session.status = 'closed' as SessionStatus;
    state.session.updatedAt = Date.now();
    state.users.clear();
  }

  /** Resolve the workspace path for a session. */
  getWorkspacePath(id: string): string | undefined {
    return this.sessions.get(id)?.session.workspacePath;
  }
}
