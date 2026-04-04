<p align="center">
  <img src="public/logo.svg" width="80" alt="unbird logo" />
</p>

<h1 align="center">unbird</h1>

<p align="center">
  <strong>A privacy-first, self-hosted X/Twitter frontend.</strong><br/>
  No tracking. No ads. No algorithms. Just tweets.
</p>

<p align="center">
  <a href="#why">Why</a> •
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="SELF-HOSTING.md">Self-Hosting</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

---

## Why

Twitter's official clients track everything you read, who you follow, how long you look at a tweet, and what you scroll past. All of this data is sold to advertisers and used to manipulate your feed through opaque algorithms.

**unbird** gives you back control:

- **Your data stays on your server.** No telemetry, no analytics, no third-party requests.
- **No algorithmic feed.** See tweets in chronological order from people you follow.
- **All media is proxied** through your server — Twitter never sees your IP address.
- **Open source (AGPL-3.0)** — audit, modify, and redistribute freely.

---

## Features

### Timeline & Feed
- **Home Feed** — chronological timeline with intelligent caching and rate-limit fallbacks
- **Following** — browse your following list with pagination
- **Bookmarks** — view saved posts
- **Notifications** — timeline notifications
- **DMs** — read your direct messages
- **Search** — full-text tweet search with autocompletion

### Media
- **Inline Video** — autoplay-on-scroll with muted toggle
- **Scroll Feed** — TikTok-style vertical swiper with keyboard shortcuts
- **Lightbox** — high-res modal image/video viewer
- **Privacy Proxy** — all images and videos are fetched server-side

### OSINT & Analytics
- **Shadowban Checker** — detect if an account is restricted
- **Account Profiler** — behavioral analysis (posting hours, sentiment, engagement)
- **Trust Score** — credibility grade based on account age, verification, and link analysis
- **Metrics Dashboard** — follower stats, earnings estimates via Social Blade
- **Location Map** — geolocated activity visualization

### Interface
- **TweetDeck Mode** — multi-column layout
- **Reader View** — distraction-free thread reading
- **Ghost Mode Vault** — AES-GCM encrypted alternate account switching
- **PWA** — installable as a native app with offline support
- **Keyboard Shortcuts** — full navigation (press `?` for help)
- **Responsive** — desktop sidebar + mobile bottom nav

### Infrastructure
- **Session Pool** — round-robin rotation with per-endpoint rate limiting
- **Proxy Pool** — auto-scraped, validated, and scored (500+ free proxies)
- **Disk Caching** — persistent feed and timeline caches
- **109 MB Docker Image** — Alpine-based, runs on the cheapest VPS

---

## Quick Start

### Docker (Recommended)

```bash
git clone https://github.com/user4/unbird.git && cd unbird
cp .env.example .env
nano .env   # Set X_USERNAME, X_PASSWORD, UNBIRD_HMAC_KEY
docker compose up -d
```

Open **http://localhost:3069** — done.

> **Tip:** Generate a secure admin key: `openssl rand -hex 32`

### From Source

```bash
git clone https://github.com/user4/unbird.git && cd unbird
bun install
cp .env.example .env
nano .env
bun run dev        # Development (hot reload)
# — or —
bun run build && bun run start   # Production
```

- **Frontend:** http://localhost:5173 (dev) or http://localhost:3069 (prod)
- **API:** http://localhost:3069/api/health

For complete deployment guides (Docker, VPS, PaaS, home servers, reverse proxy), see **[SELF-HOSTING.md](SELF-HOSTING.md)**.

---

## Configuration

All config is via environment variables. See [`.env.example`](.env.example) for the full list.

| Variable | Default | Description |
| --- | --- | --- |
| `X_USERNAME` | — | Twitter username for auto-login |
| `X_PASSWORD` | — | Twitter password |
| `X_TOTP_SECRET` | — | TOTP secret (if 2FA is enabled) |
| `UNBIRD_HMAC_KEY` | — | Admin key for protected endpoints |
| `UNBIRD_PORT` | `3069` | Server port |
| `UNBIRD_HOSTNAME` | `localhost:3069` | Public hostname |
| `UNBIRD_PROXY` | — | Upstream HTTPS proxy |
| `UNBIRD_DEBUG` | `false` | Request logging |

