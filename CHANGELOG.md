# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-04

### Added
- Home feed with intelligent caching and rate-limit-aware fallbacks
- User profiles with tweets, replies, media, and likes tabs
- TikTok-style scroll feed with keyboard shortcuts (↑↓ navigate, Space auto-scroll, M mute, L like, ? help)
- Full-text tweet search with autocompletion
- Bookmarks, notifications, and DM reading
- Inline video playback with autoplay-on-scroll
- Lightbox for high-res media viewing
- Reader view for distraction-free reading
- OSINT metrics panel (trust score, earnings, location history)
- Shadowban checker
- Account profiler with behavioral analysis
- TweetDeck multi-column mode
- Session pool with round-robin rotation and per-endpoint rate limiting
- Auto-scraped proxy pool (500+ proxies) with scoring and validation
- Image/video proxy for privacy (prevents tracking & CORS bypass)
- PWA support with offline caching
- Raw HTTP login with TLS fingerprint impersonation (no browser needed)
- Browser-based login via Playwright (optional)
- Framer Motion route transitions
- Dark mode UI with glassmorphism design
