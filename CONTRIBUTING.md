# Contributing to Ace Workspace

Thanks for your interest! Here's how to get started.

## Quick Start

```bash
git clone https://github.com/Samirius/ace-workspace.git
cd ace-workspace
npm install
npm run dev    # Starts server with --watch (auto-restart on changes)
```

Open http://localhost:3000

## Architecture

```
ace-workspace/
├── src/
│   ├── server.mjs      # Main server — HTTP + WebSocket + terminal
│   └── persist.mjs     # JSON file persistence
├── static/
│   ├── index.html      # Single-page app (no build step)
│   ├── style.css       # Dark theme
│   └── terminal.js     # Browser terminal component
├── Dockerfile           # Container build
├── docker-compose.yml   # One-command deploy
└── .sessions/           # Session workspaces (gitignored)
```

**Design Principles:**
- Zero dependencies (except `ws` for WebSocket)
- No build step — HTML/CSS/JS served directly
- Self-hosted — runs on any machine with Node.js 18+
- Single-file architecture — easy to understand and fork

## Development Workflow

1. Create a branch: `git checkout -b feature/your-feature-hermes`
2. Make changes
3. Test: `npm start` and verify in browser
4. Commit: clear, descriptive messages
5. Push and open a PR

## Feature Areas

### Server (`src/server.mjs`)
- HTTP API routes
- WebSocket chat/agent handling
- Terminal WebSocket (`/term/:sessionId`)
- File browser API
- Live preview proxy
- Agent spawning (Claude/Codex/OpenCode)

### Frontend (`static/`)
- Dashboard view
- Session chat
- Terminal tab
- File browser tab
- Preview tab
- WebSocket connection management

### Persistence (`src/persist.mjs`)
- JSON file store
- Auto-save with debounce
- Session/user serialization

## Adding a New Agent

In `server.mjs`, find `spawnAgent()` and add your agent:

```javascript
if (AGENT_CMD === "your-agent") {
  args = ["--your-flags", prompt];
  cmd = "your-agent-cli";
}
```

## Reporting Issues

Open a GitHub issue with:
- What you expected
- What happened
- Steps to reproduce
- Node.js version (`node --version`)
