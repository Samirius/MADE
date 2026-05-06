# MADE v2 Architecture — Integration, Not Invention

> MADE doesn't build agents, git hosts, editors, or terminals.
> MADE connects them. The glue, not the pieces.

---

## Philosophy

| We DON'T build | We INTEGRATE |
|---|---|
| AI agents | Claude Code, OpenCode, Hermes, Codex |
| Git hosting | GitHub, GitLab, Gitea, Bitbucket, local |
| Code editor | Monaco Editor (from VS Code, MIT) |
| Terminal | xterm.js + node-pty |
| File browser | Simple tree, reads from filesystem |

**MADE = orchestration layer + beautiful UI + guided onboarding**

---

## 1. Agent Integrations

Each agent has an adapter. One interface, multiple implementations.

### Claude Code
- **Protocol**: ACP (JSON-RPC over stdio) via `claude --acp --stdio`
- **Capabilities**: read/write files, run commands, search, git, browser
- **Detection**: `which claude && claude --version`
- **Why first**: Most capable agent, best tool use, ACP is well-defined

### OpenCode
- **Protocol**: ACP via `opencode --acp --stdio`
- **Capabilities**: Similar to Claude Code
- **Detection**: `which opencode`
- **Why**: Go-based, fast, works with multiple LLM providers

### Hermes
- **Protocol**: CLI via `hermes` or direct ACP
- **Capabilities**: Full Hermes toolset (web, terminal, file, etc.)
- **Detection**: `which hermes`
- **Why**: Already in our stack, can be self-hosted

### Codex (OpenAI)
- **Protocol**: CLI via `codex --full-auto "prompt"`
- **Capabilities**: File operations, shell commands
- **Detection**: `which codex`

### Generic / Built-in (GLM fallback)
- **Protocol**: stdin/stdout
- **Script**: `scripts/made-glm-agent.py`
- **Use case**: When no real agent is installed, basic chat + file creation via z.ai API

### Adapter Interface (src/agent/adapter.mjs)
```js
class AgentAdapter {
  async detect()          // Check if agent is installed + authenticated
  async start(sessionDir) // Start agent process in session directory
  async send(prompt)      // Send prompt to agent
  async abort()           // Kill running agent
  async stop()            // Graceful shutdown
  getInfo()               // { name, version, capabilities }
}
```

---

## 2. Git Provider Integrations

### GitHub (via `gh` CLI)
- Auto-detect: `gh auth status`
- Create branch, commit, push, open PR
- Show CI status, reviews
- Link to PR from session

### GitLab (via `glab` CLI)
- Auto-detect: `glab auth status`
- Same feature set as GitHub
- Merge Requests instead of PRs

### Gitea / Forgejo (REST API + git)
- Auto-detect: remote URL parsing
- PR/MR via API calls

### Bitbucket (REST API + git)
- Auto-detect: remote URL parsing

### Local-only (just `git`)
- No remote needed
- Still get branches, commits, diffs
- Perfect for solo devs and experiments

---

## 3. Editor — Monaco

Monaco Editor is what powers VS Code. MIT licensed. Used by GitHub.dev, GitLab Web IDE, and thousands of apps.

- **Load**: CDN via `monaco-editor` on jsdelivr (no npm install needed)
- **Features**: Syntax highlighting (50+ languages), diff view, minimap, search/replace, multi-cursor
- **Integration**: Lazy-load when user opens a file, not on page load
- **Diff view**: Reuse for showing agent changes (before/after)

---

## 4. Terminal — xterm.js

- **Load**: CDN (xterm.js + xterm-addon-fit + xterm-addon-web-links)
- **Backend**: node-pty (already a dependency)
- **Per-session**: Each session gets its own PTY
- **Features**: Themes, scrollback, copy/paste, resizable
- **Agent visibility**: Agent commands appear in terminal so users see what's happening

---

## 5. File Browser

- Simple tree component, vanilla JS
- Reads from session's working directory via REST API
- `fs.watch` on backend for live updates → pushed via WebSocket
- File icons based on extension
- Click to open in Monaco, right-click for actions

---

## 6. Session = Core Unit

```
Session
├── Working directory (git worktree or folder)
├── Git branch (auto: made/{id}-{name})
├── Agent (one active, configurable per session)
├── Chat history (human + agent messages)
├── Terminal (xterm.js instance + node-pty)
├── Open files (Monaco tabs)
├── Activity timeline (commits, file changes, agent actions)
└── Participants (human users, invited via link)
```

---

## 7. Onboarding Flow (CRITICAL)

### Step 1: "Welcome to MADE"
- One-liner: "Your AI-powered dev workspace"
- Illustration or animation
- "Set up in 3 minutes" button

### Step 2: "Connect Your Agents"
- Auto-scan PATH: `which claude opencode hermes codex`
- Green ✓ for detected, install link for missing
- Pick default agent
- If nothing found: offer GLM built-in agent

### Step 3: "Connect Your Git"
- Auto-detect: `gh auth status`, `glab auth status`, `git remote -v`
- Show detected provider
- If not authenticated: show command to run
- Support "local only" (no remote needed)

