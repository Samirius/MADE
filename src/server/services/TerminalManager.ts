// ============================================================
// MADE – TerminalManager
// Manages PTY instances per session using node-pty.
// ============================================================

import { EventEmitter } from 'node:events';
import type { SessionManager } from './SessionManager.js';

// We import node-pty dynamically so that the types can be resolved at
// compile-time even when the native addon is not yet built.
import type { IPty } from 'node-pty';

let pty: typeof import('node-pty') | null = null;

async function loadPty(): Promise<typeof import('node-pty')> {
  if (!pty) {
    pty = await import('node-pty');
  }
  return pty;
}

export class TerminalManager extends EventEmitter {
  private terminals = new Map<string, IPty>();
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    super();
    this.sessionManager = sessionManager;
  }

  /**
   * Create a new PTY (bash) inside the session workspace.
   * Emits 'output'(sessionId, data) and 'exit'(sessionId).
   */
  async create(
    sessionId: string,
    cols = 80,
    rows = 24,
  ): Promise<void> {
    // Kill existing terminal if any
    if (this.terminals.has(sessionId)) {
      this.kill(sessionId);
    }

    const workspacePath = this.sessionManager.getWorkspacePath(sessionId);
    if (!workspacePath) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const ptyModule = await loadPty();
    const term = ptyModule.spawn('bash', [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: workspacePath,
      env: process.env as Record<string, string>,
    });

    term.onData((data: string) => {
      this.emit('output', sessionId, data);
    });

    term.onExit(({ exitCode }: { exitCode: number }) => {
      this.terminals.delete(sessionId);
      this.emit('exit', sessionId, exitCode);
    });

    this.terminals.set(sessionId, term);
  }

  /** Write data to the PTY stdin. */
  write(sessionId: string, data: string): void {
    const term = this.terminals.get(sessionId);
    if (!term) return;
    term.write(data);
  }

  /** Resize the PTY. */
  resize(sessionId: string, cols: number, rows: number): void {
    const term = this.terminals.get(sessionId);
    if (!term) return;
    term.resize(cols, rows);
  }

  /** Kill the PTY for a session. */
  kill(sessionId: string): void {
    const term = this.terminals.get(sessionId);
    if (!term) return;
    term.kill();
    this.terminals.delete(sessionId);
  }

  /** Check whether a terminal exists for a session. */
  has(sessionId: string): boolean {
    return this.terminals.has(sessionId);
  }
}
