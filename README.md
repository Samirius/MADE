# ⚡ Ace Workspace

Open-source multiplayer coding agent workspace — the whole team codes together with AI agents.

**Session = Chat Channel + Git Branch + Agent**

## Features

- 💬 **Multiplayer chat** — paste screenshots, edit messages, @mention teammates
- 🤖 **Agent integration** — Claude Code, Codex, OpenCode, or any CLI agent
- ⌨ **Interactive terminal** — real bash shell in the browser per session
- 📁 **File browser** — browse, read, write files in session workspace
- 🔀 **Git integration** — status, diff, commit, create PRs
- 📋 **Plan editor** — collaborative plans, execute with agent
- 👁 **Live preview** — auto-detects dev server ports
- 📡 **Activity dashboard** — team pulse, insights, activity feed
- 🔒 **Token auth** — optional, one env var
- 🐳 **Docker ready** — one command to deploy
- 📦 **Zero dependencies** — pure Node.js + `ws`

## Quick Start

```bash
git clone https://github.com/Samirius/ace-workspace.git
cd ace-workspace
npm install
npm start
# Open http://localhost:3000
```

---

## Configuration

All config is via environment variables:

| Variable | Default | Description |
|---|---|---|
| `ACE_PORT` | `3000` | Server port |
| `ACE_HOST` | `0.0.0.0` | Server host |
| `ACE_PROJECT_DIR` | `cwd` | Root for session workspaces |
| `ACE_AGENT_CMD` | `claude` | Agent CLI to use |
| `ACE_TOKEN` | _(empty)_ | Auth token (set to enable auth) |

---

## Connecting Agents

Ace spawns agent CLIs as subprocesses. You need the agent CLI **installed on the same machine** as Ace.

### Claude Code

```bash
# 1. Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 2. Authenticate
claude login
# Or set ANTHROPIC_API_KEY in your environment

# 3. Start Ace with Claude as the agent (default)
ACE_AGENT_CMD=claude npm start
```

- **Models:** Opus (default), Sonnet, Haiku — pick from the dropdown in the chat input
- **Permissions:** Ace runs with `--dangerously-skip-permissions` so the agent can write files autonomously
- **What you need:** An Anthropic API key or Claude Pro/Max subscription with Claude Code access

### OpenAI Codex

```bash
# 1. Install Codex CLI
npm install -g @openai/codex

# 2. Set your API key
export OPENAI_API_KEY=sk-...

# 3. Start Ace with Codex
ACE_AGENT_CMD=codex npm start
```

- Runs in `--full-auto` mode
- **What you need:** OpenAI API key with Codex access

### OpenCode

```bash
# 1. Install OpenCode
# See: https://github.com/opencode-ai/opencode

# 2. Configure your LLM provider in opencode config

# 3. Start Ace with OpenCode
ACE_AGENT_CMD=opencode npm start
```

- Uses `-p` flag for prompt mode
- **What you need:** OpenCode installed + any LLM provider it supports

### Hermes / OpenClaw (custom agent)

Any CLI that accepts a prompt and writes to stdout works:

```bash
# Point to any custom command
ACE_AGENT_CMD="my-custom-agent" npm start
```

The server runs: `bash -c "my-custom-agent {model-flags} {prompt}"`

For Hermes specifically, you'd create a wrapper script:

```bash
# /usr/local/bin/ace-hermes
#!/bin/bash
# Receive prompt as last arg, forward to Hermes
PROMPT="${@: -1}"
hermes chat --prompt "$PROMPT" --no-confirm
```

```bash
chmod +x /usr/local/bin/ace-hermes
ACE_AGENT_CMD=ace-hermes npm start
```

### Custom / Any other agent

Ace runs this command when the agent triggers:

```bash
# Default (claude):
claude --dangerously-skip-permissions --model {model} -p "{prompt}" --output-format stream-json

# Codex:
codex --full-auto "{prompt}"

# OpenCode:
opencode -p "{prompt}"

# Custom:
bash -c "{ACE_AGENT_CMD} {model-flags} {prompt}"
```

