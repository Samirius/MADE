# MADE API Reference

**Base URL:** `http://localhost:3100`  
**Auth:** Set `MADE_TOKEN` env var to enable. Pass as `Authorization: Bearer <token>` header or `?token=<token>` query param.  
**Content-Type:** `application/json` for all request bodies.

---

## Health Check

### `GET /health`

Returns server health status.

**Response:** `200`
```json
{
  "status": "ok",
  "version": "0.5.0",
  "uptime": 12345
}
```

---

## Onboarding

### `GET /api/onboard/detect`

Detects git provider and available agents on the host.

**Auth:** No

**Response:** `200`
```json
{
  "gitProvider": "github",
  "agents": ["claude", "opencode"],
  "hasGit": true,
  "hasGitHubCLI": true
}
```

---

## Agents

### `GET /api/agents`

Lists available agent adapters and their status.

**Auth:** Required if MADE_TOKEN set

**Response:** `200`
```json
[
  {
    "id": "claude",
    "name": "Claude Code",
    "available": true,
    "command": "claude"
  },
  {
    "id": "opencode",
    "name": "OpenCode",
    "available": false,
    "command": "opencode"
  }
]
```

---

## Git Provider

### `GET /api/git/provider`

Returns the detected git provider for the project directory.

**Auth:** Required if MADE_TOKEN set

**Response:** `200`
```json
{
  "provider": "github",
  "remote": "https://github.com/user/repo.git",
  "branch": "main"
}
```

---

## Sessions

### `GET /api/sessions`

List all sessions.

**Response:** `200`
```json
[
  {
    "id": "abc123",
    "name": "My Project",
    "workDir": "/projects/my-app",
    "createdAt": "2026-05-08T10:00:00Z",
    "participants": ["user1", "user2"],
    "messageCount": 42,
    "agentRunning": false
  }
]
```

### `POST /api/sessions`

Create a new session.

**Request body:**
```json
{
  "name": "My Project",
  "workDir": "/projects/my-app"
}
```

**Response:** `201`
```json
{
  "id": "abc123",
  "name": "My Project",
  "workDir": "/projects/my-app",
  "createdAt": "2026-05-08T10:00:00Z"
}
```

### `GET /api/sessions/:id`

Get session details.

**Response:** `200` — session object  
**Error:** `404` `{"error":"Session not found"}`

### `DELETE /api/sessions/:id`

Delete a session. Broadcasts `session_deleted` to all WebSocket clients.

**Response:** `200` `{"ok":true}`

---

## Agent

### `POST /api/sessions/:id/agent`

Spawn an AI agent in the session's working directory.

**Request body:**
```json
{
  "prompt": "Fix the login bug in auth.js",
  "userId": "user1",
  "model": "opus",
  "agentId": "claude"
}
```

**Response:** `200` `{"ok":true}`  
**Note:** Agent runs asynchronously. Results stream via WebSocket (`agent_start`, `agent_stream`, `agent_done` events).

---

## Command Execution

### `POST /api/sessions/:id/exec`

Execute a shell command in the session's working directory.

**Request body:**
```json
{
  "command": "npm test",
  "userId": "user1"
}
```

**Response:** `200` `{"ok":true}`  
**Note:** Dangerous commands (`rm -rf /`, `sudo`, `> /dev/`) are blocked.

### `POST /api/sessions/:id/exec/abort`

Abort the currently running command or agent.

**Response:** `200`
```json
{"ok": true}
```
or
```json
{"ok": false}
```

---

## Messages

### `GET /api/sessions/:id/messages`

Get all messages in a session.

**Response:** `200`
```json
[
  {
    "id": "msg1",
    "userId": "user1",
    "content": "Hello world",
    "type": "user",
    "timestamp": "2026-05-08T10:00:00Z"
  },
  {
    "id": "msg2",
    "userId": "claude",
    "content": "I'll fix that bug now.",
    "type": "agent",
    "timestamp": "2026-05-08T10:00:05Z"
  }
]
```

### `GET /api/sessions/:id/messages/:msgId`

Get a specific message.

**Response:** `200` — message object  
**Error:** `404`

### `PUT /api/sessions/:id/messages/:msgId`

Edit a message. Broadcasts `message_edited` via WebSocket.

**Request body:**
```json
{
  "content": "Updated message text"
}
```

**Response:** `200` — updated message object

### `DELETE /api/sessions/:id/messages/:msgId`

Delete a message. Broadcasts `message_deleted` via WebSocket.

**Response:** `200` `{"ok":true}`

---

## Users

### `GET /api/users`

List connected users.

**Response:** `200`
```json
[
  {"id": "user1", "name": "Alice", "avatar": "👩‍💻"},
  {"id": "user2", "name": "Bob", "avatar": "👨‍💻"}
]
```

### `POST /api/users`

Register or update a user.

**Request body:**
```json
{
  "id": "user1",
  "name": "Alice",
  "avatar": "👩‍💻"
}
```

**Response:** `200` — user object

---

## Files

### `GET /api/sessions/:id/files`

List files in session's working directory. Supports `?path=subdir` parameter.

**Response:** `200`
```json
[
  {"name": "src", "type": "directory", "size": 0},
  {"name": "package.json", "type": "file", "size": 1234},
  {"name": "README.md", "type": "file", "size": 5678}
]
```

### `GET /api/sessions/:id/files/path/to/file`

Read a specific file's content.

**Response:** `200` — raw file content with correct Content-Type  
**Error:** `403` (path traversal) | `404`

### `PUT /api/sessions/:id/files/path/to/file`

Write content to a file.

**Request body:**
```json
{
  "content": "console.log('hello');"
}
```

**Response:** `200` `{"ok":true}`