### Step 4: "Create First Session"
- Pick directory (file picker or path input)
- Or clone repo (URL input)
- Name the session
- Pick agent
- → Done, start building

### Step 5: "Quick Tour" (optional)
- 5 tooltips highlighting: chat, agent selector, file tree, terminal, git status
- Dismiss after last, "don't show again" option

---

## 8. File Structure

```
made/
├── src/
│   ├── server.mjs            # Main server (HTTP + WebSocket)
│   ├── agent/
│   │   ├── adapter.mjs       # Base class
│   │   ├── claude.mjs        # Claude Code ACP adapter
│   │   ├── opencode.mjs      # OpenCode adapter
│   │   ├── hermes.mjs        # Hermes adapter
│   │   ├── codex.mjs         # Codex adapter
│   │   └── generic.mjs       # Generic stdin/stdout
│   ├── git/
│   │   ├── provider.mjs      # Base class
│   │   ├── github.mjs        # GitHub via gh CLI
│   │   ├── gitlab.mjs        # GitLab via glab CLI
│   │   └── local.mjs         # Local-only git
│   ├── session.mjs           # Session lifecycle
│   └── onboard.mjs           # Detection logic
├── static/
│   ├── index.html            # SPA shell + onboarding wizard
│   ├── style.css
│   ├── components/
│   │   ├── editor.mjs        # Monaco loader
│   │   ├── terminal.mjs      # xterm.js loader
│   │   ├── filetree.mjs      # File browser
│   │   ├── chat.mjs          # Chat + agent messages
│   │   └── onboard.mjs       # Onboarding wizard
│   └── lib/                  # CDN-fallback local copies
├── scripts/
│   └── made-glm-agent.py     # Built-in fallback agent
├── Dockerfile
├── docker-compose.yml
└── package.json              # deps: ws + node-pty only
```

---

## 9. API Surface

### REST
```
GET    /api/status                       # Health + detected tools
GET    /api/onboard/detect               # Scan for agents, git, tools
POST   /api/onboard/clone                # Clone repo for new session

GET    /api/sessions                     # List sessions
POST   /api/sessions                     # Create (name, path, agent, git)
GET    /api/sessions/:id                 # Detail
DELETE /api/sessions/:id                 # Delete

GET    /api/sessions/:id/messages        # Chat history
POST   /api/sessions/:id/agent           # Send prompt to agent
POST   /api/sessions/:id/abort           # Kill agent

GET    /api/sessions/:id/files?path=     # List files
GET    /api/sessions/:id/file?path=      # Read file
PUT    /api/sessions/:id/file?path=      # Write file

GET    /api/sessions/:id/git/status      # Git status
POST   /api/sessions/:id/git/commit      # Commit
POST   /api/sessions/:id/git/push        # Push
POST   /api/sessions/:id/git/pr          # Open PR/MR
```

### WebSocket
```
ws://host/ws?token=...
→ Per-session channels: messages, terminal, file changes
→ Real-time streaming: agent output, terminal, file tree updates
```

---

## 10. What Makes MADE Different

1. **Works with YOUR tools** — not locked into GitHub or any single agent
2. **No build step** — vanilla JS, CDN for heavy libs, runs anywhere Node runs
3. **Non-dev friendly** — onboarding wizard, visual UI, no CLI knowledge needed
4. **Self-hosted** — Docker one-liner, data stays on your machine
5. **Agent-agnostic** — swap agents per session, compare outputs side by side
6. **Git-agnostic** — GitHub, GitLab, Gitea, or plain local folders

---

## Phase Plan

### Phase 0: Foundation (1-2 days)
- [ ] Rewrite server with modular architecture
- [ ] Agent adapter interface (`src/agent/adapter.mjs`)
- [ ] Git provider interface (`src/git/provider.mjs`)
- [ ] Session manager (`src/session.mjs`)
- [ ] Onboard detection (`src/onboard.mjs`)
- [ ] Keep existing UI working (don't break what works)
- [ ] `/api/onboard/detect` endpoint

### Phase 1: Real Integrations (3-5 days)
- [ ] Claude Code adapter (ACP protocol, `claude --acp --stdio`)
- [ ] OpenCode adapter
- [ ] Generic adapter (for any CLI agent)
- [ ] GitHub provider (`gh` CLI)
- [ ] Local git provider
- [ ] xterm.js terminal in UI
- [ ] Monaco editor in UI (lazy-loaded from CDN)
- [ ] File browser component
- [ ] Per-session working directory + PTY

### Phase 2: Onboarding + Polish (2-3 days)
- [ ] Full onboarding wizard (5 steps)
- [ ] Auto-detection of installed tools
- [ ] First-session guided flow
- [ ] Mobile responsive layout
- [ ] Dark/light theme toggle
- [ ] Session templates (blank, clone repo, from template)

### Phase 3: Multiplayer + Deploy (3-5 days)
- [ ] Multiple humans per session (invites + links)
- [ ] Cursor/presence indicators
- [ ] Docker one-liner deployment
- [ ] Cloudflare tunnel guide
- [ ] Session sharing links (read-only, read-write)
- [ ] Activity feed (who did what, when)