---

## Architecture

```
unbird/
├── src/
│   ├── App.tsx               # SPA router + all pages
│   ├── index.ts              # Bun server entry
│   ├── web/                  # React components
│   │   ├── components/       # Layout, TweetCard, Lightbox, ReaderView
│   │   └── context/          # Auth, session, theme providers
│   └── server/               # Hono API server
│       ├── app.ts            # Route composition + middleware
│       ├── config.ts         # Environment config
│       ├── twitter/          # GraphQL API client + parser
│       ├── sessions/         # Session pool, login, manager
│       ├── proxy/            # Proxy pool, scraper, validator
│       └── routes/           # API route modules
├── Dockerfile                # Alpine x64 production image
├── docker-compose.yml        # One-command deployment
└── .env.example              # Configuration template
```

### How It Works

1. **Login** — Raw HTTP login with TLS fingerprint impersonation via [wreq-js](https://github.com/nicr9/wreq-js). No browser automation needed.
2. **Session Pool** — Rotates requests across sessions, tracking per-endpoint rate limits and auto-waiting for resets.
3. **Proxy Pool** — Scrapes 15+ public proxy lists, validates concurrently, scores by latency. Refreshed every 6 hours.
4. **Feed Builder** — Constructs timelines via `HomeLatestTimeline`, with 3-level cascading fallbacks when rate-limited.
5. **Media Proxy** — All images/videos fetched server-side via `/api/image` and `/api/video`, preventing Twitter from tracking your IP.

---

## API

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | — | Server health + stats |
| `GET` | `/api/home-feed` | — | Home timeline |
| `GET` | `/api/user/:username/tweets` | — | User tweets |
| `GET` | `/api/user/:username/media` | — | User media |
| `GET` | `/api/search?q=...` | — | Tweet search |
| `GET` | `/api/status/:id` | — | Single tweet + thread |
| `GET` | `/api/metrics/:username` | — | OSINT analytics |
| `GET` | `/api/image?url=...` | — | Image proxy (Twitter domains only) |
| `GET` | `/api/video?url=...` | — | Video proxy (Twitter domains only) |
| `GET` | `/api/sessions` | Admin | Session pool health |
| `POST` | `/api/sessions/add` | Admin | Add session via cookies |
| `POST` | `/api/home-feed/refresh` | Admin | Force feed rebuild |

Admin endpoints require the `X-Admin-Key` header set to your `UNBIRD_HMAC_KEY`.

---

## Security

- **Media proxy is restricted** to Twitter domains only (SSRF protection)
- **Admin endpoints** are gated behind `UNBIRD_HMAC_KEY`
- **Login is rate-limited** to 5 attempts per IP per 15 minutes
- **CORS** is restricted to same-origin in production
- **No `dangerouslySetInnerHTML`** anywhere — all user content is sanitized
- **Non-root container user** — runs as `unbird` (UID 1001)
- **No credentials in the Docker image** — secrets are mounted at runtime

For security issues, see [SECURITY.md](SECURITY.md).

---

## Contributing

Contributions are welcome. Please follow these guidelines:

1. **Fork** the repository and create a branch from `main`
2. **Install** dependencies: `bun install`
3. **Run** the dev server: `bun run dev`
4. **Test** your changes locally
5. **Submit** a pull request with a clear description

### Development

```bash
bun run dev          # Start API + Vite dev server (hot reload)
bun run dev:api      # API server only
bun run dev:client   # Vite frontend only
bun run build        # Production build
```

### Guidelines

- Keep PRs focused — one feature or fix per PR
- Follow the existing code style (no linter config needed, just be consistent)
- Don't commit credentials, API keys, or personal data
- Test on both desktop and mobile layouts

---

## License

[AGPL-3.0](LICENSE) — Free as in freedom.

If you run a modified version of unbird as a public service, you must make your source code available under the same license.

---

<p align="center">
  <sub>Built for those who value privacy over surveillance capitalism.</sub>
</p>