---

## Preview

### `GET /api/sessions/:id/preview`

Preview the session's project in an iframe. Defaults to `/index.html`.

### `GET /api/sessions/:id/preview/path/to/file.html`

Preview a specific file. Serves static content from the workDir.

---

## Git Operations

### `GET /api/sessions/:id/git/status`

Get git status for the session's working directory.

**Response:** `200`
```json
{
  "branch": "main",
  "ahead": 2,
  "behind": 0,
  "staged": ["src/auth.js"],
  "modified": ["package.json"],
  "untracked": ["new-file.js"]
}
```

### `GET /api/sessions/:id/git/diff`

Get the current diff (staged + unstaged).

**Response:** `200` — raw diff text

### `POST /api/sessions/:id/git/commit`

Stage all changes and commit.

**Request body:**
```json
{
  "message": "fix: login bug in auth"
}
```

**Response:** `200` `{"ok":true, "hash": "abc1234"}`

### `POST /api/sessions/:id/git/pr`

Stage, commit, push, and create a pull request.

**Request body:**
```json
{
  "title": "Fix login bug",
  "body": "Resolves issue with auth token validation",
  "branch": "fix/login-hermes"
}
```

**Response:** `200`
```json
{
  "ok": true,
  "url": "https://github.com/user/repo/pull/42",
  "branch": "fix/login-hermes"
}
```

---

## Plan

### `GET /api/sessions/:id/plan`

Get the session's plan document.

**Response:** `200`
```json
{"plan": "# Sprint Plan\n\n- [ ] Task 1\n- [x] Task 2"}
```

### `POST /api/sessions/:id/plan`

Update the plan document. Broadcasts `plan_updated` via WebSocket.

**Request body:**
```json
{"plan": "# Updated Plan\n\n- [x] Task 1\n- [ ] Task 2"}
```

**Response:** `200` `{"ok":true}`

### `DELETE /api/sessions/:id/plan`

Delete the plan document.

**Response:** `200` `{"ok":true}`

### `POST /api/sessions/:id/generate-plan`

Generate a plan using the project's AI agent.

**Request body:**
```json
{
  "prompt": "Create a plan for implementing user auth",
  "userId": "user1"
}
```

**Response:** `200` `{"ok":true}`  
**Note:** Plan is generated asynchronously and broadcast via WebSocket.

---

## Uploads

### `POST /api/sessions/:id/upload`

Upload an image file (PNG, JPG, GIF, WEBP only). Validates magic bytes.

**Request:** `multipart/form-data` with field `file`

**Response:** `200`
```json
{
  "ok": true,
  "message": {
    "id": "msg-upload-1",
    "type": "image",
    "fileName": "screenshot.png",
    "fileSize": 45,
    "url": "/api/sessions/abc123/uploads/screenshot-12345.png"
  }
}
```

**Error:** `400` — file type not allowed, magic byte mismatch, or file too large

### `GET /api/sessions/:id/uploads/:filename`

Serve an uploaded file.

---

## Activity

### `GET /api/activity`

Get recent activity across all sessions (last 24 hours).

**Response:** `200`
```json
[
  {
    "type": "message",
    "sessionId": "abc123",
    "sessionName": "My Project",
    "userId": "user1",
    "timestamp": "2026-05-08T10:00:00Z",
    "summary": "Fixed the login bug"
  }
]
```

---

## WebSocket Events

Connect to `ws://host/ws?sessionId=<id>&userId=<userId>`  
Auth: pass `token` query param when MADE_TOKEN is set.

### Client → Server

| Event | Description |
|-------|-------------|
| `message` | Send a chat message `{content, userId, type}` |
| `plan_typing` | Signal plan editor activity `{userId}` |
| `plan_updated` | Push plan changes `{plan}` |

### Server → Client

| Event | Description |
|-------|-------------|
| `message` | New chat message |
| `message_edited` | Message was edited |
| `message_deleted` | Message was deleted |
| `agent_start` | Agent started working `{agentId, model}` |
| `agent_stream` | Agent streaming output `{content}` |
| `agent_done` | Agent finished `{success}` |
| `session_created` | New session created |
| `session_updated` | Session metadata changed |
| `session_deleted` | Session was deleted |
| `plan_updated` | Plan document changed |
| `plan_typing` | Someone is editing the plan `{userId}` |

### Terminal WebSocket

Connect to `ws://host/term/<sessionId>` for a full PTY terminal.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MADE_PORT` | `3100` | Server port |
| `MADE_HOST` | `0.0.0.0` | Server bind address |
| `MADE_TOKEN` | (none) | Auth token. Set for production. |
| `MADE_CORS_ORIGIN` | (same-origin) | CORS allowed origin |
| `MADE_PROJECT_DIR` | `~/made-projects` | Default project directory |
| `MADE_AGENT_CMD` | (auto-detect) | Default agent command |
| `MADE_CLAUDE_UNSAFE` | `false` | Allow Claude --dangerously-skip-permissions |
| `MADE_DATA_DIR` | `~/.made-data` | Session persistence directory |
| `GITHUB_TOKEN` | (none) | GitHub API token for PR creation |
| `GITLAB_TOKEN` | (none) | GitLab API token |
| `GITEA_TOKEN` | (none) | Gitea API token |
| `BITBUCKET_TOKEN` | (none) | Bitbucket API token |
| `BITBUCKET_USER` | (none) | Bitbucket username |

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Description of what went wrong"
}
```

Common status codes:
- `400` — Bad request (invalid input, blocked command, bad file type)
- `401` — Unauthorized (MADE_TOKEN required but not provided)
- `403` — Forbidden (path traversal attempt)
- `404` — Not found (session, message, file)
- `500` — Server error
