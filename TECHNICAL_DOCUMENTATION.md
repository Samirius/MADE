# Ace Workspace — Technical Documentation

## What This Is

Ace Workspace is an open-source, self-hosted, multiplayer coding agent workspace. It provides a web-based environment where multiple users can chat, run coding agents (like Claude Code, Codex, or OpenCode), browse files, execute terminal commands, manage git branches, create plans, and preview output — all within isolated per-session workspaces.

The project is inspired by GitHub Next's "Ace" (Agent Collaboration Environment), as described in Maggie Appleton's talk "One Developer, Two Dozen Agents, Zero Alignment" (2025).

**Repository:** https://github.com/Samirius/ace-workspace  
**License:** Apache 2.0  
**Version:** 0.1.0  
**Branch:** main-hermes  
**Total commits:** 8  

---

## Technology Stack

| Component | Technology | Details |
|---|---|---|
| Runtime | Node.js 22 | Uses ES modules (`"type": "module"`) |
| Server | Node.js built-in `http` module | No framework. Custom HTTP router. |
| WebSocket | `ws` npm package (v8.20.0) | The ONLY npm dependency. |
| Frontend | Vanilla HTML/CSS/JS | No framework, no build step, no bundler. Single HTML file. |
| Persistence | JSON file store | Written to `.ace-data/sessions.json` and `.ace-data/users.json` |
| Containerization | Docker + docker-compose | Dockerfile based on `node:22-slim` |
| Version Control | Git (per session) | Each session gets its own `git init` on creation |

**Dependencies:** Exactly 1 — `ws` (WebSocket implementation for Node.js).

---

## File Structure

```
ace-workspace/
├── src/
│   ├── server.mjs          # 735 lines — Main server. HTTP router, WebSocket handlers,
│   │                         agent spawning, terminal, file browser, git, plan APIs.
│   └── persist.mjs          #  71 lines — JSON file persistence. Save/load sessions and users.
├── static/
│   ├── index.html           # 707 lines — Single-page application. All UI in one file.
│   │                         Dashboard, session chat, terminal, files, git, plan, preview.
│   ├── style.css            # 187 lines — Dark theme. CSS variables for colors.
│   └── terminal.js          #  72 lines — Browser terminal component (AceTerminal class).
├── Dockerfile               #  19 lines — Docker image build.
├── docker-compose.yml       #  16 lines — One-command deployment.
├── package.json             #  13 lines — Project config. 1 dependency.
├── README.md                # 117 lines — User-facing documentation.
├── CONTRIBUTING.md          #  86 lines — Developer guide.
├── .gitignore               #   9 lines
└── LICENSE                  #   7 lines — Apache 2.0 header
```

**Total lines of code (excluding docs/config):** 1,772

---

## Architecture

The server runs a single Node.js process with three network channels:

1. **HTTP Server** (port 3000) — Serves static files and handles REST API requests
2. **WebSocket `/ws`** — Real-time chat, agent streaming, session updates
3. **WebSocket `/term/{sessionId}`** — Interactive bash terminal per session

```
Browser ──HTTP──▶ [Static Files + REST API]
Browser ──WS────▶ [/ws — chat, agent stream, session events]
Browser ──WS────▶ [/term/{id} — interactive bash shell]
```

All state is held in-memory (Maps) and persisted to JSON files on disk with a 2-second debounce.

---

## Core Concept: Sessions

A **session** is the fundamental unit of work. Each session is:

- A **chat channel** with message history (up to 500 messages persisted)
- An **isolated workspace directory** at `.sessions/{id}/`
- A **git repository** initialized on its own branch (`ace/{id}-{name}`)
- Optionally associated with a **plan document**

When a session is created:
1. A unique ID is generated (8 random alphanumeric characters)
2. A directory is created at `.sessions/{id}/`
3. `git init` is run in that directory
4. A branch `ace/{id}-{name}` is created
5. A `README.md` is written and committed as the initial commit
6. A system message "Session '{name}' created. Branch: {branch}" is added

Session data structure (in-memory):
```javascript
{
  id: string,              // e.g. "27x34ypi"
  name: string,            // e.g. "feature/auth"
  branch: string,          // e.g. "ace/27x34ypi-feature-auth"
  workDir: string,         // absolute path to .sessions/{id}/
  createdAt: number,       // Unix timestamp ms
  updatedAt: number,       // Unix timestamp ms
  messages: Array,         // message objects (up to 500 persisted, 200 served via API)
  plan: null | {           // collaborative plan document
    content: string,
    updatedAt: number,
    updatedBy: string,
    title: string
  },
  participants: Map,       // userId -> { name, connected }
  agentRunning: boolean,   // whether an agent process is currently active
  agentPid: number | null, // OS process ID of running agent
  lastCommit: string | null, // last git commit message
  summary: string,         // short summary of last agent action
}
```