The prompt includes the **last 50 messages** from the session as conversation context. Agent stdout is streamed line-by-line into the chat. When the agent exits, Ace auto-commits all changes.

---

## Connecting GitHub

GitHub integration is used for **creating PRs** from sessions.

### 1. Install GitHub CLI

```bash
# Ubuntu/Debian
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update && sudo apt install gh

# macOS
brew install gh
```

### 2. Authenticate

```bash
gh auth login
# Follow prompts — choose HTTPS, authenticate with browser or token
```

### 3. Use it

1. Create a session in Ace
2. The agent writes code in the session workspace
3. Go to the **🔀 Git** tab
4. Click **Create PR**
5. Enter a remote repo URL (e.g., `https://github.com/yourname/repo.git`)
6. Ace pushes the branch and creates a PR via `gh pr create`

The PR body automatically includes a link back to the Ace session.

---

## Exposing to Your Team (Tunnels)

Ace runs on localhost by default. To share with your team:

### Cloudflare Tunnel (recommended)

```bash
# Install cloudflared
npm install -g cloudflared

# Start Ace
ACE_PORT=3000 npm start &

# Expose via tunnel
cloudflared tunnel --url http://localhost:3000
```

Share the generated URL with your team. Set `ACE_TOKEN` for auth:

```bash
ACE_TOKEN=my-secret-token npm start
```

Users will need to append `?token=my-secret-token` to the URL.

### Docker

```bash
docker compose up -d
# Customize in docker-compose.yml
```

---

## Auth (Optional)

Set `ACE_TOKEN` to require authentication:

```bash
ACE_TOKEN=a-random-secret-string npm start
```

Clients must pass the token as:
- Query param: `?token=a-random-secret-string`
- Header: `Authorization: Bearer a-random-secret-string`

---

## How It Works

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

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Tab` | Toggle Chat/Ace mode |
| `Escape` | Close modal |

## Chat Commands

| Command | Action |
|---|---|
| `@ace <prompt>` | Trigger agent |
| `/agent <prompt>` | Trigger agent |
| `/plan` | Switch to Plan tab |
| `/commit` | Open commit dialog |
| `/run <command>` | Run in terminal |
| `/clear` | Clear chat |
| `@` + type | Mention a user |
| `#` + type | Link a session |

---

## API

23 REST endpoints. Full docs in [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md).

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/sessions` | List sessions |
| `POST` | `/api/sessions` | Create session |
| `GET` | `/api/sessions/:id` | Session + messages |
| `DELETE` | `/api/sessions/:id` | Delete session |
| `POST` | `/api/sessions/:id/agent` | Spawn agent |
| `POST` | `/api/sessions/:id/exec` | Run command |
| `POST` | `/api/sessions/:id/exec/abort` | Abort command |
| `GET` | `/api/sessions/:id/files/*` | Browse/read files |
| `PUT` | `/api/sessions/:id/files/*` | Write file |
| `GET` | `/api/sessions/:id/preview/*` | Live preview |
| `GET` | `/api/sessions/:id/git/status` | Git status |
| `GET` | `/api/sessions/:id/git/diff` | Git diff |
| `POST` | `/api/sessions/:id/git/commit` | Git commit |
| `POST` | `/api/sessions/:id/pr` | Create PR |
| `GET` | `/api/sessions/:id/plan` | Get plan |
| `POST` | `/api/sessions/:id/plan` | Save plan |
| `DELETE` | `/api/sessions/:id/plan` | Delete plan |
| `POST` | `/api/sessions/:id/plan/generate` | AI-generate plan |
| `POST` | `/api/sessions/:id/upload` | Upload image |
| `GET` | `/api/sessions/:id/uploads/:file` | Serve upload |
| `PUT` | `/api/sessions/:id/messages/:msgId` | Edit message |
| `DELETE` | `/api/sessions/:id/messages/:msgId` | Delete message |
| `GET` | `/api/activity` | Activity feed + insights |

WebSocket at `/ws` — real-time chat, agent streaming, session events.
Terminal WebSocket at `/term/:sessionId` — interactive bash shell.

---

## License

Apache 2.0 — use it, fork it, ship it.
