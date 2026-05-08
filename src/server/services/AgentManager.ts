// ============================================================
// MADE – AgentManager
// Manages agent subprocesses per session.
// ============================================================

import { ChildProcess, spawn } from 'node:child_process';
import type { AgentConfig, AgentStatus } from '../../shared/types.js';
import { EventEmitter } from 'node:events';

interface AgentState {
  process: ChildProcess;
  config: AgentConfig;
}

export class AgentManager extends EventEmitter {
  private agents = new Map<string, AgentState>();

  /**
   * Spawn an agent CLI as a subprocess inside the session workspace.
   * Emits 'output'(sessionId, data) and 'exit'(sessionId, code).
   */
  spawn(
    sessionId: string,
    workspacePath: string,
    config: AgentConfig,
  ): void {
    // Kill any existing agent for this session first
    if (this.agents.has(sessionId)) {
      this.stop(sessionId);
    }

    const mergedEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...config.env,
    };

    const child = spawn(config.cmd, config.args ?? [], {
      cwd: workspacePath,
      env: mergedEnv,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const state: AgentState = { process: child, config };
    this.agents.set(sessionId, state);

    child.stdout.on('data', (chunk: Buffer) => {
      this.emit('output', sessionId, chunk.toString('utf-8'));
    });

    child.stderr.on('data', (chunk: Buffer) => {
      this.emit('output', sessionId, chunk.toString('utf-8'));
    });

    child.on('exit', (code) => {
      this.agents.delete(sessionId);
      this.emit('exit', sessionId, code ?? 0);
    });

    child.on('error', (err) => {
      this.agents.delete(sessionId);
      this.emit('error', sessionId, err);
    });
  }

  /** Write a string to the agent's stdin. */
  sendInput(sessionId: string, input: string): void {
    const state = this.agents.get(sessionId);
    if (!state) return;
    state.process.stdin?.write(input);
  }

  /** Kill the agent process for a session. */
  stop(sessionId: string): void {
    const state = this.agents.get(sessionId);
    if (!state) return;
    state.process.kill('SIGTERM');
    this.agents.delete(sessionId);
  }

  /** Query the current status of the agent for a session. */
  getStatus(sessionId: string): AgentStatus {
    const state = this.agents.get(sessionId);
    if (!state) {
      return { running: false };
    }
    return {
      running: true,
      pid: state.process.pid,
      exitCode: state.process.exitCode,
    };
  }

  /** Check whether an agent is running for the given session. */
  isRunning(sessionId: string): boolean {
    return this.agents.has(sessionId);
  }
}