---

## REST API Endpoints

All endpoints return JSON. CORS is enabled with `Access-Control-Allow-Origin: *`.

### General

| Method | Path | What It Does |
|---|---|---|
| GET | `/health` | Returns `{"status":"ok","version":"0.1.0"}` |

### Sessions

| Method | Path | Request Body | What It Does |
|---|---|---|---|
| GET | `/api/sessions` | — | Lists all sessions. Returns `{sessions: [...]}` |
| POST | `/api/sessions` | `{name, userId}` | Creates a new session with git init. Returns session object. |
| GET | `/api/sessions/:id` | — | Gets session detail + last 200 messages + participants. |
| DELETE | `/api/sessions/:id` | — | Deletes a session from memory. Does NOT delete workspace files. |

### Agent

| Method | Path | Request Body | What It Does |
|---|---|---|---|
| POST | `/api/sessions/:id/agent` | `{prompt, userId, model}` | Spawns a coding agent. Model can be "opus", "sonnet", or "haiku". Only one agent can run per session at a time. |

### Terminal Execution

| Method | Path | Request Body | What It Does |
|---|---|---|---|
| POST | `/api/sessions/:id/exec` | `{command, userId}` | Runs a shell command synchronously (30s timeout) in the session workspace. Output is posted as a message. |

### Messages

| Method | Path | Request Body | What It Does |
|---|---|---|---|
| GET | `/api/sessions/:id/messages` | — | Returns last 200 messages for a session. |

### Users

| Method | Path | Request Body | What It Does |
|---|---|---|---|
| POST | `/api/users` | `{name, avatar}` | Creates or retrieves a user. ID is auto-generated. |
| GET | `/api/users` | — | Lists all users. |

### File Browser

| Method | Path | Request Body | What It Does |
|---|---|---|---|
| GET | `/api/sessions/:id/files/*` | — | Lists directory contents (returns `{path, entries}`) or serves a file with correct MIME type. Path traversal protection: returns 403 if resolved path escapes workspace. |
| PUT | `/api/sessions/:id/files/*` | `{content}` | Writes content to a file. Creates parent directories if needed. Path traversal protection. |

### Live Preview

| Method | Path | Request Body | What It Does |
|---|---|---|---|
| GET | `/api/sessions/:id/preview/*` | — | Proxies files from the session workspace for iframe embedding. Defaults to `/index.html`. Path traversal protection. |

### Git

| Method | Path | Request Body | What It Does |
|---|---|---|---|
| GET | `/api/sessions/:id/git/status` | — | Returns `{branch, status, log, dirty}`. Runs `git status --porcelain`, `git log --oneline -10`, `git branch --show-current`. |
| GET | `/api/sessions/:id/git/diff` | — | Returns `{diff}`. Runs `git diff HEAD`. 1MB buffer limit. |
| POST | `/api/sessions/:id/git/commit` | `{message, userId}` | Runs `git add -A` then `git commit`. Committed as "Ace Agent <ace@sabbk.com>". |
| POST | `/api/sessions/:id/pr` | `{title, repo, body}` | Auto-commits, then if `repo` URL is provided: adds remote, pushes branch, creates PR via `gh pr create`. Returns PR URL. |

### Plans

| Method | Path | Request Body | What It Does |
|---|---|---|---|
| GET | `/api/sessions/:id/plan` | — | Returns `{plan, hasPlan}`. Plan is null if not created. |
| POST | `/api/sessions/:id/plan` | `{content, userId, title}` | Creates or updates the plan document. Broadcasts `plan_updated` to all connected clients. |
| DELETE | `/api/sessions/:id/plan` | — | Deletes the plan. |
| POST | `/api/sessions/:id/plan/generate` | `{prompt, userId, model}` | Spawns the agent with a prompt asking it to generate a plan based on conversation context. |

**Total: 19 HTTP endpoints** (including health check)

---

## WebSocket Channels

### Channel 1: `/ws` — Main WebSocket

Used for real-time chat, agent streaming, and session lifecycle events.

**Messages sent FROM client TO server:**

| type | Fields | What It Does |
|---|---|---|
| `join` | `{sessionId, userId, userName}` | Joins a session. Registers the user as a participant. |
| `chat` | `{sessionId, userId, userName, content}` | Sends a chat message. If the message starts with `@ace` or `ace,` or `ace:`, it automatically triggers the agent after a 500ms delay. If the text after `@ace` is "do this", "do it", or "do the plan", and a plan exists, the plan content is included in the agent prompt. |
| `agent_prompt` | `{sessionId, userId, prompt, model}` | Directly triggers the agent with the given prompt. |
| `terminal` | `{sessionId, userId, command}` | Runs a command in the session workspace. |

