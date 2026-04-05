<p align="center">
  <img src="public/logo.svg" width="80" alt="unbird logo" />
</p>

<h1 align="center">unbird</h1>

<p align="center">
  <a href="https://github.com/user4/unbird/stargazers"><img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/user4/unbird?style=flat-square&color=00A3FF"></a>
  <a href="https://github.com/user4/unbird/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/user4/unbird?style=flat-square&color=indigo"></a>
  <img alt="Bun" src="https://img.shields.io/badge/Bun-%23000000.svg?style=flat-square&logo=bun&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-Ready-%232496ED.svg?style=flat-square&logo=docker&logoColor=white">
</p>

<p align="center">
  <strong>A privacy-first, self-hosted X/Twitter alternative frontend.</strong><br/>
  No tracking. No ads. No algorithms. OSINT-ready. Just tweets.<br/>
  <em>Inspired by Nitter and Invidious.</em>
</p>

---

<p align="center">
  <a href="#why-unbird">Why</a> •
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="docs/SELF-HOSTING.md">Self-Hosting</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>


<img width="1051" height="924" alt="image" src="https://github.com/user-attachments/assets/eca03542-918b-4a70-bb93-aed8de2b50a9" />

---

## Why unbird?

Twitter's official clients track everything you read and manipulate your feed through opaque algorithms. **unbird** gives you back control:

- **Your data stays on your server.** No telemetry, no analytics, no third-party requests.
- **No algorithmic feed.** Chronological order from people you follow.
- **Media is proxied** through your server — Twitter never sees your IP address.
- **Open source (AGPL-3.0)** — audit, modify, and redistribute freely.

---

## Public Instances

Try out `unbird` on a community-hosted instance before hosting your own:

| Instance | Hosted By | Location | Notes |
| -------- | --------- | -------- | ----- |
| [unbird.ki7.workers.dev](https://unbird.ki7.workers.dev/) | `@ki7` | Global (Cloudflare) | Official Demo Instance |

*(Have an instance? Open a PR to add it here!)*

---

## Quick Start

### Docker (GHCR)

The fastest way to get started is using the pre-built GitHub Container Registry image:

```bash
docker run -d \
  -p 3069:3069 \
  -e X_USERNAME=your_username \
  -e X_PASSWORD=your_password \
  ghcr.io/user4/unbird:latest
```

Open **http://localhost:3069** — done!

### Docker Compose

```yaml
services:
  unbird:
    image: ghcr.io/user4/unbird:latest
    ports:
      - "3069:3069"
    environment:
      - X_USERNAME=your_username
      - X_PASSWORD=your_password
```

### From Source

```bash
git clone https://github.com/user4/unbird.git && cd unbird
bun install
cp .env.example .env
nano .env

bun run build && bun run start
```
- **Frontend / API:** http://localhost:3069

For complete deployment guides (VPS, reverse proxy, advanced setup), see **[SELF-HOSTING.md](SELF-HOSTING.md)**.

---

## Features

- **Timeline & Feed**: Chronological Home Feed, Following, Bookmarks, and full-text Search.
- **Media Proxy**: All images/videos fetched server-side via `/api/image` and `/api/video` (SSRF protected). Inline video autoplay, TikTok-style scroll feed, Lightbox.
- **OSINT & Analytics**: Shadowban Checker, Account Profiler, Trust Score, Metrics Dashboard, Location Map.
- **Interface**: TweetDeck Mode, Reader View, PWA, Keyboard Shortcuts, Dark Mode.
- **Ghost Mode Vault**: AES-GCM encrypted alternate account switching.
- **Infrastructure**: Auto-rotating Session Pool, Proxy Pool with validator, Disk Caching, 109 MB Alpine Docker Image.

---

## Configuration

All config is via environment variables. See [\`.env.example\`](.env.example) for the full list.

| Variable | Description |
| --- | --- |
| `X_USERNAME` | Twitter username for auto-login |
| `X_PASSWORD` | Twitter password |
| `X_TOTP_SECRET` | TOTP secret (if 2FA is enabled) |
| `UNBIRD_HMAC_KEY` | Admin key for protected endpoints |
| `UNBIRD_PORT` | Server port (default: 3069) |
| `UNBIRD_PROXY` | Upstream HTTPS proxy (optional) |

---

## Contributing

Contributions are welcome! 

1. Fork the repo & clone it.
2. Run `bun install`
3. Start dev servers: `bun run dev`
4. Submit a PR.

---

## License

[AGPL-3.0](LICENSE) — Free as in freedom.

If you run a modified version as a public service, you must make source code available under the same license.
