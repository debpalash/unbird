# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in unbird, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email: **security@unbird.dev** (or open a private security advisory on GitHub).

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgment** within 48 hours
- **Assessment** within 1 week
- **Fix** within 2 weeks for critical issues

## Credential Handling

unbird handles sensitive Twitter/X credentials (passwords, session tokens, TOTP secrets). These are stored locally and never transmitted to third parties.

- Credentials are stored in `.env` or `session/` directory — both gitignored
- Session tokens are stored in `session/sessions.jsonl` — never committed to git
- All API requests are made directly to Twitter's API — no intermediary servers

## Scope

The following are in scope for security reports:

- Credential exposure (e.g., logging passwords, leaking tokens)
- Authentication bypass
- Server-side request forgery (SSRF) via proxy endpoints
- Cross-site scripting (XSS) in rendered tweet content
- Path traversal via API routes

## Out of Scope

- Twitter API rate limiting behavior
- Proxy pool reliability
- UI/UX bugs that don't have security implications