**Messages sent FROM server TO client:**

| type | Fields | When Sent |
|---|---|---|
| `message` | `{message: {id, sessionId, userId, userName, type, content, timestamp}}` | Any new message (chat, system, agent_start, agent_stream, agent_done, terminal). |
| `session_created` | `{session: {...}}` | When any session is created. Broadcast to ALL connected clients. |
| `session_updated` | `{session: {...}}` | When any session's state changes (agent started/finished, committed). Broadcast to ALL. |
| `session_deleted` | `{sessionId}` | When a session is deleted. Broadcast to ALL. |
| `user_joined` | `{userId, userName}` | When a user joins a session. Broadcast to that session's clients. |
| `user_left` | `{userId}` | When a user disconnects. Broadcast to that session's clients. |
| `plan_updated` | `{plan}` | When a plan is created, updated, or deleted. Broadcast to that session's clients. |

### Channel 2: `/term/{sessionId}` — Terminal WebSocket

Provides an interactive bash shell. Multiple clients can connect to the same session's terminal and see shared output.

**How it works:**
1. On first connection, spawns a `bash` process in the session workspace directory with `TERM=xterm-256color`
2. All connected clients share the same bash process (multiplayer terminal)
3. When the last client disconnects, the bash process is killed

**Messages FROM client:**

| type | Fields | What It Does |
|---|---|---|
| `input` | `{type: "input", data: string}` | Sends keystroke/text input to bash stdin. |
| `resize` | `{type: "resize", ...}` | Ignored (comment in code: "Would need node-pty for proper resize") |

**Messages FROM server:**

| type | Fields | When Sent |
|---|---|---|
| `output` | `{type: "output", data: string}` | Any stdout or stderr output from the bash process. |

---

## Agent Integration

When an agent is triggered (via `@ace` mention, `/agent` API, or plan execution):

1. The server checks if an agent is already running for that session (only 1 at a time)
2. A **conversation prompt** is built from the last 50 messages in the session:
   - System messages: `[HH:MM] [System] content`
   - Chat messages: `[HH:MM] [UserName] content`
   - Agent starts: `[HH:MM] [Agent Prompt] content`
   - Agent completions: `[HH:MM] [Agent] content`
   - Terminal output: `[HH:MM] [Terminal] content`
   - Agent stream messages are SKIPPED (to avoid noise)
3. The user's current request is appended
4. The full prompt is passed to the agent CLI

**Agent commands per AGENT_CMD setting:**

| AGENT_CMD | Command Executed | Notes |
|---|---|---|
| `claude` (default) | `claude --dangerously-skip-permissions --model {model} -p {fullPrompt} --output-format stream-json` | Model flag: `claude-opus-4-20250514`, `claude-sonnet-4-20250514`, or `claude-haiku-4-20250514` |
| `codex` | `codex --full-auto {fullPrompt}` | |
| `opencode` | `opencode -p {fullPrompt}` | |

The agent process runs in the session's workspace directory. stdout is streamed line-by-line to the chat as `agent_stream` messages. stderr is also streamed. When the process exits, an `agent_done` message is sent.

**Auto-commit:** After the agent finishes, the server automatically runs `git add -A` and `git commit` with the prompt text (first 72 characters) as the commit message. The commit author is set to "Ace Agent <ace@sabbk.com>".

---

## Persistence

- **Format:** JSON files on disk
- **Location:** `.ace-data/sessions.json` and `.ace-data/users.json` (configurable via `ACE_DATA_DIR`)
- **Save trigger:** After any state change (message, session creation, plan update, git commit)
- **Debounce:** 2 seconds (saves batch up, avoids disk thrashing)
- **On startup:** Sessions and users are loaded from disk
- **Message limit:** Last 500 messages per session are persisted (last 200 served via API)
- **Agent state:** `agentRunning` is always reset to `false` on load (never persisted as true)
- **Plan:** Persisted as part of the session object

---

## Frontend UI

The entire frontend is a single HTML file (`static/index.html`, 707 lines) with inline JavaScript. No build tools, no frameworks, no virtual DOM.

### Pages/Views

1. **Dashboard** (`showDashboard()`) — Welcome screen with:
   - "Pick Up Where You Left Off" — recent sessions with last commit info
   - "Active Sessions" — all sessions with message count and participant count
   - "Quick Start" — new session, open last session

