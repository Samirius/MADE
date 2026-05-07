# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in MADE, please report it responsibly:

- **Email**: security@sabbk.com
- **Do not** file a public GitHub issue for security vulnerabilities.

We will acknowledge your report within 48 hours and aim to provide a fix within 7 days.

## Authentication

MADE supports token-based authentication via the `MADE_TOKEN` environment variable.

- **Production**: Always set `MADE_TOKEN` to a strong, random string. Without it, the API is open to all requests.
- **Development**: You may leave it unset for convenience, but a warning will be logged at startup.

Token can be provided via:
- Query parameter: `?token=<MADE_TOKEN>`
- HTTP header: `Authorization: Bearer <MADE_TOKEN>`

## CORS

By default, MADE does not set a wildcard `Access-Control-Allow-Origin` header. Configure allowed origins via `MADE_CORS_ORIGIN`.

## File Uploads

- Maximum upload size: **5 MB**
- Allowed file types: `png`, `jpg`, `jpeg`, `gif`, `webp`
- **SVG is not allowed** due to XSS risk (SVG can contain embedded JavaScript).

## Agent Permissions

The `--dangerously-skip-permissions` flag for Claude Code is **disabled by default**. Enable it only if you understand the risks:

```bash
MADE_CLAUDE_UNSAFE=true
```

This grants the agent unrestricted filesystem and command execution access.

## Known Security Considerations

1. **Terminal access**: WebSocket-based terminal sessions provide shell access. Always run behind authentication in production.
2. **Agent commands**: Agents can execute arbitrary commands in their session worktree. Sandbox appropriately.
3. **No TLS**: MADE does not handle TLS. Use a reverse proxy (nginx, Caddy) with HTTPS in production.
4. **Session isolation**: Each session gets its own git worktree. Files are scoped to the session directory, but there is no OS-level sandboxing.

## Security Hardening Checklist

- [ ] Set `MADE_TOKEN` to a strong random value
- [ ] Configure `MADE_CORS_ORIGIN` to your frontend domain
- [ ] Run behind a reverse proxy with HTTPS
- [ ] Keep `MADE_CLAUDE_UNSAFE=false` unless explicitly needed
- [ ] Restrict network access to the MADE port
- [ ] Regularly update dependencies (`npm audit`)
