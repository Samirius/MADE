# Ace Workspace — Sprint Backlog

Generated from Gemini code review + manual code audit.
Every item verified against actual source code in `src/server.mjs`, `src/persist.mjs`, and `static/index.html`.

Status: `TODO` = not started, `DONE` = merged, `SKIP` = excluded with reason

---

## SPRINT 1: Critical UX Gaps (What Makes Ace Feel Like Ace)

### S1-01: Terminal output in chat, not separate tab
**Source:** Gemini review + OCR showing `exec by idan | done 958ms` inline in chat
**Current code:** Terminal tab is separate. `execInSession()` posts messages to session but user must be on terminal tab to see live output. Chat only shows the final result.
**Fix:** When a user runs a command via the exec endpoint, show the output inline in the chat feed (not just terminal tab). The terminal tab still works for interactive shells, but one-off commands should appear in chat.
**Files:** `src/server.mjs` (execInSession already broadcasts to chat — verify frontend renders it), `static/index.html` (ensure terminal-type messages render in chat area)
**Status:** TODO

### S1-02: Exec abort — users must be able to cancel running commands
**Source:** OCR shows `exec abort by idan` and `stop running...`
**Current code:** `execInSession()` uses `execSync` with 30s timeout. No way to abort. Terminal bash processes can be killed but exec commands cannot.
**Fix:** Switch exec endpoint to use `spawn` instead of `execSync`. Add a `/api/sessions/:id/exec/abort` endpoint that kills the running process. Add a "Stop" button in UI when command is running.
**Files:** `src/server.mjs` (replace execSync with spawn), `static/index.html` (add abort button)
**Status:** TODO

### S1-03: Session categories — My Sessions vs Other People's Sessions
**Source:** OCR shows sidebar split: "My Sessions" and "Other People's Sessions"
**Current code:** `renderSessionList()` renders all sessions flat with no categorization. No ownership concept beyond `userId`.
**Fix:** Track session creator. Split sidebar into "My Sessions" and "Other Sessions". Filter based on current user ID.
**Files:** `src/server.mjs` (add `createdBy` to session), `static/index.html` (split sidebar rendering)
**Status:** TODO

### S1-04: @ace model should respect the dropdown, not hardcode opus
**Source:** Code audit — line 623 of server.mjs: `const model = "opus";`
**Current code:** When @ace is triggered via chat, model is hardcoded to "opus". The dropdown in chat input exists but is not wired.
**Fix:** Read the model from `#model-select` dropdown when sending @ace messages, or accept model param from WS chat message.
**Files:** `static/index.html` (send model in @ace WS message), `src/server.mjs` (read model from WS data)
**Status:** TODO

---

## SPRINT 2: Collaboration & State

### S2-01: Plan editor — prevent overwrite on simultaneous edit
**Source:** Gemini review — "If two users edit simultaneously, whoever saves last overwrites"
**Verified:** Correct. `savePlan()` does `POST /api/sessions/:id/plan` with full content replacement. No conflict resolution. No locking. No diff/merge.
**Fix:** Add optimistic locking (send `updatedAt` timestamp, reject if stale). Or add WebSocket-based awareness (show "User X is typing..." in plan tab). Full CRDT (Yjs/Automerge) is a later sprint.
**Files:** `src/server.mjs` (add updatedAt conflict check), `static/index.html` (add awareness indicator)
**Status:** TODO

### S2-02: User presence indicators in sessions
**Source:** OCR shows "Connected" status and user join/leave messages
**Current code:** Server broadcasts `user_joined`/`user_left` events. Frontend does NOT render them in chat. Session detail returns participants but UI doesn't show who's online.
**Fix:** Show online users in session header. Render join/leave events in chat feed. Show green/gray dots next to participant names.
**Files:** `static/index.html` (render presence in chat and header)
**Status:** TODO

### S2-03: Message editing and deleting
**Source:** OCR shows "(edited)" next to messages
**Current code:** Messages are append-only. No edit, no delete, no reactions.
**Fix:** Add `PUT /api/sessions/:id/messages/:msgId` for editing. Add `DELETE` for deleting. Show "(edited)" badge. Only allow editing own messages.
**Files:** `src/server.mjs` (new endpoints), `static/index.html` (edit UI)
**Status:** TODO

