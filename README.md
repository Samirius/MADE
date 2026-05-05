# ⚡ Ace Workspace

Open-source multiplayer coding agent workspace — like Slack + GitHub + Copilot had a baby.

Inspired by [GitHub Next's Ace](https://maggieappleton.com/zero-alignment), built for everyone.

## What it does

Each **session** is a chat channel backed by its own workspace directory. You invite coding agents (Claude Code, Codex, OpenCode) into the chat, and they read the full conversation as context before writing code. Multiple people can participate in the same session, see what the agent is doing in real-time, and pick up where they left off.

```
Session = Chat Channel + Git Branch + Agent
```

### Core features

- **Multiplayer sessions** — like Slack channels, but for coding
- **Agent integration** — prompt Claude Code / Codex / OpenCode from the chat
- **Real-time** — WebSocket updates, see agent output as it streams
- **Terminal** — run commands in the session workspace from the UI
- **Dashboard** — pick up where you left off, see active sessions
- **Zero dependencies** (server) — pure Node.js + one npm package (`ws`)
- **Self-hosted** — runs on any machine with Node.js 18+

## Quick start

```bash
git clone https://github.com/Samirius/ace-workspace.git
cd ace-workspace
npm install
npm start
# Open http://localhost:3000
```

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `ACE_PORT` | `3000` | Server port |
| `ACE_HOST` | `0.0.0.0` | Server host |
| `ACE_PROJECT_DIR` | `cwd` | Root directory for session workspaces |
| `ACE_AGENT_CMD` | `claude` | Agent command (`claude`, `codex`, `opencode`) |

## How it works

```
┌─────────────────────────────────────────────────┐
│                  Browser UI                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Sessions  │  │   Chat   │  │   Terminal   │  │
│  │ (sidebar) │  │ (agent)  │  │   (output)   │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│                    │ WebSocket                    │
└────────────────────┼────────────────────────────┘
                     │
              ┌──────┴──────┐
              │  Node.js     │
              │  Server      │
              │  (zero-dep)  │
              └──────┬──────┘
                     │ spawns
        ┌────────────┼────────────┐
        │            │            │
   ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
   │ Claude  │ │  Codex  │ │OpenCode │
   │  Code   │ │         │ │         │
   └────┬────┘ └────┬────┘ └────┬────┘
        │            │            │
   ┌────┴────────────┴────────────┴────┐
   │    .sessions/{id}/ workspace      │
   │    (git branch per session)       │
   └───────────────────────────────────┘
```

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create session `{name}` |
| `GET` | `/api/sessions/:id` | Get session + messages |
| `DELETE` | `/api/sessions/:id` | Delete session |
| `POST` | `/api/sessions/:id/agent` | Spawn agent `{prompt, model}` |
| `POST` | `/api/sessions/:id/exec` | Run command `{command}` |
| `POST` | `/api/users` | Create/join user |

WebSocket at `/ws` — join sessions, chat, stream agent output.

## Why this exists

GitHub Next's Ace is an incredible product vision — multiplayer coding sessions where agents are first-class participants. But it's not open source. This is the open-source version anyone can self-host and extend.

## License

Apache 2.0 — use it, fork it, ship it.
