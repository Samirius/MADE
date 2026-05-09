// ============================================================
// MADE – AgentManager
// Manages agent subprocesses per session (multiple agents per session).
// ============================================================

import { ChildProcess, spawn } from 'node:child_process';
import { v4 as uuid } from 'uuid';
import type { AgentConfig, AgentStatus } from '../../shared/types.js';
import { EventEmitter } from 'node:events';

interface AgentState {
  agentId: string;
  name: string;
  process: ChildProcess;
  config: AgentConfig;
}

export interface AgentInfo {
  agentId: string;
  name: string;
  config: AgentConfig;
  running: boolean;
  pid?: number;
}

export class AgentManager extends EventEmitter {
  /** Outer key = sessionId, inner key = agentId */
  private agents = new Map<string, Map<string, AgentState>>();

  /** Ensure an inner map exists for a session and return it. */
  private getSessionMap(sessionId: string): Map<string, AgentState> {
    let map = this.agents.get(sessionId);
    if (!map) {
      map = new Map();
      this.agents.set(sessionId, map);
    }
    return map;
  }

  /**
   * Spawn an agent CLI as a subprocess inside the session workspace.
   * Returns the agentId (UUID). Emits 'output'(sessionId, agentId, data) and
   * 'exit'(sessionId, agentId, code).
   */
  spawn(
    sessionId: string,
    workspacePath: string,
    config: AgentConfig,
    agentId?: string,
    name?: string,
  ): string {
    const id = agentId || uuid();
    const agentName = name || 'Agent';
    const sessionMap = this.getSessionMap(sessionId);

    // Kill any existing agent with the same agentId for this session
    if (sessionMap.has(id)) {
      this.stop(sessionId, id);
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

    const state: AgentState = { agentId: id, name: agentName, process: child, config };
    sessionMap.set(id, state);

    child.stdout.on('data', (chunk: Buffer) => {
      this.emit('output', sessionId, id, chunk.toString('utf-8'));
    });

    child.stderr.on('data', (chunk: Buffer) => {
      this.emit('output', sessionId, id, chunk.toString('utf-8'));
    });

    child.on('exit', (code) => {
      sessionMap.delete(id);
      this.emit('exit', sessionId, id, code ?? 0);
    });

    child.on('error', (err) => {
      sessionMap.delete(id);
      this.emit('error', sessionId, id, err);
    });

    return id;
  }

  /** Write a string to the agent's stdin. */
  sendInput(sessionId: string, agentId: string, input: string): void {
    const sessionMap = this.agents.get(sessionId);
    if (!sessionMap) return;
    const state = sessionMap.get(agentId);
    if (!state) return;
    state.process.stdin?.write(input);
  }

  /** Kill the agent process for a session + agentId. */
  stop(sessionId: string, agentId: string): void {
    const sessionMap = this.agents.get(sessionId);
    if (!sessionMap) return;
    const state = sessionMap.get(agentId);
    if (!state) return;
    state.process.kill('SIGTERM');
    sessionMap.delete(agentId);
  }

  /** Query the current status of a specific agent for a session. */
  getStatus(sessionId: string, agentId: string): AgentStatus {
    const sessionMap = this.agents.get(sessionId);
    if (!sessionMap) {
      return { running: false };
    }
    const state = sessionMap.get(agentId);
    if (!state) {
      return { running: false };
    }
    return {
      running: true,
      pid: state.process.pid,
      exitCode: state.process.exitCode,
    };
  }

  /** Check whether a specific agent is running for the given session. */
  isRunning(sessionId: string, agentId: string): boolean {
    const sessionMap = this.agents.get(sessionId);
    if (!sessionMap) return false;
    return sessionMap.has(agentId);
  }

  /** List all agents for a session (running and recently registered). */
  listAgents(sessionId: string): AgentInfo[] {
    const sessionMap = this.agents.get(sessionId);
    if (!sessionMap) return [];
    const result: AgentInfo[] = [];
    for (const [agentId, state] of sessionMap) {
      result.push({
        agentId,
        name: state.name,
        config: state.config,
        running: state.process.exitCode === null,
        pid: state.process.pid,
      });
    }
    return result;
  }

  /** Stop all agents for a session. */
  stopAll(sessionId: string): void {
    const sessionMap = this.agents.get(sessionId);
    if (!sessionMap) return;
    for (const [agentId, state] of sessionMap) {
      state.process.kill('SIGTERM');
      sessionMap.delete(agentId);
    }
  }
}
