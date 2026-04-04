// SPDX-License-Identifier: AGPL-3.0-only
// Config loader

import type { Config, Prefs } from "./types";

export function loadConfig(): Config {
  const hmacKey = process.env.UNBIRD_HMAC_KEY ?? "secretkey";
  if (hmacKey === "secretkey" || hmacKey === "change-me-in-production") {
    if (process.env.NODE_ENV === "production") {
      console.error("[config] ❌ FATAL: UNBIRD_HMAC_KEY is using a default value in production. Set a secure key and restart.");
      process.exit(1);
    }
    console.warn("[config] ⚠️  UNBIRD_HMAC_KEY is using a default value — set a secure key for production!");
  }
  return {
    address: process.env.UNBIRD_ADDRESS ?? "0.0.0.0",
    port: parseInt(process.env.UNBIRD_PORT ?? "3069", 10),
    useHttps: process.env.UNBIRD_HTTPS === "true",
    httpMaxConns: parseInt(process.env.UNBIRD_MAX_CONNS ?? "100", 10),
    title: process.env.UNBIRD_TITLE ?? "unbird",
    hostname: process.env.UNBIRD_HOSTNAME ?? "localhost:3069",
    staticDir: process.env.UNBIRD_STATIC_DIR ?? "public",
    hmacKey,
    base64Media: process.env.UNBIRD_BASE64_MEDIA === "true",
    enableDebug: process.env.UNBIRD_DEBUG === "true",
    proxy: process.env.UNBIRD_PROXY ?? "",
    proxyAuth: process.env.UNBIRD_PROXY_AUTH ?? "",
  };
}

export const defaultPrefs: Prefs = {
  replaceTwitter: "",
  replaceYouTube: "",
  replaceReddit: "",
  hlsPlayback: false,
  mp4Playback: true,
  proxyVideos: true,
  muteVideos: false,
  autoplayGifs: true,
  infiniteScroll: true,
  stickyProfile: true,
  stickyNav: true,
  bidiSupport: false,
  hideTweetStats: false,
  hideBanner: false,
  hidePins: false,
  hideReplies: false,
  hideCommunityNotes: false,
  mediaView: "Timeline",
  theme: "Auto",
  gallerySize: "Medium",
  compactGallery: false,
};
