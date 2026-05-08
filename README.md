# M A D E

**The first open, git-agnostic, multiplayer agentic development environment.**

One workspace. Any agent. Any git host. Your entire team, live.

---

## Why MADE?

Every AI coding tool right now is **single-player** and **platform-locked**.

- **Cursor** locks you into their editor.
- **GitHub Copilot** locks you into GitHub.
- **Claude Code** locks you into Anthropic's CLI.
- **Codex** locks you into OpenAI's cloud.

None of them let your *team* code *together* with AI. None of them let you choose your own git host. None of them are open source.

**MADE** fixes all of that.

---

## What It Does

- 💬 **Multiplayer chat** — your whole team in one session, agents included. Paste screenshots, edit messages, @mention anyone
- 🤖 **Any agent** — Claude Code, Codex, OpenCode, or literally any CLI. Swap in one env var
- ⌨️ **Live terminals** — real bash shells in the browser, one per session
- 📁 **File browser** — browse, read, write files in the session workspace
- 🔀 **Git-native** — every session gets its own branch. Status, diff, commit, create PRs
- 📋 **Plan mode** — write collaborative plans, execute them with your agent step-by-step
- 👁 **Live preview** — auto-detects dev servers, renders inline
- 📊 **Diff cards** — inline code diffs right in the chat stream
- 🔀 **Split view** — chat alongside terminal, files, or preview
- 📡 **Dashboard** — team activity feed, insights, session pulse
- 🔒 **Token auth** — one env var to lock it down
- ⚡ **Image uploads** — drop screenshots directly into chat for agent context
- ✨ **Autocomplete** — `/` commands, `@` mentions, `#` session links

---

## Quick Start

### Bare Metal

```bash
git clone https://github.com/Samirius/MADE.git
cd MADE
npm install
npm run build
MADE_AGENT_CMD=claude npm start
```

Open http://localhost:3000

### Docker

```bash
git clone https://github.com/Samirius/MADE.git
cd MADE
docker compose up -d
```

Open http://localhost:3000

---

## Connect Any Agent

MADE spawns agent CLIs as subprocesses. Install the CLI on the same machine, point MADE at it.

```bash
# Claude Code
MADE_AGENT_CMD=claude npm start

# OpenAI Codex
MADE_AGENT_CMD=codex npm start

# OpenCode
MADE_AGENT_CMD=opencode npm start

# Anything
MADE_AGENT_CMD="my-custom-agent" npm start
```

---

## Connect Any Git Host

MADE doesn't care where your code lives. It uses git directly.

Works with GitHub, GitLab, Bitbucket, Gitea, or any git server.

---

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `MADE_PORT` | Server port | `3000` |
| `MADE_HOST` | Server host | `0.0.0.0` |
| `MADE_PROJECT_DIR` | Root directory for session workspaces | current working directory |
| `MADE_AGENT_CMD` | Agent CLI command | `claude` |
| `MADE_TOKEN` | Auth token. Set to any string to enable auth | empty (no auth) |

---

## Architecture

```
┌──────────────────────────────────────────┐
│            Browser (React SPA)           │
│  ┌─────────┐ ┌────────┐ ┌─────────────┐ │
│  │ Chat    │ │ Terminal│ │ Files/Git   │ │
│  │ Messages│ │ (xterm) │ │ Browser     │ │
│  └────┬────┘ └───┬────┘ └──────┬──────┘ │
│       │          │             │         │
│       └──────┬───┘─────────────┘         │
│              │ WebSocket                  │
└──────────────┼───────────────────────────┘
               │
┌──────────────┼───────────────────────────┐
│         Express + WS Server              │
│  ┌───────┐ ┌───────┐ ┌────────────────┐ │
│  │Sessions│ │Agents │ │ Terminal (PTY) │ │
│  │Manager │ │Manager│ │ Manager        │ │
│  └───┬───┘ └───┬───┘ └──────┬─────────┘ │
│      │         │            │            │
│      └────┬────┘────────────┘            │
│           │                              │
│  ┌────────▼─────────┐                    │
│  │ .sessions/{id}/   │                   │
│  │   workspace       │                   │
│  └──────────────────┘                    │
└──────────────────────────────────────────┘
```

- **Process-per-session** — each session gets its own workspace directory and git branch
- **Agent-agnostic** — MADE doesn't know or care which agent you use. It just spawns a process
- **WebSocket-native** — all realtime communication over a single WS connection

---

## Comparison

| | MADE | Cursor | GitHub Copilot | Claude Code |
|---|---|---|---|---|
| Open Source | ✅ | ❌ | ❌ | ❌ |
| Multiplayer | ✅ | ❌ | ❌ | ❌ |
| Any Agent | ✅ | ❌ | ❌ | ❌ |
| Any Git Host | ✅ | ✅ | ❌ (GitHub only) | ✅ |
| Self-Hosted | ✅ | ❌ | ❌ | ❌ |
| Cost | Free | Paid | Paid | Paid |

---

## Inspiration

MADE is inspired by [GitHub Next's Ace](https://maggieappleton.com/zero-alignment) — the multiplayer coding agent workspace. Ace isn't open source. MADE is the open alternative.

---

## License

MIT
