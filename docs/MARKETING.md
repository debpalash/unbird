# Startup & Marketing Checklist for Unbird

## 1. Configure the GitHub UI
Go to the **[Unbird Repository Settings](https://github.com/user4/unbird)** and manually do the following:

- [ ] **About Description:** Update to `A privacy-first, self-hosted X/Twitter alternative frontend. No tracking, no algorithms, OSINT-ready.`
- [ ] **Social Preview (Banner):** Go to `Settings > General > Social preview`, and upload `.github/assets/cover.png`
- [ ] **Website:** Make sure to set `https://unbird.dev`
- [ ] **Topics:** Click the ⚙️ icon by "About" and paste these tags: 
  `twitter-frontend, privacy, self-hosted, osint, react, bun, alternative-frontend, twitter-client, anti-tracking, open-source`

---

## 2. Submit to "Awesome Lists"
Submitting PRs to curated lists drives enormous, passive developer traffic over time.

### Awesome Self-Hosted
* **Repo:** `awesome-selfhosted/awesome-selfhosted`
* **Section:** Software > Social Networks and Forums
* **What to Add:**
  ```markdown
  - [unbird](https://github.com/user4/unbird) - A privacy-first, high-performance X/Twitter alternative frontend. No tracking, chronologically ordered, proxy-based media caching, and OSINT-ready. (`AGPL-3.0`, `Bun`/`Docker`)
  ```

### Awesome Privacy
* **Repo:** `Lissy93/awesome-privacy`
* **Section:** Social Media > Frontends
* **What to Add:**
  ```markdown
  - [unbird](https://github.com/user4/unbird) - A sleek, extremely fast read-only X/Twitter proxy frontend prioritizing chronological feeds, disk-caching, and media anonymization without algorithmic manipulation.
  ```

---

## 3. High-Traffic Subreddits (Launch Day Recommendations)
When you launch the repository, cross-post with distinct angles:

* **r/selfhosted** — Focus on the Docker implementation, disk-caching, and chronological feed features. (This subreddit drives the most traffic).
* **r/privacy** — Emphasize that all requests are proxied server-side and no IP is leaked to Twitter.
* **r/SideProject** — Show a screen recording of the buttery smooth 'Scroll Feed' UI.
* **r/OSINT** — Highlight the Shadowban Checker, Trust Score, and Account Profiler tools you built into the UI.

---

> **Tip:** Make sure to reply to early GitHub issues promptly. Activity drives GitHub's trending algorithm!
