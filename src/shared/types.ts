// ============================================================
// MADE – Shared TypeScript Types
// ============================================================

/** Status of a development session. */
export type SessionStatus = 'active' | 'idle' | 'closed';

/** A single development session (one workspace, one branch). */
export interface Session {
  id: string;
  name: string;
  branch: string;
  workspacePath: string;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
}

/** Message type discriminator. */
export type MessageType = 'text' | 'image' | 'diff' | 'plan' | 'system';

/** A chat / activity message inside a session. */
export interface Message {
  id: string;
  sessionId: string;
  userId: string;
  content: string;
  type: MessageType;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** A connected user (human or agent). */
export interface User {
  id: string;
  name: string;
  avatar?: string;
  isAgent: boolean;
}

/** Configuration used to spawn an agent subprocess. */
export interface AgentConfig {
  cmd: string;
  args?: string[];
  env?: Record<string, string>;
}

/** A node in the virtual file-tree (file or directory). */
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  size?: number;
  modified?: Date;
}

/** Status of a single plan step. */
export type PlanStepStatus = 'pending' | 'in_progress' | 'done' | 'failed';

/** One step inside an execution plan. */
export interface PlanStep {
  id: string;
  description: string;
  status: PlanStepStatus;
  output?: string;
}

// ---- WebSocket event types ------------------------------------------------

export const WSEventType = {
  ChatMessage:   'chat:message',
  ChatEdit:      'chat:edit',
  ChatDelete:    'chat:delete',
  SessionCreate: 'session:create',
  SessionJoin:   'session:join',
  SessionLeave:  'session:leave',
  SessionList:   'session:list',
  TerminalCreate: 'terminal:create',
  TerminalOutput:'terminal:output',
  TerminalInput: 'terminal:input',
  TerminalResize:'terminal:resize',
  FileRead:      'file:read',
  FileWrite:     'file:write',
  FileList:      'file:list',
  FileChange:    'file:change',
  GitStatus:     'git:status',
  GitDiff:       'git:diff',
  GitCommit:     'git:commit',
  GitBranch:     'git:branch',
  AgentStart:    'agent:start',
  AgentOutput:   'agent:output',
  AgentStop:     'agent:stop',
  PlanCreate:    'plan:create',
  PlanUpdate:    'plan:update',
  DiffShow:      'diff:show',
  PreviewUrl:    'preview:url',
  UserJoin:      'user:join',
  UserLeave:     'user:leave',
  Activity:      'activity',
} as const;

export type WSEventTypeValue = (typeof WSEventType)[keyof typeof WSEventType];

/** Envelope for every message sent over the WebSocket. */
export interface WSMessage {
  type: WSEventTypeValue;
  payload: unknown;
  sessionId?: string;
  userId?: string;
}

// ---- Git helpers ----------------------------------------------------------

export interface GitStatusResult {
  branch: string;
  staged: string[];
  modified: string[];
  untracked: string[];
}

export interface GitBranchResult {
  current: string;
  branches: string[];
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
}

// ---- Agent status ---------------------------------------------------------

export interface AgentStatus {
  running: boolean;
  pid?: number;
  exitCode?: number | null;
}
