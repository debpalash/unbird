# Self-Hosting Guide

Everything you need to run your own unbird instance.

---

## Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 1 vCPU | 2 vCPU |
| **RAM** | 512 MB | 1 GB |
| **Disk** | 500 MB | 2 GB (with cache) |
| **OS** | Any Linux x64 | Ubuntu 22.04+ / Debian 12+ |
| **Runtime** | Docker **or** Bun v1.1+ | Docker |

You'll also need a valid X/Twitter account to generate API session cookies.

---

## Option 1: Docker (Recommended)

The smallest and fastest way to get running. The Alpine-based image is **~110 MB**.

### Quick Start

```bash
# 1. Clone
git clone https://github.com/user4/unbird.git && cd unbird

# 2. Configure
cp .env.example .env
nano .env  # Set X_USERNAME, X_PASSWORD, X_TOTP_SECRET, UNBIRD_HMAC_KEY

# 3. Run
docker compose up -d
```

Open **http://your-server-ip:3069** — done.

### Docker Compose Reference

```yaml
# docker-compose.yml (included in repo)
services:
  unbird:
    build: .
    container_name: unbird
    restart: unless-stopped
    ports:
      - "${UNBIRD_PORT:-3069}:3069"
    dns:
      - 8.8.8.8
      - 1.1.1.1
    env_file:
      - .env
    volumes:
      - ./session:/app/session
      - ./cache:/app/cache
```

### Pre-built Image

```bash
# Pull and run without cloning the repo
docker run -d \
  --name unbird \
  -p 3069:3069 \
  --dns 8.8.8.8 \
  -v ./session:/app/session \
  -v ./cache:/app/cache \
  --env-file .env \
  ghcr.io/debpalash/unbird:latest
```

---

## Option 2: Bare Metal (Bun)

Run directly with Bun — no containers needed.

```bash
# 1. Install Bun
curl -fsSL https://bun.sh/install | bash

# 2. Clone & install
git clone https://github.com/user4/unbird.git && cd unbird
bun install

# 3. Configure
cp .env.example .env
nano .env

# 4. Build & start
bun run build
bun run start
```

The server starts on port `3069` by default.

---

## Configuration

All settings live in `.env`. Copy from `.env.example` as a starting point.

### Required

| Variable | Description |
|----------|-------------|
| `X_USERNAME` | Your X/Twitter username |
| `X_PASSWORD` | Your X/Twitter password |
| `UNBIRD_HMAC_KEY` | Random secret key for admin auth (generate with `openssl rand -hex 32`) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `UNBIRD_PORT` | `3069` | Server port |
| `UNBIRD_HOSTNAME` | `localhost:3069` | Public hostname (for links) |
| `X_TOTP_SECRET` | — | TOTP secret if 2FA is enabled |
| `UNBIRD_PROXY` | — | Upstream HTTPS proxy for Twitter API |
| `UNBIRD_DEBUG` | `false` | Enable request logging |
| `CACHE_DIR` | `./cache` | Disk cache directory |

### Alternative Auth: Cookie File

Instead of username/password, you can provide existing session cookies:

```bash
mkdir -p session
echo '{"kind":"cookie","username":"you","id":"123","auth_token":"xxx","ct0":"yyy"}' > session/sessions.jsonl
```

---

## Putting It Behind HTTPS

For production, always serve unbird behind a reverse proxy with SSL.

### Caddy (Easiest)

```bash
# Install Caddy
sudo apt install -y caddy

# /etc/caddy/Caddyfile
unbird.yourdomain.com {
    reverse_proxy localhost:3069
}

sudo systemctl reload caddy
```

Caddy handles SSL certificates automatically via Let's Encrypt.

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name unbird.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/unbird.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/unbird.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3069;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Platform-Specific Guides

### DigitalOcean / Hetzner / Linode / Vultr

1. Create the cheapest VPS (1 vCPU, 512 MB RAM, ~$4-5/mo)
2. SSH in, install Docker: `curl -fsSL https://get.docker.com | sh`
3. Follow the Docker Quick Start above
4. Point a domain to your server IP and add the Caddy config above

### Railway / Render / Fly.io

1. Fork the repository on GitHub
2. Connect to your PaaS provider
3. Set build mode to **Docker**
4. Add environment variables in the dashboard
5. Set port to `3069`
6. Deploy

### Umbrel / CasaOS / Home Servers

1. SSH into your device
2. Create an `unbird` directory
3. Copy `docker-compose.yml` and `.env` into it
4. Add credentials to `.env`
5. Run `docker compose up -d`
6. Access at `http://<device-ip>:3069`

---

## Admin API

Some endpoints require the admin key (`UNBIRD_HMAC_KEY`). Pass it via the `X-Admin-Key` header:

```bash
# Check session pool health
curl -H "X-Admin-Key: YOUR_KEY" http://localhost:3069/api/sessions

# Force refresh home feed cache
curl -X POST -H "X-Admin-Key: YOUR_KEY" http://localhost:3069/api/home-feed/refresh

# Add a session via cookies
curl -X POST -H "X-Admin-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"auth_token":"xxx","ct0":"yyy","username":"you"}' \
  http://localhost:3069/api/sessions/add
```

---

## Updating

```bash
cd unbird
git pull
docker compose up -d --build
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `FATAL: UNBIRD_HMAC_KEY is using a default value` | Set `UNBIRD_HMAC_KEY` to a random string in `.env` |
| `dns error: failed to lookup address` | Add `dns: [8.8.8.8, 1.1.1.1]` to your `docker-compose.yml` |
| `Too many login attempts` | Login is rate-limited to 5 attempts per 15 minutes. Wait and retry. |
| `Session pool empty` | Check your credentials in `.env`. Run `docker logs unbird` for details. |
| Container keeps restarting | Run `docker logs unbird --tail 50` to see the error. |
