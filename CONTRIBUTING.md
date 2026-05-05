# Contributing to MADE

**M**ultiplayer **A**gentic **D**evelopment **E**nvironment

Thanks for your interest! Here's how to get started.

## Quick Start

```bash
git clone https://github.com/Samirius/made.git
cd made
npm install
npm run dev    # Starts server with --watch (auto-restart on changes)
```

Open http://localhost:3000

## Architecture

```
made/
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
- Minimal dependencies (only `ws` + `node-pty`)
- No build step — HTML/CSS/JS served directly
- Self-hosted — runs on any machine with Node.js 22+
- Git-agnostic — works with GitHub, GitLab, Gitea, Bitbucket, or plain local git
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
- Agent spawning and management
- Git provider auto-detection
- Terminal integration
- File upload handling
- Session management

### Frontend (`static/`)
- Single HTML file with all UI logic
- WebSocket client
- Terminal emulator
- Split view preview
- Inline diff cards
- Autocomplete (@made, #sessions, /commands)
- Dashboard with activity feed

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MADE_PORT` | `3000` | Server port |
| `MADE_TOKEN` | — | Auth token (optional) |
| `MADE_AGENT_CMD` | — | Agent CLI command |
| `MADE_PROJECT_DIR` | `.` | Project directory |

*Backward compat: `ACE_*` env vars still work as fallbacks.*

## Branch Convention

All AI-generated branches end with `-hermes` for easy identification.
