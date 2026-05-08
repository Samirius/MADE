// ============================================================
// MADE – WebSocket Handler
// Handles all real-time WebSocket communication.
// ============================================================

import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { v4 as uuid } from 'uuid';
import { WSEventType } from '../../shared/types.js';
import type { WSMessage, PlanStepStatus } from '../../shared/types.js';
import type { SessionManager } from '../services/SessionManager.js';
import type { AgentManager } from '../services/AgentManager.js';
import type { TerminalManager } from '../services/TerminalManager.js';
import type { FileManager } from '../services/FileManager.js';
import type { GitManager } from '../services/GitManager.js';

/** Bundle of all backend services passed to the handler. */
export interface Services {
  sessionManager: SessionManager;
  agentManager: AgentManager;
  terminalManager: TerminalManager;
  fileManager: FileManager;
  gitManager: GitManager;
  authToken?: string;
}

interface Client {
  ws: WebSocket;
  userId: string;
  sessionId?: string;
}

export class WSHandler {
  private clients = new Map<string, Client>();
  private services: Services;

  constructor(services: Services) {
    this.services = services;

    // Forward agent output to the relevant session clients
    this.services.agentManager.on(
      'output',
      (sessionId: string, data: string) => {
        this.broadcastToSession(sessionId, {
          type: WSEventType.AgentOutput,
          payload: { data },
          sessionId,
        });
      },
    );

    this.services.agentManager.on(
      'exit',
      (sessionId: string, code: number) => {
        this.broadcastToSession(sessionId, {
          type: WSEventType.AgentStop,
          payload: { exitCode: code },
          sessionId,
        });
      },
    );

    this.services.agentManager.on(
      'error',
      (sessionId: string, error: Error) => {
        this.broadcastToSession(sessionId, {
          type: WSEventType.AgentStop,
          payload: { error: error.message },
          sessionId,
        });
      },
    );

    // Forward terminal output to the relevant session clients
    this.services.terminalManager.on(
      'output',
      (sessionId: string, data: string) => {
        this.broadcastToSession(sessionId, {
          type: WSEventType.TerminalOutput,
          payload: { data },
          sessionId,
        });
      },
    );

    this.services.terminalManager.on(
      'exit',
      (sessionId: string, exitCode: number) => {
        this.broadcastToSession(sessionId, {
          type: WSEventType.TerminalOutput,
          payload: { data: `\r\n[Terminal exited with code ${exitCode}]\r\n` },
          sessionId,
        });
      },
    );
  }

  // ------------------------------------------------------------------
  // Connection handler
  // ------------------------------------------------------------------

