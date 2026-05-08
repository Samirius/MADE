# M A D E

**The first open, git-agnostic, multiplayer agentic development environment.**

One workspace. Any agent. Any git host. Your entire team, live.

**[API Reference](API.md)** | **[Security Policy](SECURITY.md)** | **[Changelog](CHANGELOG.md)**

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

```bash
git clone https://github.com/Samirius/made.git
cd made
npm install
npm start
```

Open `http://localhost:3000`. That's it.

---

## Connect Any Agent

MADE spawns agent CLIs as subprocesses. Install the CLI on the same machine, point MADE at it.

### Claude Code

```bash
npm install -g @anthropic-ai/claude-code
claude login
MADE_AGENT_CMD=claude npm start
```

### OpenAI Codex

```bash
npm install -g @openai/codex
export OPENAI_API_KEY=sk-...
MADE_AGENT_CMD=codex npm start
```

### OpenCode

```bash
# Install from https://github.com/opencode-ai/opencode
MADE_AGENT_CMD=opencode npm start
```

### Anything Else

```bash
MADE_AGENT_CMD="my-custom-agent" npm start
```

If it accepts a prompt on stdin or as an argument and writes to stdout, it works.

---

## Git-Agnostic

MADE doesn't care where your code lives. It uses git directly.

- **GitHub** — push branches, create PRs via `gh`
- **GitLab** — push to any GitLab instance, self-hosted or cloud
- **Gitea / Forgejo** — your own infra, your own rules
- **Bitbucket** — yeah, that too
- **Local repos** — no remote required. Just work

No OAuth flows. No vendor webhooks. Just git.

---

## Self-Hosting

```bash
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/projects:/app/projects \
  -e MADE_TOKEN=your-secret \
  made:latest
```

Or bare metal — MADE needs Node 22 and two npm packages. That's it.

```bash
node --version  # v22+
npm install && npm start
```

No Redis. No Postgres. No build step. The frontend is vanilla HTML/CSS/JS.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser UI                        │
│   Vanilla HTML/CSS/JS — no framework, no build step  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Sessions  │  │   Chat   │  │    Terminal       │  │
│  │ (sidebar) │  │ (agent)  │  │    (node-pty)     │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                      │ WebSocket (/ws)               │
└──────────────────────┼──────────────────────────────┘
                       │
                ┌──────┴──────┐
                │  Node.js 22  │
                │   Server     │
                │ (ws + pty)   │
                └──────┬──────┘
                       │ spawns
          ┌────────────┼────────────┐
          │            │            │
     ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
     │ Claude  │ │  Codex  │ │ Any CLI │
     │  Code   │ │         │ │  Agent  │
     └────┬────┘ └────┬────┘ └────┬────┘
          │            │            │
     ┌────┴────────────┴────────────┴────┐
     │   .sessions/{id}/ workspace       │
     │   (git branch per session)        │
     └──────────────┬────────────────────┘
                    │ git push
          ┌─────────┴──────────┐
          │  GitHub / GitLab /  │
          │  Gitea / Bitbucket  │
          │  / Any Git Host     │
          └─────────────────────┘
```

**Design principles:**

- **Minimal dependencies** — only `ws` and `node-pty`. Everything else is Node stdlib
- **No build step** — the frontend ships as vanilla HTML/CSS/JS. No bundler, no framework
- **Process-per-session** — each session gets its own workspace directory and git branch
- **Agent-agnostic** — MADE doesn't know or care which agent you use. It just spawns a process
- **Git-native** — all version control through git. No proprietary storage layer

---

## Configuration

All config via environment variables:

- **`MADE_PORT`** — Server port. Default: `3000`
- **`MADE_HOST`** — Server host. Default: `0.0.0.0`
- **`MADE_PROJECT_DIR`** — Root directory for session workspaces. Default: current working directory
- **`MADE_AGENT_CMD`** — Agent CLI command. Default: `claude`
- **`MADE_TOKEN`** — Auth token. Set to any string to enable auth. Default: empty (no auth)

*Backward compat: `ACE_*` env vars still work as fallbacks.*

Auth clients pass the token as:
- Query param: `?token=your-secret`
- Header: `Authorization: Bearer your-secret`

---

## How It Compares

- **MADE** — Open source. Any agent. Any git. Multiplayer. Self-hosted. Free.
- **GitHub Copilot** — Closed source. GitHub only. Single-player. Cloud-only. Paid.
- **Cursor** — Closed source. Their editor. Their cloud. Single-player. Paid.
- **Claude Code** — Closed source. Anthropic only. Single-player. CLI-only. Paid.

MADE isn't competing with agents — it's the environment where *any* agent lives alongside your team.

---

## Philosophy

> "We need to build a few exceptional things, not a lot of mediocre ones."
>
> — Maggie Appleton, [AI Engineer Europe 2025](https://maggieappleton.com/)

MADE is one exceptional thing: an open multiplayer environment that respects your tools, your infrastructure, and your team. No lock-in. No rental. You run it, you own it.

---

## License

MIT — use it, fork it, ship it.

---

## Built by [Sabbk](https://github.com/Samirius)

Open source because the future of AI-assisted development should be open.