---

## SPRINT 3: Rich Chat & Media

### S3-01: Image/screenshot upload in chat
**Source:** OCR shows screenshots pasted in chat. Gemini review confirms.
**Current code:** Chat is text-only. `{type: "chat", content: "string"}`. No file upload endpoint for chat media.
**Fix:** Add `POST /api/sessions/:id/upload` that accepts multipart form data, saves to `.sessions/{id}/.uploads/`, returns URL. Extend message model to support `{type: "image", url: "..."}`. Add paste handler in chat input for screenshots.
**Files:** `src/server.mjs` (upload endpoint + static serving), `static/index.html` (paste handler, image rendering)
**Status:** TODO

### S3-02: Inline diff rendering in chat
**Source:** OCR shows `App.tsx +2 -2` and `style: change accent color from orange to emerald` rendered as formatted diff blocks in chat
**Current code:** Agent output is plain text streamed as `agent_stream` messages. Git diff is only in the Git tab.
**Fix:** Parse agent output for diff patterns (`+++ --- @@`) and render them with syntax highlighting in chat. Show file change summary (filename, +lines, -lines) as compact cards.
**Files:** `static/index.html` (diff parser + renderer)
**Status:** TODO

### S3-03: Rich input box — mention #sessions, @people, +files, /commands
**Source:** OCR shows "Mention #sessions, @people, +files, and / for commands" in input placeholder
**Current code:** Input is a plain textarea. Only @ace is detected.
**Fix:** Add autocomplete dropdown for @mentions (users), #sessions, and /commands. Wire /commands to switch modes.
**Files:** `static/index.html` (autocomplete component)
**Status:** TODO

---

## SPRINT 4: Mode Switching & Smart Features

### S4-01: Chat mode vs Ace mode toggle
**Source:** OCR shows `[💬 Chat mode (⇧ Tab)]` and `[✦ Ace mode (⇧ Tab)]`
**Current code:** No mode concept. Chat and agent prompts are in the same input.
**Fix:** Add mode toggle (Tab key or button). In "Chat mode", messages are just text. In "Ace mode", everything typed is sent to the agent. Show current mode in input area.
**Files:** `static/index.html` (mode toggle UI + logic)
**Status:** TODO

### S4-02: Auto-detect dev server ports for live preview
**Source:** Gemini review. OCR shows preview auto-pop-up when `bun dev` starts.
**Current code:** Preview URL must be manually entered in `<input class="preview-url">`.
**Fix:** Watch terminal output for patterns like `localhost:XXXX` or `127.0.0.1:XXXX`. When detected, auto-update the preview iframe. Add a "Port detected" notification.
**Files:** `static/index.html` (parse terminal WS output for URLs), `src/server.mjs` (broadcast port detection)
**Status:** TODO

### S4-03: Summary block — prominent, always visible, auto-updating
**Source:** OCR shows right sidebar with "Updated accent color from orange to emerald throughout the App component..." summary
**Current code:** Session header has a small `summary` field shown only as `{s.summary ? ... : ''}`. Not prominent. Not auto-updating.
**Fix:** Add a persistent right sidebar or header block showing: last change summary, connected status, file changes count, commit hash. Auto-update when agent finishes.
**Files:** `static/index.html` (summary sidebar component)
**Status:** TODO

---

## SPRINT 5: Infrastructure & Safety

### S5-01: Authentication — basic user identity
**Source:** Code audit — zero auth.
**Current code:** `setupUser()` asks for a name via `prompt()` and stores in localStorage. No server-side validation. Anyone can impersonate anyone.
**Fix:** Add basic auth — either GitHub OAuth (for GitHub integration) or a simple token-based system. At minimum, store a server-side session cookie so users can't impersonate each other.
**Files:** `src/server.mjs` (auth middleware), `static/index.html` (login flow)
**Status:** TODO