  handleConnection(ws: WebSocket, req: IncomingMessage): void {
    // ---- Auth ----
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const token = url.searchParams.get('token');

    if (this.services.authToken && token !== this.services.authToken) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    // Identify user
    const userId =
      url.searchParams.get('userId') ?? `guest-${uuid().slice(0, 8)}`;

    const client: Client = { ws, userId };
    this.clients.set(userId, client);

    // Send the user their id
    this.send(ws, {
      type: WSEventType.UserJoin,
      payload: { userId },
      userId,
    });

    ws.on('message', (raw: Buffer) => {
      try {
        const msg: WSMessage = JSON.parse(raw.toString('utf-8'));
        this.route(client, msg);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      this.clients.delete(userId);
      if (client.sessionId) {
        this.services.sessionManager.leave(client.sessionId, userId);
        this.broadcastToSession(client.sessionId, {
          type: WSEventType.UserLeave,
          payload: { userId },
          sessionId: client.sessionId,
        });
      }
    });
  }

  // ------------------------------------------------------------------
  // Message routing
  // ------------------------------------------------------------------

  private route(client: Client, msg: WSMessage): void {
    const { sessionManager, agentManager, terminalManager, fileManager, gitManager } =
      this.services;

    switch (msg.type) {
      // ---- Chat ----
      case WSEventType.ChatMessage: {
        const { sessionId, content, type, metadata } = msg.payload as {
          sessionId: string;
          content: string;
          type?: string;
          metadata?: Record<string, unknown>;
        };
        const message = sessionManager.addMessage(
          sessionId,
          client.userId,
          content,
          (type as 'text' | 'image' | 'diff' | 'plan' | 'system') ?? 'text',
          metadata,
        );
        if (message) {
          this.broadcastToSession(sessionId, {
            type: WSEventType.ChatMessage,
            payload: message,
            sessionId,
            userId: client.userId,
          });
        }
        break;
      }

      case WSEventType.ChatEdit: {
        // For future use – broadcast the edit intent
        this.broadcastToSession((msg.payload as { sessionId: string }).sessionId, msg);
        break;
      }

      case WSEventType.ChatDelete: {
        this.broadcastToSession((msg.payload as { sessionId: string }).sessionId, msg);
        break;
      }

      // ---- Session ----
      case WSEventType.SessionCreate: {
        const { name } = msg.payload as { name?: string };
        const session = sessionManager.create(name);
        this.send(client.ws, {
          type: WSEventType.SessionCreate,
          payload: session,
          userId: client.userId,
        });
        break;
      }

      case WSEventType.SessionJoin: {
        const { sessionId } = msg.payload as { sessionId: string };
        client.sessionId = sessionId;
        const joined = sessionManager.join(sessionId, client.userId);
        if (joined) {
          this.broadcastToSession(sessionId, {
            type: WSEventType.UserJoin,
            payload: { userId: client.userId },
            sessionId,
          });
        }
        break;
      }

      case WSEventType.SessionLeave: {
        const { sessionId } = msg.payload as { sessionId: string };
        sessionManager.leave(sessionId, client.userId);
        client.sessionId = undefined;
        this.broadcastToSession(sessionId, {
          type: WSEventType.UserLeave,
          payload: { userId: client.userId },
          sessionId,
        });
        break;
      }

      case WSEventType.SessionList: {
        const sessions = sessionManager.list();
        this.send(client.ws, {
          type: WSEventType.SessionList,
          payload: sessions,
          userId: client.userId,
        });
        break;
      }

      // ---- Terminal ----
      case WSEventType.TerminalCreate: {
        const { sessionId } = msg.payload as { sessionId: string };
        if (!terminalManager.has(sessionId)) {
          terminalManager.create(sessionId).catch(() => {});
        }
        break;
      }

      case WSEventType.TerminalInput: {
        const { sessionId, data } = msg.payload as {
          sessionId: string;
          data: string;
        };
        // Auto-create terminal if it doesn't exist yet
        if (!terminalManager.has(sessionId)) {
          terminalManager.create(sessionId).catch(() => {});
        }
        terminalManager.write(sessionId, data);
        break;
      }

      case WSEventType.TerminalResize: {
        const { sessionId, cols, rows } = msg.payload as {
          sessionId: string;
          cols: number;
          rows: number;
        };
        terminalManager.resize(sessionId, cols, rows);
        break;
      }

      // ---- Files ----
      case WSEventType.FileList: {
        const { sessionId, dirPath } = msg.payload as {
          sessionId: string;
          dirPath?: string;
        };
        const files = fileManager.list(sessionId, dirPath);
        this.send(client.ws, {
          type: WSEventType.FileList,
          payload: { files },
          sessionId,
          userId: client.userId,
        });
        break;
      }

      case WSEventType.FileRead: {
        const { sessionId, filePath } = msg.payload as {
          sessionId: string;
          filePath: string;
        };
        const content = fileManager.read(sessionId, filePath);
        this.send(client.ws, {
          type: WSEventType.FileRead,
          payload: { filePath, content },
          sessionId,
          userId: client.userId,
        });
        break;
      }

      case WSEventType.FileWrite: {
        const { sessionId, filePath, content } = msg.payload as {
          sessionId: string;
          filePath: string;
          content: string;
        };
        fileManager.write(sessionId, filePath, content);
        this.broadcastToSession(sessionId, {
          type: WSEventType.FileChange,
          payload: { filePath, event: 'change' },
          sessionId,
        });
        break;
      }

      // ---- Git ----
      case WSEventType.GitStatus: {
        const { sessionId } = msg.payload as { sessionId: string };
        gitManager
          .status(sessionId)
          .then((status) => {
            this.send(client.ws, {
              type: WSEventType.GitStatus,
              payload: status,
              sessionId,
              userId: client.userId,
            });
          })
          .catch(() => {});
        break;
      }

      case WSEventType.GitDiff: {
        const { sessionId, filePath } = msg.payload as {
          sessionId: string;
          filePath?: string;
        };
        gitManager
          .diff(sessionId, filePath)
          .then((diff) => {
            this.send(client.ws, {
              type: WSEventType.GitDiff,
              payload: { diff },
              sessionId,
              userId: client.userId,
            });
          })
          .catch(() => {});
        break;
      }

      case WSEventType.GitCommit: {
        const { sessionId, message, author } = msg.payload as {
          sessionId: string;
          message: string;
          author?: string;
        };
        gitManager
          .commit(sessionId, message, author)
          .then(() => {
            this.broadcastToSession(sessionId, {
              type: WSEventType.Activity,
              payload: { action: 'commit', message },
              sessionId,
            });
          })
          .catch(() => {});
        break;
      }

      case WSEventType.GitBranch: {
        const { sessionId } = msg.payload as { sessionId: string };
        gitManager
          .branch(sessionId)
          .then((branches) => {
            this.send(client.ws, {
              type: WSEventType.GitBranch,
              payload: branches,
              sessionId,
              userId: client.userId,
            });
          })
          .catch(() => {});
        break;
      }

      // ---- Agent ----
      case WSEventType.AgentStart: {
        const { sessionId, config } = msg.payload as {
          sessionId: string;
          config: { cmd: string; args?: string[]; env?: Record<string, string> };
        };
        const workspace = sessionManager.getWorkspacePath(sessionId);
        if (workspace) {
          agentManager.spawn(sessionId, workspace, config);
        }
        break;
      }

      case WSEventType.AgentStop: {
        const { sessionId } = msg.payload as { sessionId: string };
        agentManager.stop(sessionId);
        break;
      }

      // ---- Plan ----
      case WSEventType.PlanCreate: {
        const { sessionId, steps } = msg.payload as {
          sessionId: string;
          steps: Array<{
            id: string;
            description: string;
            status: PlanStepStatus;
            output?: string;
          }>;
        };
        sessionManager.setPlan(sessionId, steps);
        this.broadcastToSession(sessionId, {
          type: WSEventType.PlanCreate,
          payload: { steps },
          sessionId,
        });
        break;
      }

      case WSEventType.PlanUpdate: {
        const { sessionId, stepId, update } = msg.payload as {
          sessionId: string;
          stepId: string;
          update: { status?: PlanStepStatus; description?: string; output?: string };
        };
        sessionManager.updatePlanStep(sessionId, stepId, update);
        this.broadcastToSession(sessionId, {
          type: WSEventType.PlanUpdate,
          payload: { stepId, update },
          sessionId,
        });
        break;
      }

      // ---- Diff / Preview / Activity (broadcast as-is) ----
      case WSEventType.DiffShow:
      case WSEventType.PreviewUrl:
      case WSEventType.Activity: {
        if (msg.sessionId) {
          this.broadcastToSession(msg.sessionId, msg);
        }
        break;
      }

      default:
        // Unknown event type – ignore
        break;
    }
  }

  // ------------------------------------------------------------------
  // Broadcast helpers
  // ------------------------------------------------------------------

  /** Send a message to a single WebSocket. */
  private send(ws: WebSocket, msg: WSMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  /** Send a message to every client currently in a session. */
  private broadcastToSession(sessionId: string, msg: WSMessage): void {
    const users = this.services.sessionManager.getUsers(sessionId);
    if (!users) return;

    const payload = JSON.stringify(msg);
    for (const userId of users) {
      const client = this.clients.get(userId);
      if (client && client.ws.readyState === client.ws.OPEN) {
        client.ws.send(payload);
      }
    }
  }
}

/**
 * Convenience factory – creates a WSHandler and returns the
 * handleConnection method bound to it.
 */
export function createWSHandler(services: Services): (
  ws: WebSocket,
  req: IncomingMessage,
) => void {
  const handler = new WSHandler(services);
  return handler.handleConnection.bind(handler);
}