2. **Session View** (`openSession(id)`) — The main workspace with 6 tabs:
   - **Chat** (`switchTab('chat')`) — Real-time chat area with text input. Placeholder says "type @ace to prompt the agent". Supports Enter to send, Shift+Enter for newline. Model selector dropdown (Opus/Sonnet/Haiku).
   - **Terminal** (`switchTab('terminal')`) — Connects to `/term/{sessionId}` WebSocket. Shows output. Input field sends commands to bash.
   - **Files** (`switchTab('files')`) — Calls `/api/sessions/{id}/files/{path}` to browse directories. Click files to view content. Click directories to navigate. "Back to files" link.
   - **Git** (`switchTab('git')`) — Shows branch name, clean/dirty status, recent commits (last 10), uncommitted changes, diff viewer. Buttons: Refresh, Commit All, Create PR.
   - **Plan** (`switchTab('plan')`) — Collaborative plan editor. Large textarea. Auto-saves after 3 seconds of inactivity. Buttons: "Generate with Agent" (spawns agent to write a plan), "Delete", "Save Plan", "Execute Plan" (sends `@ace do this` to chat and switches to chat tab).
   - **Preview** (`switchTab('preview')`) — iframe that loads `/api/sessions/{id}/preview/index.html`. URL input to change the preview path.

3. **Modals** — New Session, Agent Prompt, Terminal Command (these are HTML modals, not separate pages)

### WebSocket Connection

- Connected on page load with auto-reconnect (3 second delay on close)
- User identity stored in `localStorage` under `ace_user_name`
- On first visit, prompts for name via `window.prompt()`

### Session Sidebar

- Shows all sessions with a colored dot (green = agent running, gray = idle)
- Message count badge
- "+ New Session" button at bottom

---

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|---|---|---|
| `ACE_PORT` | `3000` | HTTP server port |
| `ACE_HOST` | `0.0.0.0` | HTTP server bind address |
| `ACE_PROJECT_DIR` | `process.cwd()` | Root directory where `.sessions/` is created |
| `ACE_AGENT_CMD` | `claude` | Which coding agent CLI to use |
| `ACE_DATA_DIR` | `{cwd}/.ace-data` | Where JSON persistence files are stored |

---

## Docker

The `Dockerfile` uses `node:22-slim`, installs git, copies the app, runs `npm ci --production`, and starts the server.

`docker-compose.yml` maps port 3000, creates a named volume for `.sessions/`, and passes environment variables.

To run: `docker compose up -d`

---

## What This Does NOT Have (compared to GitHub Next's Ace)

For accurate comparison, here is what GitHub Next's Ace has that this project does NOT implement:

1. **MicroVM backing** — Ace uses cloud microVMs (sandboxed cloud computers). This project uses local filesystem directories.
2. **VS Code integration** — Ace can open the session workspace in VS Code with multiplayer editing. This project does not.
3. **Multiplayer cursor editing** — Ace shows multiple user cursors in plans. This project has a plain textarea.
4. **Mobile interface** — Ace mentioned building one. This project has basic responsive CSS only.
5. **Team pulse / activity feed** — Ace shows what teammates have been doing recently. This project has a basic dashboard.
6. **Screenshots in chat** — Ace showed users pasting screenshots. This project's chat is text-only.
7. **Session link in PR description** — Ace includes a link back to the session in the PR body. This project creates PRs but does not add a session link.
8. **Persistent cloud sessions** — Ace sessions survive the user closing their laptop (cloud VMs). This project's sessions die when the server stops (though data is persisted to JSON).
9. **Proactive agent notifications** — Ace's dashboard has agents that proactively remind you of unfinished work. This project's dashboard is static.
10. **Authentication / access control** — No auth system. Anyone with the URL can create sessions and trigger agents.
11. **Dev server proxy with auto-preview** — Ace auto-detects when a dev server starts and shows the preview. This project requires manually setting the preview URL.

---

## How to Run

```bash
git clone https://github.com/Samirius/ace-workspace.git
cd ace-workspace
npm install
npm start
# Server starts on http://localhost:3000
```

Or with Docker:
```bash
docker compose up -d
```

---

## Summary of What Is Actually Built

- A Node.js HTTP server (735 lines) with 19 REST API endpoints
- 2 WebSocket channels (chat/events + interactive terminal)
- 1 npm dependency (`ws`)
- In-memory state with JSON file persistence
- Per-session isolated git repositories
- Agent spawning (Claude Code, Codex, OpenCode) with full conversation context (last 50 messages)
- `@ace` mention detection in chat to auto-trigger agents
- `@ace do this` includes the plan document as agent context
- File browser with path traversal protection
- Live HTML preview via iframe proxy
- Git status/diff/commit/PR creation
- Collaborative plan editor with auto-save
- Agent-generated plans
- Interactive bash terminal (multiplayer, shared process)
- Dark-themed single-page web UI (707 lines, no framework)
- Docker support
- Apache 2.0 license
