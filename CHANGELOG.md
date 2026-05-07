# Changelog

All notable changes to MADE will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.0] - 2026-05-07

### Security
- **CORS hardening**: Removed wildcard `Access-Control-Allow-Origin: *`. Origin is now configurable via `MADE_CORS_ORIGIN` env var. Default is same-origin (no header sent).
- **SVG upload removal**: Removed SVG from the allowed upload whitelist to prevent stored XSS attacks via malicious SVG files.
- **Auth overhaul**: Added startup warning when `MADE_TOKEN` is not set. Replaced the empty-string check with a null check.
- **WebSocket auth**: Added `Authorization: Bearer` header support for WebSocket connections, in addition to the existing query parameter.
- **Claude adapter permissions**: `--dangerously-skip-permissions` is now opt-in via `MADE_CLAUDE_UNSAFE=true` instead of always-on.
- **Silent catch cleanup**: Added `console.error` logging to 9 previously silent catch blocks across server.mjs, opencode.mjs, session.mjs, and git-provider.mjs.
- **.gitignore**: Added `.made-data/` and `.uploads/` entries.
- **Dead code removal**: Deleted `src/server.ts` and `tsconfig.json` (unused TypeScript artifacts).
- **New files**: Added `.env.example`, `SECURITY.md`, and `CHANGELOG.md`.

## [0.3.0] - 2026-05-03

### Added
- File upload support with multipart form parsing
- Upload serving endpoint with content-type detection
- Git provider abstraction (GitHub, GitLab, Gitea, Bitbucket)
- PR/MR creation via CLI tools or API fallback
- Activity feed / team pulse endpoint

### Changed
- Improved agent output streaming and error handling
- Session persistence now keeps last 500 messages

## [0.2.0] - 2026-04-28

### Added
- WebSocket terminal sessions with PTY support
- Agent queue system for concurrent session management
- Session plans API (create, read, delete)
- Message editing and deletion endpoints
- Multi-user participant tracking

### Changed
- Refactored session management into SessionManager class
- Improved onboarding/agent detection flow

## [0.1.0] - 2026-04-22

### Added
- Initial release
- Multiplayer agentic development environment
- Real-time WebSocket communication
- Session-based worktree isolation
- Claude Code and OpenCode agent adapters
- Token-based authentication
- JSON file persistence for sessions and users
- Pure Node.js, zero external dependencies (except ws and node-pty)