### S5-02: Session workspace isolation — prevent path traversal and command injection
**Source:** Code audit — path traversal is checked on files endpoint but not on exec endpoint.
**Current code:** `execInSession()` runs arbitrary commands with no sanitization. A user could run `rm -rf /` or read `/etc/passwd`.
**Fix:** Add command allowlist or sandbox. Run exec in a restricted environment. At minimum, block dangerous commands (`rm -rf /`, `sudo`, etc.).
**Files:** `src/server.mjs` (command sanitization in execInSession)
**Status:** TODO

### S5-03: Agent queue — allow multiple agent requests per session
**Source:** Code audit — `if (!session || session.agentRunning) return;` silently drops requests.
**Current code:** If an agent is running and someone triggers another, it's silently ignored.
**Fix:** Queue agent requests. When current agent finishes, start the next one. Show queue position to users.
**Files:** `src/server.mjs` (add queue array to session)
**Status:** TODO

### S5-04: Session search and filtering
**Source:** OCR shows many sessions in sidebar. No search mechanism.
**Current code:** Sessions are rendered flat. No search, no filter.
**Fix:** Add search input in sidebar. Filter by session name. Add sort options (recent, name, active).
**Files:** `static/index.html` (search component + filter logic)
**Status:** TODO

---

## SPRINT 6: Proactive AI Dashboard

### S6-01: Proactive dashboard — AI summaries of team activity
**Source:** OCR shows "Team pulse" and "prompting me to keep working on my React hooks"
**Current code:** Dashboard is static. `showDashboard()` renders sessions from API. No AI summaries.
**Fix:** Add a background worker that periodically generates summaries of session activity. Store summaries. Show on dashboard: "Keep working on...", "Nate shipped a lobby channel", etc.
**Files:** `src/server.mjs` (summary worker), `static/index.html` (dashboard redesign)
**Status:** TODO

### S6-02: Session link in PR description
**Source:** Gemini review — "Ace includes a link back to the session in the PR body"
**Current code:** PR creation endpoint does `gh pr create --title ... --body "Created by Ace Workspace"`. No session link.
**Fix:** Include the workspace URL in the PR body: `"Created by Ace Workspace\n\nSession: {workspace_url}/session/{id}"`.
**Files:** `src/server.mjs` (update PR body template)
**Status:** TODO

---

## VERIFIED EXCLUSIONS (Gemini got wrong — NOT building these)

### SKIP-01: DiceBear avatars
**Gemini claim:** "automatically generates a DiceBear avatar for them"
**Verified:** The RUNNING file (`server.mjs`) has NO DiceBear. The old unused `server.ts` has it on line 348 but that file is never executed (`package.json` runs `server.mjs`). The active `POST /api/users` stores `body.avatar || ""` — empty string default, no generation.
**Action:** SKIP — already excluded from running code. The old `server.ts` should be cleaned up to avoid confusion.

### SKIP-02: Plan endpoint uses PUT
**Gemini claim:** "sends a PUT request to overwrite the entire plan"
**Verified:** Plan update is `POST /api/sessions/:id/plan` (line 501 of server.mjs). File writes use `PUT` (line 385). Gemini confused the two.
**Action:** SKIP — the code is correct as POST.

### SKIP-03: Uses node-pty
**Gemini claim:** "node-pty/bash"
**Verified:** Line 713 of server.mjs explicitly says `// Would need node-pty for proper resize, ignored for now`. The terminal uses `child_process.spawn("bash", [])`. No node-pty anywhere in `node_modules` or `package.json`.
**Action:** SKIP — node-pty is NOT used. This is accurately documented. Adding proper PTY support is a future enhancement but not a "gap" to fix.

---

## PRIORITY ORDER

| Sprint | Impact | Effort | Priority |
|---|---|---|---|
| Sprint 1 | HIGH — core UX | LOW | DO FIRST |
| Sprint 2 | MEDIUM — collaboration | MEDIUM | DO SECOND |
| Sprint 4 | HIGH — feels like Ace | MEDIUM | DO THIRD |
| Sprint 5 | MEDIUM — safety | LOW-MEDIUM | DO FOURTH |
| Sprint 3 | MEDIUM — rich media | HIGH | DO LATER |
| Sprint 6 | LOW — nice to have | HIGH | LAST |
