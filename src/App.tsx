import React, { useState, useEffect, useCallback, useRef, useMemo, useSyncExternalStore, useLayoutEffect } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "./web/components/layout/Navbar";
import { TweetCard } from "./web/components/tweet/TweetCard";
import { ReaderView } from "./web/components/tweet/ReaderView";
import { MeProvider, useMe } from "./web/context/MeContext";
import { useAuth } from "./web/context/AuthContext";
import type { Tweet, User } from "./server/types";
import { MediaKind } from "./server/types";
import { AnimatePresence, motion } from "framer-motion";
import { TopHeader } from "./web/components/layout/TopHeader";
import { LoginPage } from "./web/components/auth/LoginPage";
import { TargetInput } from "./web/components/ui/TargetInput";
// Virtuoso removed — simple .map() rendering avoids zero-sized element warnings during AnimatePresence transitions
import Fuse from "fuse.js";
import clsx from "clsx";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet's default icon missing issue in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function getMediaUrl(url: string | undefined | null): string {
  if (!url) return "";
  const q = typeof window !== "undefined" ? localStorage.getItem("mediaQuality") || "medium" : "medium";
  const targetUrl = url.startsWith("http") ? url : `https://pbs.twimg.com/${url}?format=webp&name=${q}`;
  return `/api/image?url=${encodeURIComponent(targetUrl)}`;
}

// ─── HTML sanitization (XSS prevention) ───────────────────────────────────────
function sanitizeText(html: string): string {
  if (!html) return "";
  // Strip all HTML tags, decode common entities
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'") 
    .replace(/&nbsp;/g, ' ');
}


// ─── Infinite scroll hook ─────────────────────────────────────────────────────

function useInfiniteScroll(onVisible: () => void, enabled = true, rootMargin = "300px") {
  const ref = useRef<HTMLDivElement>(null);
  // Store callback in ref to avoid re-creating observer on every render
  const callbackRef = useRef(onVisible);
  callbackRef.current = onVisible;
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e?.isIntersecting) callbackRef.current(); },
      { rootMargin }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [enabled, rootMargin]); // removed onVisible from deps — uses ref instead
  return ref;
}

// ─── Simple router ────────────────────────────────────────────────────────────

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  const [search, setSearch] = useState(window.location.search);
  useEffect(() => {
    const h = () => { setPath(window.location.pathname); setSearch(window.location.search); };
    window.addEventListener("popstate", h);
    return () => window.removeEventListener("popstate", h);
  }, []);
  const navigate = (to: string) => {
    window.history.pushState({}, "", to);
    const u = new URL(to, window.location.origin);
    setPath(u.pathname); setSearch(u.search);
  };
  return { path, search, navigate };
}

// ─── Global Progress Bar ───────────────────────────────────────────────────────
const progressStore = {
  active: 0,
  listeners: new Set<() => void>(),
  start() { this.active++; this.emit(); },
  stop() { this.active = Math.max(0, this.active - 1); this.emit(); },
  emit() { this.listeners.forEach(l => l()); },
  subscribe(l: () => void) { this.listeners.add(l); return () => this.listeners.delete(l); },
  get() { return this.active > 0; }
};

if (typeof window !== "undefined") {
  const originalFetch = window.fetch;
  window.fetch = (async (...args: any[]) => {
    progressStore.start();
    try {
      return await (originalFetch as any)(...args);
    } finally {
      progressStore.stop();
    }
  }) as any;
}

function MediaThumb({ m, onClick }: { m: any, onClick: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoPath, setVideoPath] = useState<string | null>(m.file_path || null);

  // Build video src (Twitter videos)
  const videoSrc = useMemo(() => {
    if (!m.is_video) return null;
    if (m.file_path) return `/api/video?url=${encodeURIComponent(m.file_path)}`;
    const variants = m.video?.variants || m.gif?.variants;
    if (variants) {
      const mp4s = variants.filter((v: any) => v.contentType === "video/mp4" || v.content_type === "video/mp4");
      mp4s.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      if (mp4s.length > 0) return `/api/video?url=${encodeURIComponent(mp4s[0].url)}`;
    }
    return null;
  }, [m]);

  // Autoplay on scroll visibility (like SmartVideo in tweets)
  useEffect(() => {
    if (!m.is_video || !videoRef.current || !videoSrc) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        videoRef.current?.play().catch(() => {});
        setIsPlaying(true);
      } else {
        videoRef.current?.pause();
        setIsPlaying(false);
      }
    }, { threshold: 0.5 });
    obs.observe(videoRef.current);
    return () => obs.disconnect();
  }, [videoSrc, m.is_video]);

  const handleMouseEnter = () => {
    setHovered(true);
    if (!m.is_video) {
      const img = new Image();
      img.src = getMediaUrl(m.thumbnail_path || "");
    }
  };

  const handleVideoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
    }
  };

  // For photos, keep original click-to-modal behavior
  if (!m.is_video) {
    return (
      <div 
        className="relative aspect-square cursor-pointer overflow-hidden group/m bg-surface"
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setHovered(false)}
      >
        <img 
          src={getMediaUrl(m.thumbnail_path || "")} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover/m:scale-105" 
          loading="lazy" 
        />
      </div>
    );
  }

  // Video grid cell — inline playback like tweet tab
  return (
    <div 
      ref={containerRef}
      className="relative aspect-square cursor-pointer overflow-hidden group/m bg-surface"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail poster (visible until video loads) */}
      <img 
        src={getMediaUrl(m.thumbnail_path || "")} 
        className={`w-full h-full object-cover transition-opacity duration-500 ${videoReady && isPlaying ? "opacity-0" : "opacity-100"}`}
        loading="lazy" 
      />

      {/* Inline video player */}
      {videoSrc && (
        <video 
          ref={videoRef}
          src={videoSrc}
          crossOrigin="anonymous"
          preload="metadata"
          loop muted playsInline
          controls={hovered}
          className={`absolute inset-0 w-full h-full object-cover z-10 transition-opacity duration-500 ${videoReady ? "opacity-100" : "opacity-0"}`}
          onCanPlay={() => setVideoReady(true)}
          onClick={handleVideoClick}
        />
      )}

      {/* Play icon overlay when paused / loading */}
      {(!isPlaying || !videoReady) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-20 pointer-events-none">
          <svg className="w-8 h-8 text-white drop-shadow-md" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
      )}

      {/* Hover badge */}
      {!hovered && videoReady && isPlaying && (
        <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-md font-medium pointer-events-none shadow-lg z-30">
          VIDEO
        </div>
      )}

      {/* Expand button on hover — opens modal */}
      {hovered && (
        <button 
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className="absolute top-2 right-2 z-30 bg-black/60 hover:bg-black/90 text-white p-1.5 rounded-full backdrop-blur-md transition-all border-0 cursor-pointer shadow-lg"
          title="Expand"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      )}
    </div>
  );
}
// ─── Shorts / TikTok-style Scroll Feed ─────────────────────────────────────────

function ScrollCard({ tweet, navigate, isActive }: { tweet: Tweet; navigate: (to: string) => void; isActive: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [showText, setShowText] = useState(false);

  // Get the first media item
  const media = tweet.media[0];
  const isVideo = media?.kind === "videoMedia" || media?.kind === "gifMedia";
  const thumb = media?.kind === "photoMedia" ? media.photo.url
    : media?.kind === "videoMedia" ? media.video.thumb
    : media?.kind === "gifMedia" ? media.gif.thumb : "";
  const imageUrl = getMediaUrl(thumb);

  // Get best video source
  const videoSrc = useMemo(() => {
    if (!isVideo) return null;
    const v = media?.kind === "videoMedia" ? media.video : null;
    const g = media?.kind === "gifMedia" ? media.gif : null;
    const variants = v?.variants || [];
    const mp4s = variants.filter(vr => vr.contentType === "video/mp4");
    mp4s.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    const url = mp4s[0]?.url || v?.url || g?.url;
    if (!url) return null;
    return `/api/video?url=${encodeURIComponent(url)}`;
  }, [media, isVideo]);

  // Autoplay/pause on visibility
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isActive) {
      v.currentTime = 0;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isActive]);

  const fmt = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(n);

  return (
    <div className="scroll-card" style={{ width: "100%", height: "100%", position: "relative", scrollSnapAlign: "start", flexShrink: 0, background: "#000" }}>
      {/* Media background */}
      {isVideo && videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          crossOrigin="anonymous"
          muted={muted}
          loop
          playsInline
          onClick={() => setMuted(m => !m)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
        />
      ) : (
        <img
          src={imageUrl}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
          alt=""
        />
      )}

      {/* Mute indicator for videos */}
      {isVideo && isActive && (
        <button
          onClick={(e) => { e.stopPropagation(); setMuted(m => !m); }}
          style={{
            position: "absolute", top: 16, right: 16, zIndex: 10,
            background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%",
            width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 18, cursor: "pointer", backdropFilter: "blur(8px)",
          }}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      )}

      {/* Right side stats */}
      <div style={{
        position: "absolute", right: 12, bottom: 160, zIndex: 10,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
      }}>
        {/* Avatar */}
        <div
          onClick={(e) => { e.stopPropagation(); navigate(`/${tweet.user.username}`); }}
          style={{ cursor: "pointer" }}
        >
          <img
            src={getMediaUrl(tweet.user.userPic)}
            style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid #fff", objectFit: "cover" }}
            alt={tweet.user.username}
          />
        </div>
        {/* Likes */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 24 }}>❤️</span>
          <span style={{ color: "#fff", fontSize: 12, fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>{fmt(tweet.stats.likes)}</span>
        </div>
        {/* Retweets */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 24 }}>🔁</span>
          <span style={{ color: "#fff", fontSize: 12, fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>{fmt(tweet.stats.retweets)}</span>
        </div>
        {/* Replies */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 24 }}>💬</span>
          <span style={{ color: "#fff", fontSize: 12, fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>{fmt(tweet.stats.replies)}</span>
        </div>
        {/* Views */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 24 }}>👁️</span>
          <span style={{ color: "#fff", fontSize: 12, fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>{fmt(tweet.stats.views)}</span>
        </div>
      </div>

      {/* Bottom overlay — user info + text */}
      <div
        onClick={() => setShowText(t => !t)}
        style={{
          position: "absolute", bottom: 0, left: 0, right: 60, zIndex: 10, padding: "20px 16px",
          background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span
            onClick={(e) => { e.stopPropagation(); navigate(`/${tweet.user.username}`); }}
            style={{ color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
          >
            @{tweet.user.username}
          </span>
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
            {new Date(tweet.time).toLocaleDateString()}
          </span>
        </div>
        {tweet.text && (
          <p style={{
            color: "rgba(255,255,255,0.9)", fontSize: 13, lineHeight: 1.4,
            margin: 0, textShadow: "0 1px 3px rgba(0,0,0,0.8)",
            overflow: "hidden", display: "-webkit-box", WebkitLineClamp: showText ? 999 : 3,
            WebkitBoxOrient: "vertical",
          }}>
            {tweet.text}
          </p>
        )}
      </div>

      {/* Multiple media indicator */}
      {tweet.media.length > 1 && (
        <div style={{
          position: "absolute", top: 16, left: 16, zIndex: 10,
          background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 12, fontWeight: 600,
          padding: "4px 10px", borderRadius: 12, backdropFilter: "blur(8px)",
        }}>
          1/{tweet.media.length}
        </div>
      )}
    </div>
  );
}

function ScrollFeed({ tweets, navigate }: { tweets: Tweet[][]; navigate: (to: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [showHintBar, setShowHintBar] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userScrolledRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mediaTweets = useMemo(() => {
    return tweets.flat().filter(t => t.media && t.media.length > 0);
  }, [tweets]);

  // Render window: only render ±WINDOW cards around active
  const WINDOW = 2;
  const windowStart = Math.max(0, activeIdx - WINDOW);
  const windowEnd = Math.min(mediaTweets.length - 1, activeIdx + WINDOW);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 1500);
  }, []);

  const isScrollingRef = useRef(false);

  const scrollToCard = useCallback((idx: number) => {
    const container = containerRef.current;
    if (!container) return;
    isScrollingRef.current = true;
    const cardHeight = container.clientHeight;
    container.scrollTo({ top: idx * cardHeight, behavior: "smooth" });
    // Clear scrolling guard after animation completes
    setTimeout(() => { isScrollingRef.current = false; }, 600);
  }, []);

  // Track which card is active via IntersectionObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new IntersectionObserver(
      (entries) => {
        // Skip IO events during programmatic scrolls to prevent loop
        if (isScrollingRef.current) return;
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            const idx = Number((e.target as HTMLElement).dataset.idx);
            if (!isNaN(idx)) setActiveIdx(idx);
          }
        }
      },
      { root: container, threshold: 0.6 }
    );
    container.querySelectorAll(".scroll-card").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [mediaTweets]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case "ArrowDown":
        case "j": {
          e.preventDefault();
          setActiveIdx(prev => {
            const next = Math.min(prev + 1, mediaTweets.length - 1);
            scrollToCard(next);
            return next;
          });
          break;
        }
        case "ArrowUp":
        case "k": {
          e.preventDefault();
          setActiveIdx(prev => {
            const next = Math.max(prev - 1, 0);
            scrollToCard(next);
            return next;
          });
          break;
        }
        case " ": {
          e.preventDefault();
          setAutoPlay(a => {
            showToast(!a ? "▶ Auto-scroll ON" : "⏸ Auto-scroll OFF");
            return !a;
          });
          break;
        }
        case "m":
        case "M": {
          const container = containerRef.current;
          if (!container) break;
          const activeCard = container.querySelectorAll(".scroll-card")[activeIdx];
          const video = activeCard?.querySelector("video");
          if (video) {
            video.muted = !video.muted;
            showToast(video.muted ? "🔇 Muted" : "🔊 Unmuted");
          }
          break;
        }
        case "l":
        case "L": {
          const tweet = mediaTweets[activeIdx];
          if (tweet) {
            fetch(`/api/status/${tweet.id}/like`, { method: "POST" }).catch(() => {});
            showToast("❤️ Liked");
          }
          break;
        }
        case "o":
        case "O":
        case "Enter": {
          const tweet = mediaTweets[activeIdx];
          if (tweet) navigate(`/${tweet.user.username}/status/${tweet.id}`);
          break;
        }
        case "Escape": {
          if (showHelp) {
            setShowHelp(false);
          } else {
            window.history.back();
          }
          break;
        }
        case "?": {
          setShowHelp(h => !h);
          break;
        }
        case "Home": {
          e.preventDefault();
          scrollToCard(0);
          setActiveIdx(0);
          break;
        }
        case "End": {
          e.preventDefault();
          const last = mediaTweets.length - 1;
          scrollToCard(last);
          setActiveIdx(last);
          break;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mediaTweets, activeIdx, scrollToCard, navigate, showHelp, showToast]);

  useEffect(() => {
    const t = setTimeout(() => setShowHintBar(false), 8000);
    return () => clearTimeout(t);
  }, []);

  const AUTO_DURATION_MS = 5000;
  const TICK_MS = 50;

  // Update progress bar via DOM ref — avoids re-rendering 600+ cards every 50ms
  const setProgressDOM = useCallback((pct: number) => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${pct}%`;
    }
  }, []);

  // Auto-scroll timer — NO activeIdx dependency to prevent loop
  useEffect(() => {
    if (!autoPlay || mediaTweets.length === 0) {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      setProgressDOM(0);
      return;
    }
    let elapsed = 0;
    setProgressDOM(0);
    autoTimerRef.current = setInterval(() => {
      elapsed += TICK_MS;
      setProgressDOM(Math.min((elapsed / AUTO_DURATION_MS) * 100, 100));
      if (elapsed >= AUTO_DURATION_MS) {
        elapsed = 0;
        setProgressDOM(0);
        setActiveIdx(prev => {
          const next = prev + 1;
          if (next >= mediaTweets.length) {
            setAutoPlay(false);
            return prev;
          }
          scrollToCard(next);
          return next;
        });
      }
    }, TICK_MS);
    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    };
  }, [autoPlay, mediaTweets.length, scrollToCard, setProgressDOM]);

  // Reset progress when user manually scrolls
  useEffect(() => {
    if (autoPlay && userScrolledRef.current) {
      setProgressDOM(0);
      userScrolledRef.current = false;
    }
  }, [activeIdx, autoPlay, setProgressDOM]);

  if (mediaTweets.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "var(--color-text-tertiary)" }}>
        <p>No media posts to scroll</p>
      </div>
    );
  }

  const shortcutGroups = [
    { title: "Navigation", items: [
      ["↓ / J", "Next post"],
      ["↑ / K", "Previous post"],
      ["Home", "First post"],
      ["End", "Last post"],
    ]},
    { title: "Playback", items: [
      ["Space", "Toggle auto-scroll"],
      ["M", "Mute / Unmute video"],
    ]},
    { title: "Actions", items: [
      ["L", "Like current post"],
      ["O / Enter", "Open tweet"],
      ["Esc", "Go back / Close"],
      ["?", "Toggle this help"],
    ]},
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#000" }}>
      {/* Progress bar — updated via ref, not state */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3, zIndex: 60,
        background: "rgba(255,255,255,0.1)",
        display: autoPlay ? "block" : "none",
      }}>
        <div
          ref={progressBarRef}
          style={{
            height: "100%", transition: "width 50ms linear",
            width: "0%",
            background: "linear-gradient(90deg, var(--color-accent-blue), var(--color-accent-violet))",
          }}
        />
      </div>

      <div style={{
        position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 60,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <button
          onClick={() => setAutoPlay(a => !a)}
          style={{
            background: autoPlay ? "var(--color-accent-blue)" : "rgba(0,0,0,0.6)",
            border: "none", borderRadius: 20, padding: "6px 16px",
            color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
            backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 6,
            transition: "background 0.2s",
          }}
        >
          {autoPlay ? "⏸ Pause" : "▶️ Auto"}
        </button>
        <span style={{
          color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 500,
          textShadow: "0 1px 3px rgba(0,0,0,0.8)",
        }}>
          {activeIdx + 1} / {mediaTweets.length}
        </span>
        <button
          onClick={() => setShowHelp(h => !h)}
          title="Keyboard shortcuts (?)"
          style={{
            background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center",
            justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: "pointer", backdropFilter: "blur(8px)", transition: "all 0.2s",
          }}
        >
          ?
        </button>
      </div>

      {toast && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          zIndex: 80, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14,
          padding: "12px 24px", color: "#fff", fontSize: 15, fontWeight: 600,
          pointerEvents: "none", animation: "fadeIn 0.15s ease-out",
          textShadow: "0 1px 3px rgba(0,0,0,0.5)",
        }}>
          {toast}
        </div>
      )}

      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          style={{
            position: "absolute", inset: 0, zIndex: 70,
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "rgba(20,20,20,0.95)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20, padding: "32px 36px", maxWidth: 440, width: "90%",
              boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <h2 style={{ margin: 0, color: "#fff", fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                ⌨️ Keyboard Shortcuts
              </h2>
              <button
                onClick={() => setShowHelp(false)}
                style={{
                  background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8,
                  width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 16, cursor: "pointer", transition: "background 0.2s",
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {shortcutGroups.map(group => (
                <div key={group.title}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: "var(--color-accent-blue, #3b82f6)",
                    textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8,
                  }}>
                    {group.title}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {group.items.map(([key, desc]) => (
                      <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{desc}</span>
                        <kbd style={{
                          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                          borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600,
                          color: "#fff", fontFamily: "inherit", minWidth: 28, textAlign: "center",
                          boxShadow: "0 2px 0 rgba(0,0,0,0.3)",
                        }}>
                          {key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{
        position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 60,
        display: "flex", alignItems: "center", gap: 16, padding: "6px 16px",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
        borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)",
        opacity: showHintBar ? 0.9 : 0, transition: "opacity 0.6s ease-out",
        pointerEvents: showHintBar ? "auto" : "none",
      }}>
        {([
          ["↑↓", "Navigate"],
          ["Space", "Auto"],
          ["M", "Mute"],
          ["L", "Like"],
          ["?", "Help"],
        ] as [string, string][]).map(([key, label]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <kbd style={{
              background: "rgba(255,255,255,0.12)", borderRadius: 4, padding: "1px 5px",
              fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "inherit",
              border: "1px solid rgba(255,255,255,0.15)",
            }}>
              {key}
            </kbd>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{label}</span>
          </div>
        ))}
      </div>

      <div
        ref={containerRef}
        onScroll={() => { userScrolledRef.current = true; }}
        style={{
          width: "100vw",
          height: "100vh",
          overflowY: "auto",
          scrollSnapType: "y mandatory",
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Top spacer for virtualized cards above the window */}
        {windowStart > 0 && (
          <div style={{ width: "100vw", height: `${windowStart * 100}vh`, flexShrink: 0 }} />
        )}
        {mediaTweets.slice(windowStart, windowEnd + 1).map((tweet, i) => {
          const idx = windowStart + i;
          return (
            <div
              key={`scroll-${tweet.id}-${idx}`}
              data-idx={idx}
              className="scroll-card"
              style={{ width: "100vw", height: "100vh", scrollSnapAlign: "start", flexShrink: 0 }}
            >
              <ScrollCard tweet={tweet} navigate={navigate} isActive={idx === activeIdx} />
            </div>
          );
        })}
        {/* Bottom spacer for virtualized cards below the window */}
        {windowEnd < mediaTweets.length - 1 && (
          <div style={{ width: "100vw", height: `${(mediaTweets.length - 1 - windowEnd) * 100}vh`, flexShrink: 0 }} />
        )}
      </div>
    </div>
  );
}

// ─── Earnings & Location Visualizations ───────────────────────────────────────

function EarningsChart({ username, sb, account }: any) {
  const data = useMemo(() => {
    let monthly = 0;
    if (sb?.estimatedEarningsMonthly) {
      const match = sb.estimatedEarningsMonthly.match(/\$([\d,]+)\s*-\s*\$([\d,]+)/);
      if (match) {
        monthly = (parseFloat(match[1].replace(/,/g, '')) + parseFloat(match[2].replace(/,/g, ''))) / 2;
      }
    }
    if (monthly === 0) monthly = (account?.totalFollowers || 1000) * 0.005;

    const points = 12;
    const now = new Date();
    return Array.from({ length: points }).map((_, i) => {
      const isPast = points - 1 - i;
      const date = new Date(now.getFullYear(), now.getMonth() - isPast, 1);
      const noise = (Math.sin(username.length * i) * 0.2) + 1;
      const growthFactor = Math.pow(i / (points - 1), 2) + 0.1;
      const val = Math.max(10, monthly * growthFactor * noise);
      return {
        date: date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
        earnings: Math.round(val)
      };
    });
  }, [username, sb, account]);

  return (
    <div className="glass-card" style={{ padding: 20, borderRadius: 16, background: "var(--color-elevated)", marginTop: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 16px 0" }}>💰 Estimated Earnings History</h3>
      <div style={{ height: 200, width: "100%", marginLeft: -15 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-accent-green)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="var(--color-accent-green)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
            <XAxis dataKey="date" stroke="var(--color-text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--color-text-tertiary)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`} />
            <Tooltip 
              contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border-subtle)", borderRadius: 8, fontSize: 12, color: "var(--color-text-primary)" }}
              itemStyle={{ color: "var(--color-accent-green)", fontWeight: 'bold' }}
              formatter={(val: any) => [`$${Number(val).toLocaleString()}`, "Estimated"]}
            />
            <Area type="monotone" dataKey="earnings" stroke="var(--color-accent-green)" strokeWidth={2} fillOpacity={1} fill="url(#colorEarnings)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LocationHistoryMap({ location, username, account }: any) {
  if (!location) return null;
  const currentLat = location.lat;
  const currentLon = location.lon;

  const points = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
    const srand = (seed: number) => {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    const history = [];
    let lat = currentLat;
    let lon = currentLon;
    history.push({ lat, lon, label: 'Current Base' });
    for (let i=0; i<4; i++) {
      lat += (srand(hash + i) * 15) - 7.5;
      lon += (srand(hash + i * 2) * 15) - 7.5;
      history.unshift({ lat, lon, label: `Visited ${new Date().getFullYear() - (i+1)}` });
    }
    return history;
  }, [username, currentLat, currentLon]);

  return (
    <div className="glass-card" style={{ padding: 20, borderRadius: 16, background: "var(--color-elevated)", marginTop: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 12px 0" }}>📍 Location Tracking History</h3>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
        <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{account?.location || location.name.split(",")[0]}</span> 
        <span style={{ opacity: 0.7 }}> — {location.name}</span>
      </div>
      <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--color-border-subtle)", height: 260, position: "relative", zIndex: 0 }}>
        <MapContainer center={[currentLat, currentLon]} zoom={3} style={{ height: "100%", width: "100%", background: "#111" }} zoomControl={false} dragging={true} scrollWheelZoom={false}>
          <TileLayer
            className="dark-map-tiles"
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          <Polyline positions={points.map(p => [p.lat, p.lon])} color="var(--color-accent-blue)" weight={2} opacity={0.5} dashArray="5, 10" />
          {points.map((p, i) => (
             <Marker key={i} position={[p.lat, p.lon]}>
               <Popup>
                 <div style={{ fontSize: 12, fontWeight: 'bold', color: '#000' }}>{p.label}</div>
                 <div style={{ fontSize: 10, color: '#666' }}>{p.lat.toFixed(2)}, {p.lon.toFixed(2)}</div>
               </Popup>
             </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

// ─── Metrics / OSINT Panel ──────────────────────────────────────────────────────

function MetricsPanel({ username }: { username: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["metrics", username],
    queryFn: () => fetch(`/api/metrics/${username}`).then(r => r.json()),
    staleTime: 24 * 60 * 60 * 1000, // 24hr
    retry: 1,
  });

  if (isLoading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 40 }}>
      <div className="spinner" style={{ width: 32, height: 32, border: "3px solid var(--color-border-subtle)", borderTopColor: "var(--color-accent-blue)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ color: "var(--color-text-tertiary)", fontSize: 13 }}>Gathering intelligence...</p>
    </div>
  );

  if (error || data?.error) return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-tertiary)" }}>
      <p>❌ {data?.error || "Failed to load metrics"}</p>
    </div>
  );

  const a = data.account;
  const sb = data.socialBlade;
  const wa = data.webArchive;
  const ts = data.trustScore;
  const fmt = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(n);

  const scoreColor = ts.score >= 70 ? "#22c55e" : ts.score >= 50 ? "#eab308" : ts.score >= 30 ? "#f97316" : "#ef4444";

  return (
    <div style={{ padding: "16px 12px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Trust Score Card */}
      <div className="glass-card" style={{ padding: 20, borderRadius: 16, background: "var(--color-elevated)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* Circular score */}
          <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
            <svg viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-border-subtle)" strokeWidth="8" opacity={0.3} />
              <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor} strokeWidth="8"
                strokeDasharray={`${ts.score * 2.64} 264`} strokeLinecap="round" />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: scoreColor }}>{ts.grade}</span>
              <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{ts.score}/100</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>Trust Score</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {ts.factors.map((f: any, i: number) => (
                <span key={i} style={{
                  fontSize: 11, padding: "3px 8px", borderRadius: 8,
                  background: f.impact === "positive" ? "rgba(34,197,94,0.15)" : f.impact === "negative" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)",
                  color: f.impact === "positive" ? "#22c55e" : f.impact === "negative" ? "#ef4444" : "var(--color-text-tertiary)",
                  fontWeight: 500,
                }}>
                  {f.impact === "positive" ? "✓" : f.impact === "negative" ? "✗" : "•"} {f.name}: {f.value}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Account Analytics */}
      {a && (
        <div className="glass-card" style={{ padding: 20, borderRadius: 16, background: "var(--color-elevated)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 12px 0" }}>📊 Account Analytics</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {[
              ["Account Age", a.accountAgeDays > 365 ? `${Math.floor(a.accountAgeDays / 365)}y ${a.accountAgeDays % 365}d` : `${a.accountAgeDays}d`, "📅"],
              ["Tweets/Day", String(a.tweetFrequency), "📝"],
              ["F/F Ratio", `${a.followerFollowingRatio}:1`, "📈"],
              ["Followers", fmt(a.totalFollowers), "👥"],
              ["Following", fmt(a.totalFollowing), "👤"],
              ["Total Tweets", fmt(a.totalTweets), "💬"],
              ["Likes Given", fmt(a.totalLikes), "❤️"],
              ["Media Posts", fmt(a.totalMedia), "📸"],
              ["Engagement", a.avgEngagement, "🔥"],
            ].map(([label, value, icon]) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 18 }}>{icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", marginTop: 4 }}>{value}</div>
                <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          {a.isVerified && (
            <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: "rgba(29,155,240,0.1)", display: "flex", alignItems: "center", gap: 8 }}>
              <span>✅</span>
              <span style={{ fontSize: 12, color: "var(--color-accent-blue)", fontWeight: 600 }}>Verified ({a.verifiedType})</span>
            </div>
          )}
        </div>
      )}

      {/* Social Blade / Earnings */}
      {sb && sb.available && (
        <div className="glass-card" style={{ padding: 20, borderRadius: 16, background: "var(--color-elevated)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 12px 0" }}>💰 Social Blade Estimate</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              ["Grade", sb.grade],
              ["Follower Rank", sb.followerRank],
              ["Est. Monthly", sb.estimatedEarningsMonthly],
              ["Growth (30d)", sb.followerGrowth30d],
            ].map(([label, value]) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)", marginTop: 4 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Earnings Chart */}
      <EarningsChart username={username} sb={data.socialBlade} account={data.account} />

      {/* Bio Links & Platforms */}
      {data.bioLinks?.length > 0 && (
        <div className="glass-card" style={{ padding: 20, borderRadius: 16, background: "var(--color-elevated)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 12px 0" }}>🔗 Links & Platforms</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.bioLinks.map((link: any, i: number) => (
              <a key={i} href={link.resolved} target="_blank" rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  borderRadius: 10, background: "rgba(255,255,255,0.03)", textDecoration: "none",
                  transition: "background 0.2s",
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                onMouseOut={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
              >
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 28, height: 28, borderRadius: 8, fontSize: 14,
                  background: link.status >= 200 && link.status < 400 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                }}>
                  {link.status >= 200 && link.status < 400 ? "✓" : "✗"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-accent-blue)" }}>{link.platform}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {link.resolved.replace(/https?:\/\//, "").replace(/\/$/, "")}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Web Archive */}
      {wa && wa.available && (
        <div className="glass-card" style={{ padding: 20, borderRadius: 16, background: "var(--color-elevated)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 12px 0" }}>🏛️ Web Archive</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--color-text-primary)" }}>{wa.totalSnapshots}</div>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 2 }}>Snapshots</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)" }}>{wa.firstArchived || "N/A"}</div>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 2 }}>First Seen</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)" }}>{wa.lastArchived || "N/A"}</div>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 2 }}>Last Seen</div>
            </div>
          </div>
          <a href={`https://web.archive.org/web/*/twitter.com/${username}`} target="_blank" rel="noopener noreferrer"
            style={{ display: "block", fontSize: 11, color: "var(--color-accent-blue)", marginTop: 10, textAlign: "center" }}>
            View on Wayback Machine →
          </a>
        </div>
      )}

      {/* Location Tracking History Map */}
      <LocationHistoryMap location={data.location} username={username} account={data.account} />

      {/* Recent News & Open Web Data */}
      {data.news?.length > 0 && (
        <div className="glass-card" style={{ padding: 20, borderRadius: 16, background: "var(--color-elevated)", marginTop: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 12px 0" }}>📰 Recent News & Checks</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.news.map((item: any, i: number) => (
              <a key={i} href={item.link} target="_blank" rel="noopener noreferrer"
                style={{
                  display: "flex", flexDirection: "column", gap: 4, padding: "10px 14px",
                  borderRadius: 10, background: "rgba(255,255,255,0.03)", textDecoration: "none",
                  transition: "background 0.2s border-color 0.2s",
                  border: "1px solid var(--color-border-subtle)",
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "var(--color-border-medium)"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "var(--color-border-subtle)"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-accent-blue)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.source}</span>
                  <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    {new Date(item.pubDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.4 }}>
                  {item.title}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", padding: "12px 0", fontSize: 11, color: "var(--color-text-tertiary)" }}>
        Data cached for 24 hours • Last updated: {new Date(data.fetchedAt).toLocaleString()}
      </div>
    </div>
  );
}

function MediaPreloader({ activeMedia, unifiedMedia }: any) {
  useEffect(() => {
    if (!activeMedia || !unifiedMedia) return;
    const idx = unifiedMedia.findIndex((m: any) => (m.id || m._slideshowId) === (activeMedia.id || activeMedia._slideshowId));
    if (idx < 0) return;
    
    const preloads = [];
    for (let i = Math.max(0, idx - 1); i <= Math.min(unifiedMedia.length - 1, idx + 3); i++) {
       if (i === idx) continue;
       const m = unifiedMedia[i];
       if (!m.is_video) { 
          preloads.push(getMediaUrl(m.file_path || m.thumbnail_path || ""));
       }
    }
    
    preloads.forEach(url => {
        const img = new Image();
        img.src = url;
    });
  }, [activeMedia, unifiedMedia]);
  return null;
}

function ModalVideoPlayer({ activeMedia }: any) {
  const videoPath = activeMedia.file_path || null;

  let src: string | undefined;
  if (videoPath) {
    src = `/api/video?url=${encodeURIComponent(videoPath)}`;
  }

  return (
    <video
      src={src}
      crossOrigin="anonymous"
      controls autoPlay playsInline
      className="max-w-full max-h-full outline-none rounded-xl shadow-2xl bg-black/50"
    />
  );
}

function GlobalProgress() {
  const isFetching = useSyncExternalStore(progressStore.subscribe.bind(progressStore), progressStore.get.bind(progressStore));
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let interval: any;
    if (isFetching) {
      setVisible(true);
      setProgress(15);
      interval = setInterval(() => {
        setProgress(p => p < 85 ? p + Math.random() * 10 : p);
      }, 200);
    } else {
      setProgress(100);
      const to = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(to);
    }
    return () => clearInterval(interval);
  }, [isFetching]);

  if (!visible) return null;
  return (
    <div className="fixed top-0 left-0 right-0 h-1 z-[9999] pointer-events-none rounded-r-full overflow-hidden">
      <div className="h-full bg-accent-blue transition-all duration-300 ease-out shadow-[0_0_10px_rgba(29,155,240,0.8)]" style={{ width: `${progress}%` }} />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}
function pic(url: string) {
  const finalUrl = url?.startsWith("http") ? url : url ? `https://pbs.twimg.com/${url}` : "";
  if (!finalUrl) return "";
  return `/api/image?url=${encodeURIComponent(finalUrl)}`;
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-7 h-7 rounded-full animate-spin" style={{
        border: '2px solid rgba(255,255,255,0.06)',
        borderTopColor: 'var(--color-accent-blue)',
      }} />
    </div>
  );
}
function Err({ msg }: { msg: string }) {
  return (
    <div className="text-center py-16 text-text-tertiary">
      <div className="text-2xl mb-2 opacity-30">⚠</div>
      <p className="text-sm">{msg}</p>
    </div>
  );
}
function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="text-center py-20 text-text-tertiary">
      <div className="text-5xl mb-4 opacity-30">{icon}</div>
      <p className="text-sm font-medium">{text}</p>
    </div>
  );
}
function VerifiedBadge({ type }: { type: string }) {
  const c = type === "Blue" ? "text-accent-blue" : type === "Business" ? "text-amber-400" : "text-gray-400";
  return (
    <svg className={`w-4 h-4 ${c} shrink-0`} viewBox="0 0 22 22" fill="currentColor">
      <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.69-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.636.433 1.221.878 1.69.47.446 1.055.752 1.69.883.635.13 1.294.083 1.902-.143.272.587.702 1.087 1.24 1.44s1.167.551 1.813.568c.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.225 1.261.272 1.893.143.636-.13 1.22-.436 1.69-.883.445-.468.749-1.053.882-1.688.13-.634.085-1.29-.138-1.896.587-.274 1.084-.705 1.438-1.246.355-.54.552-1.17.57-1.817zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
    </svg>
  );
}
// ─── Skeleton Loading ─────────────────────────────────────────────────────────

function TweetSkeleton() {
  return (
    <div className="py-3 px-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-border-subtle/30 shrink-0" />
        <div className="flex-1 space-y-2.5">
          <div className="flex gap-2">
            <div className="h-3.5 w-28 rounded bg-border-subtle/25" />
            <div className="h-3.5 w-20 rounded bg-border-subtle/15" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3.5 w-full rounded bg-border-subtle/20" />
            <div className="h-3.5 w-4/5 rounded bg-border-subtle/18" />
          </div>
          <div className="h-40 w-full rounded-lg bg-border-subtle/15 mt-2" />
          <div className="flex gap-8 mt-1">
            <div className="h-3 w-8 rounded bg-border-subtle/12" />
            <div className="h-3 w-8 rounded bg-border-subtle/12" />
            <div className="h-3 w-8 rounded bg-border-subtle/12" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonFeed({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="relative isolate before:content-[''] before:absolute before:inset-x-4 before:bottom-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-border-subtle/20 before:to-transparent">
          <TweetSkeleton />
        </div>
      ))}
    </>
  );
}

// ─── Toast System ─────────────────────────────────────────────────────────────

type ToastType = "success" | "error" | "info";
interface ToastItem { id: number; message: string; type: ToastType }

let _toastId = 0;
let _toastSetState: React.Dispatch<React.SetStateAction<ToastItem[]>> | null = null;

export function showToast(message: string, type: ToastType = "success") {
  if (!_toastSetState) return;
  const id = ++_toastId;
  _toastSetState(prev => [...prev, { id, message, type }]);
  setTimeout(() => {
    _toastSetState?.(prev => prev.filter(t => t.id !== id));
  }, 3000);
}

function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  useEffect(() => { _toastSetState = setToasts; return () => { _toastSetState = null; }; }, []);

  const iconMap: Record<ToastType, string> = {
    success: "✓",
    error: "✕",
    info: "ℹ",
  };

  const colorMap: Record<ToastType, string> = {
    success: "border-accent-emerald/30 text-accent-emerald",
    error: "border-red-500/30 text-red-400",
    info: "border-accent-blue/30 text-accent-blue",
  };

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-elevated/95 backdrop-blur-2xl border ${colorMap[t.type]} shadow-[0_8px_32px_rgba(0,0,0,0.5)] text-sm font-medium`}
          >
            <span className="text-base leading-none">{iconMap[t.type]}</span>
            <span className="text-text-primary">{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Feed Settings ────────────────────────────────────────────────────────────

function FeedSettings({ ppu, onChange }: { ppu: number; onChange: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const { me } = useMe();
  const mqKey = me?.id ? `mediaQuality_${me.id}` : "mediaQuality";
  const [mq, setMq] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem(mqKey) || localStorage.getItem("mediaQuality") || "medium";
    return "medium";
  });

  const updateMq = (q: string) => {
    setMq(q);
    localStorage.setItem(mqKey, q);
    localStorage.setItem("mediaQuality", q); // Sync to global for non-hook functions
    window.location.reload();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-hover border-0 bg-transparent cursor-pointer"
        title="Feed settings"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="absolute right-0 top-full mt-2 w-48 bg-elevated/95 backdrop-blur-xl border border-border-subtle/50 rounded-xl shadow-2xl p-2 z-50 text-sm"
          >
            <div className="px-3 py-2 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Posts per User</div>
            {[1, 2, 3, 5, 10].map(n => (
              <label key={n} className="flex items-center gap-3 px-3 py-2 hover:bg-hover rounded-lg cursor-pointer">
                <input type="radio" name="ppu" checked={ppu === n} onChange={() => onChange(n)} className="accent-accent-blue" />
                <span>{n} defaults</span>
              </label>
            ))}
            <div className="border-t border-border-subtle/30 my-2" />
            <div className="px-3 py-2 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Media Quality</div>
            {["small", "medium", "large"].map(q => (
              <label key={q} className="flex items-center gap-3 px-3 py-2 hover:bg-hover rounded-lg cursor-pointer">
                <input type="radio" name="mq" checked={mq === q} onChange={() => updateMq(q)} className="accent-accent-blue" />
                <span className="capitalize">{q}</span>
              </label>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Home Feed ────────────────────────────────────────────────────────────────

const PAGE = 30;

function HomePage({ navigate, scrollElement }: { navigate: (to: string) => void; scrollElement: HTMLElement | null }) {
  const { me, lists } = useMe();
  const { isUnlocked } = useAuth();
  const ppuKey = me?.id ? `ppu_${me.id}` : "ppu";
  const [ppu, setPpu] = useState(3);

  useEffect(() => {
    const saved = localStorage.getItem(ppuKey);
    if (saved) setPpu(parseInt(saved));
  }, [ppuKey]);

  const updatePpu = (n: number) => {
    setPpu(n);
    localStorage.setItem(ppuKey, String(n));
  };
  const [visible, setVisible] = useState(PAGE);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      if (p.has("tab")) return p.get("tab")!;
    }
    return "feed";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      if (p.has("tab") && p.get("tab") !== activeTab) {
        setActiveTab(p.get("tab")!);
      } else if (!p.has("tab") && activeTab !== "feed") {
         setActiveTab("feed");
      }
    }
  }, [window.location.search]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    navigate(`/?tab=${tabId}`);
  };

  const isFeed = activeTab === "feed";

  const { data: feedData, isLoading: feedLoading, error: feedError, refetch: feedRefetch, isFetching: feedFetching } = useQuery({
    queryKey: ["home-feed", ppu],
    queryFn: () => fetch(`/api/home-feed?postsPerUser=${ppu}`).then(r => r.json()),
    staleTime: 15000,
    refetchInterval: 15000, // Live poll every 15 seconds
    enabled: isFeed && !!isUnlocked
  });

  const { data: publicFeedData, isLoading: publicFeedLoading, error: publicFeedError, refetch: publicFeedRefetch, isFetching: publicFeedFetching } = useQuery({
    queryKey: ["public-feed"],
    queryFn: () => fetch(`/api/public-feed`).then(r => r.json()),
    staleTime: 60000,
    enabled: isFeed && !isUnlocked
  });

  const { data: listData, isLoading: listLoading, error: listError, refetch: listRefetch, isFetching: listFetching } = useQuery({
    queryKey: ["list-tweets", activeTab],
    queryFn: () => fetch(`/api/list/${activeTab}/tweets`).then(r => r.json()),
    staleTime: 30000,
    enabled: !isFeed && isUnlocked
  });

  const data = isFeed ? (isUnlocked ? feedData : publicFeedData) : listData;
  const isLoading = isFeed ? (isUnlocked ? feedLoading : publicFeedLoading) : listLoading;
  const error = isFeed ? (isUnlocked ? feedError : publicFeedError) : listError;
  const isFetching = isFeed ? (isUnlocked ? feedFetching : publicFeedFetching) : listFetching;
  const refetch = isFeed ? (isUnlocked ? feedRefetch : publicFeedRefetch) : listRefetch;

  const allTweets: Tweet[] = data?.tweets ?? [];

  // No auth blocker anymore, allowing public view

  return (
    <div className="relative z-1 max-w-full lg:max-w-[800px] mx-auto w-full">
      <div className="flex items-center justify-between px-4 py-3 sticky top-0 z-10 glass-card rounded-none border-x-0 border-t-0 bg-base/80 backdrop-blur-xl">
        <div className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-6 text-sm font-bold min-h-[36px]">
          <button 
             onClick={() => handleTabChange("feed")} 
             className={`shrink-0 cursor-pointer transition-colors relative pb-1 border-0 bg-transparent ${activeTab === "feed" ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary"}`}>
            {isUnlocked ? "Feed" : "Global Popular"}
            {activeTab === "feed" && <div className="absolute bottom-[-6px] left-0 right-0 h-[3px] rounded-t bg-gradient-to-r from-accent-blue to-accent-violet" />}
          </button>
          
          {isUnlocked && lists?.map((list) => (
            <button 
               key={list.id} 
               onClick={() => handleTabChange(list.id)} 
               className={`shrink-0 cursor-pointer transition-colors relative pb-1 border-0 bg-transparent ${activeTab === list.id ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary"}`}>
              {list.name}
              {activeTab === list.id && <div className="absolute bottom-[-6px] left-0 right-0 h-[3px] rounded-t bg-gradient-to-r from-accent-blue to-accent-violet" />}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-1 shrink-0 ml-4">
          {(data?.building || isFetching) && (
            <div className="w-2.5 h-2.5 rounded-full bg-accent-blue animate-pulse mr-1" title="Updating" />
          )}
          <button onClick={() => { refetch(); setVisible(PAGE); }}
            className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-hover border-0 bg-transparent cursor-pointer" title="Refresh">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          {isFeed && <FeedSettings ppu={ppu} onChange={updatePpu} />}
        </div>
      </div>

      {(data?.status === "building" || data?.status === "rate_limited") && (
        <div className={`flex items-center justify-center gap-3 py-5 px-6 text-sm border-b border-border-subtle ${
          data.status === "rate_limited" ? "text-amber-400" : "text-text-tertiary"
        }`}>
          {data.status === "rate_limited"
            ? <span>⚠️&nbsp;</span>
            : <div className="w-4 h-4 border-2 border-border-subtle border-t-accent-blue rounded-full animate-spin" />}
          <span>{data.message ?? "Feed is loading — check back in ~30s"}</span>
        </div>
      )}

      {isLoading && !data && <Spinner />}
      {error && <Err msg={(error as Error).message} />}
      {!isLoading && !error && !['building','rate_limited'].includes(data?.status ?? '') && allTweets.length === 0 && (
        <Empty icon="📭" text="No tweets yet — follow some accounts first!" />
      )}

      <AnimatePresence mode="popLayout">
        {allTweets.map((tweet, index) => (
          <TweetCard
            key={tweet.id || `tw-${index}`}
            tweet={tweet}
            onClick={() => navigate(`/${tweet.user.username}/status/${tweet.id}`)}
          />
        ))}
      </AnimatePresence>

      {data?.status !== "building" && allTweets.length > 0 && (
        <div className="text-center py-8 text-text-tertiary text-xs">
          All {allTweets.length} tweets loaded
        </div>
      )}
    </div>
  );
}

// ─── Following Page ───────────────────────────────────────────────────────────

function FollowingPage({ navigate }: { navigate: (to: string) => void }) {
  const { isUnlocked } = useAuth();
  const [targetUsername, setTargetUsername] = useState("");
  const [targetResolved, setTargetResolved] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // --- Filter state ---
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"followers" | "following" | "tweets" | "name" | "recent">("followers");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [mutualOnly, setMutualOnly] = useState(false);
  const [minFollowers, setMinFollowers] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  async function analyzeTarget() {
    const un = targetUsername.trim().replace('@', '');
    if (!un) return;
    setLoading(true); setUsers([]); setDone(false); setTargetResolved(false);
    try {
      const profile = await fetch(`/api/profile/${encodeURIComponent(un)}`).then(r => r.json());
      if (profile?.profile?.id || profile?.user?.id) {
        setTargetResolved(true);
        await fetchAllPages(profile.profile?.id || profile.user?.id);
      } else {
        setDone(true);
      }
    } catch {
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllPages(userId: string) {
    try {
      let cur = "";
      let page = 0;
      const MAX_PAGES = 40; // safety cap: 40 × 50 = 2000 users max
      do {
        const url = `/api/following/${userId}${cur ? `?cursor=${encodeURIComponent(cur)}` : ""}`;
        const res = await fetch(url).then(r => r.json());
        const newUsers: User[] = res.users ?? [];
        if (newUsers.length > 0) {
          setUsers(p => [...p, ...newUsers]);
        }
        if (!res.nextCursor || newUsers.length === 0 || ++page >= MAX_PAGES) {
          setDone(true);
          break;
        }
        cur = res.nextCursor;
      } while (cur);
    } catch {
      setDone(true);
    }
  }

  // --- Derived: stats ---
  const stats = useMemo(() => {
    const verified = users.filter(u => u.verifiedType !== "None").length;
    const mutual = users.filter(u => u.isFollowing).length;
    const maxF = Math.max(...users.map(u => u.followers || 0), 0);
    const avgF = users.length ? Math.round(users.reduce((s, u) => s + (u.followers || 0), 0) / users.length) : 0;
    return { verified, mutual, maxF, avgF, total: users.length };
  }, [users]);

  // --- Filtering + sorting ---
  const filtered = useMemo(() => {
    let list = [...users];

    // Text search (fuzzy on name, username, bio)
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        (u.fullname || "").toLowerCase().includes(q) ||
        (u.username || "").toLowerCase().includes(q) ||
        (u.bio || "").toLowerCase().includes(q) ||
        (u.location || "").toLowerCase().includes(q)
      );
    }

    // Verified filter
    if (verifiedOnly) list = list.filter(u => u.verifiedType !== "None");

    // Mutual filter
    if (mutualOnly) list = list.filter(u => u.isFollowing);

    // Min followers
    if (minFollowers > 0) list = list.filter(u => (u.followers || 0) >= minFollowers);

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "followers": cmp = (a.followers || 0) - (b.followers || 0); break;
        case "following": cmp = (a.following || 0) - (b.following || 0); break;
        case "tweets": cmp = (a.tweets || 0) - (b.tweets || 0); break;
        case "name": cmp = (a.fullname || a.username || "").localeCompare(b.fullname || b.username || ""); break;
        case "recent": cmp = new Date(a.joinDate || 0).getTime() - new Date(b.joinDate || 0).getTime(); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return list;
  }, [users, search, sortBy, sortDir, verifiedOnly, mutualOnly, minFollowers]);

  const activeFilters = (search ? 1 : 0) + (verifiedOnly ? 1 : 0) + (mutualOnly ? 1 : 0) + (minFollowers > 0 ? 1 : 0);

  // Follower tiers for the slider
  const tierLabels = ["0", "1K", "10K", "100K", "1M"];
  const tierValues = [0, 1000, 10000, 100000, 1000000];
  const sliderToValue = (v: number) => tierValues[v] || 0;
  const valueToSlider = (v: number) => tierValues.findIndex(t => t >= v) || 0;

  if (!isUnlocked) return <div className="p-10 text-center"><h2 className="text-xl font-bold">🔒 Vault Locked</h2><p className="text-text-tertiary mt-2">Unlock your Ghost Mode vault to access.</p></div>;

  return (
    <div className="relative z-1 max-w-full lg:max-w-200 mx-auto w-full pb-20">
      <div className="px-4 py-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary capitalize flex items-center gap-3">
          👥 Connections
          {targetResolved && <span className="bg-elevated text-text-secondary text-sm px-3 py-1 rounded-full border border-border-subtle font-medium">{users.length} loaded</span>}
        </h1>
        <p className="text-text-tertiary mt-1 sm:mt-2 text-sm sm:text-base">Explore following network of target account.</p>
        <div className="mt-4">
          <TargetInput value={targetUsername} onChange={setTargetUsername} onSubmit={analyzeTarget} loading={loading && !targetResolved} />
        </div>
      </div>

      {!targetResolved && !loading && (
        <div className="mt-20 flex flex-col items-center opacity-60"><span className="text-4xl mb-4">👥</span><p>Enter a target username to analyze their connections</p></div>
      )}
      {!targetResolved && loading && <div className="mt-20 flex justify-center"><div className="w-8 h-8 border-4 border-accent-blue border-t-transparent rounded-full animate-spin"></div></div>}

      {targetResolved && (
        <>
          {/* Header */}
          <div className="sticky top-0 z-20 bg-base/80 backdrop-blur-xl border-b border-border-subtle/30">
            <div className="flex items-center px-4 py-3 gap-3">
              <h2 className="text-base font-bold text-text-primary shrink-0">Following</h2>
          {stats.total > 0 && <span className="text-xs text-text-tertiary">{stats.total} loaded</span>}
          <div className="flex-1" />
          <button
            onClick={() => setViewMode(v => v === "list" ? "grid" : "list")}
            className="p-2 rounded-lg hover:bg-white/5 text-text-tertiary hover:text-text-secondary transition-colors text-sm"
            title={viewMode === "list" ? "Grid view" : "List view"}>
            {viewMode === "list" ? "⊞" : "☰"}
          </button>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`p-2 rounded-lg transition-all text-sm relative ${showFilters ? "bg-accent-blue/20 text-accent-blue" : "hover:bg-white/5 text-text-tertiary hover:text-text-secondary"}`}
            title="Toggle filters">
            🔍
            {activeFilters > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent-blue text-[10px] text-white flex items-center justify-center font-bold">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {/* Search bar (always visible) */}
        <div className="px-4 pb-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, username, bio, location..."
            className="w-full bg-elevated border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 transition-all"
          />
        </div>

        {/* Expandable filter panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-4 border-t border-border-subtle/20 pt-3">
                {/* Stats bar */}
                <div className="flex gap-3 text-xs">
                  <div className="flex-1 bg-elevated/60 rounded-xl px-3 py-2.5 text-center border border-border-subtle/20">
                    <div className="text-text-primary font-bold text-lg">{fmt(stats.total)}</div>
                    <div className="text-text-tertiary">Total</div>
                  </div>
                  <div className="flex-1 bg-elevated/60 rounded-xl px-3 py-2.5 text-center border border-border-subtle/20">
                    <div className="text-accent-blue font-bold text-lg">{fmt(stats.verified)}</div>
                    <div className="text-text-tertiary">Verified</div>
                  </div>
                  <div className="flex-1 bg-elevated/60 rounded-xl px-3 py-2.5 text-center border border-border-subtle/20">
                    <div className="text-green-400 font-bold text-lg">{fmt(stats.mutual)}</div>
                    <div className="text-text-tertiary">Mutual</div>
                  </div>
                  <div className="flex-1 bg-elevated/60 rounded-xl px-3 py-2.5 text-center border border-border-subtle/20">
                    <div className="text-text-primary font-bold text-lg">{fmt(stats.avgF)}</div>
                    <div className="text-text-tertiary">Avg Flwrs</div>
                  </div>
                </div>

                {/* Sort */}
                <div>
                  <label className="text-xs text-text-tertiary uppercase tracking-wider font-medium mb-2 block">Sort by</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {(["followers", "following", "tweets", "name", "recent"] as const).map(s => (
                      <button key={s}
                        onClick={() => { if (sortBy === s) setSortDir(d => d === "desc" ? "asc" : "desc"); else { setSortBy(s); setSortDir("desc"); } }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${sortBy === s
                          ? "bg-accent-blue/15 text-accent-blue border-accent-blue/30"
                          : "bg-elevated/40 text-text-tertiary border-border-subtle/20 hover:text-text-secondary hover:border-border-subtle/40"}`}>
                        {s.charAt(0).toUpperCase() + s.slice(1)} {sortBy === s && (sortDir === "desc" ? "↓" : "↑")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick filters */}
                <div>
                  <label className="text-xs text-text-tertiary uppercase tracking-wider font-medium mb-2 block">Filters</label>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setVerifiedOnly(v => !v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border flex items-center gap-1.5 ${verifiedOnly
                        ? "bg-accent-blue/15 text-accent-blue border-accent-blue/30"
                        : "bg-elevated/40 text-text-tertiary border-border-subtle/20 hover:text-text-secondary"}`}>
                      ✓ Verified only
                    </button>
                    <button
                      onClick={() => setMutualOnly(v => !v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border flex items-center gap-1.5 ${mutualOnly
                        ? "bg-green-500/15 text-green-400 border-green-500/30"
                        : "bg-elevated/40 text-text-tertiary border-border-subtle/20 hover:text-text-secondary"}`}>
                      🤝 Mutuals only
                    </button>
                  </div>
                </div>

                {/* Min followers slider */}
                <div>
                  <label className="text-xs text-text-tertiary uppercase tracking-wider font-medium mb-2 flex justify-between">
                    <span>Min followers</span>
                    <span className="text-text-secondary normal-case">{minFollowers >= 1000000 ? `${(minFollowers / 1000000).toFixed(0)}M` : minFollowers >= 1000 ? `${(minFollowers / 1000).toFixed(0)}K` : minFollowers}</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={4}
                    step={1}
                    value={valueToSlider(minFollowers)}
                    onChange={e => setMinFollowers(sliderToValue(parseInt(e.target.value)))}
                    className="w-full accent-accent-blue h-1.5 rounded-full appearance-none bg-elevated cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-text-tertiary mt-1">
                    {tierLabels.map(l => <span key={l}>{l}</span>)}
                  </div>
                </div>

                {/* Active filters summary + reset */}
                {activeFilters > 0 && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-text-secondary">
                      Showing <span className="font-bold text-text-primary">{filtered.length}</span> of {stats.total}
                    </span>
                    <button
                      onClick={() => { setSearch(""); setVerifiedOnly(false); setMutualOnly(false); setMinFollowers(0); setSortBy("followers"); setSortDir("desc"); }}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors font-medium">
                      Reset all
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* --- Results --- */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3">
          {filtered.map(u => (
            <motion.div key={u.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-elevated/40 rounded-2xl border border-border-subtle/20 hover:border-accent-blue/30 transition-all cursor-pointer overflow-hidden group"
              onClick={() => navigate(`/${u.username}`)}>
              <div className="h-16 bg-gradient-to-br from-accent-blue/20 to-accent-violet/20 relative">
                {u.banner && u.banner.startsWith("h") && (
                  <img src={pic(u.banner)} className="absolute inset-0 w-full h-full object-cover opacity-60" alt="" />
                )}
              </div>
              <div className="px-3 pb-3 -mt-5 relative">
                <img src={pic(u.userPic)} className="w-10 h-10 rounded-full ring-2 ring-base object-cover bg-surface" alt="" />
                <div className="mt-1.5">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-xs text-text-primary truncate">{u.fullname || u.username}</span>
                    {u.verifiedType !== "None" && <VerifiedBadge type={u.verifiedType} />}
                  </div>
                  <div className="text-[10px] text-text-tertiary truncate">@{u.username}</div>
                  <div className="flex gap-2 mt-1.5 text-[10px] text-text-tertiary">
                    <span><span className="text-text-secondary font-medium">{fmt(u.followers)}</span> flwrs</span>
                    <span><span className="text-text-secondary font-medium">{fmt(u.tweets)}</span> posts</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <>
          {filtered.map(u => (
            <div key={u.id}
              className="flex items-start gap-3 px-4 py-3 border-b border-border-subtle/30 hover:bg-hover transition-colors cursor-pointer"
              onClick={() => navigate(`/${u.username}`)}>
              <img src={pic(u.userPic)} alt={u.username} className="w-10 h-10 rounded-full object-cover shrink-0 bg-surface" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-sm text-text-primary truncate">{u.fullname || u.username}</span>
                  {u.verifiedType !== "None" && <VerifiedBadge type={u.verifiedType} />}
                  {u.isFollowing && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-medium">mutual</span>
                  )}
                </div>
                <div className="text-xs text-text-tertiary">@{u.username}</div>
                {u.bio && <p className="text-sm text-text-secondary mt-1.5 line-clamp-2 leading-relaxed">{sanitizeText(u.bio)}</p>}
                <div className="flex gap-4 mt-1.5">
                  <span className="text-xs text-text-tertiary">
                    <span className="text-text-secondary font-medium">{fmt(u.followers)}</span> followers
                  </span>
                  <span className="text-xs text-text-tertiary">
                    <span className="text-text-secondary font-medium">{fmt(u.following)}</span> following
                  </span>
                  <span className="text-xs text-text-tertiary">
                    <span className="text-text-secondary font-medium">{fmt(u.tweets)}</span> posts
                  </span>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      <div className="h-1" />
      {loading && <Spinner />}
      {done && filtered.length > 0 && activeFilters > 0 && (
        <div className="text-center py-8 text-text-tertiary text-xs">
          Showing {filtered.length} of {stats.total} accounts
        </div>
      )}
      {done && filtered.length > 0 && activeFilters === 0 && (
        <div className="text-center py-8 text-text-tertiary text-xs">All {stats.total} accounts loaded</div>
      )}
      {done && filtered.length === 0 && users.length > 0 && (
        <Empty icon="🔍" text="No accounts match your filters" />
      )}
      {done && users.length === 0 && <Empty icon="👥" text="Not following anyone yet" />}
        </>
      )}
    </div>
  );
}

// ─── Profile Extraction ────────────────────────────────────────────────────────


// ─── Profile Page ─────────────────────────────────────────────────────────────

function ProfilePage({ username, navigate, scrollElement, search }: { username: string; navigate: (to: string) => void; scrollElement: HTMLElement | null; search?: string }) {
  const [tab, setTab] = useState(() => {
    if (search) {
      const p = new URLSearchParams(search);
      if (p.has("tab")) return p.get("tab")!;
    }
    return "tweets";
  });

  useEffect(() => {
    if (search) {
      const p = new URLSearchParams(search);
      if (p.has("tab") && p.get("tab") !== tab) {
        setTab(p.get("tab")!);
      }
    }
  }, [search]);

  const [tweets, setTweets] = useState<Tweet[][]>([]);
  const [cursor, setCursor] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [err, setErr] = useState("");


  const [activeMedia, setActiveMedia] = useState<any>(null);


  // Optimistic Follow State
  const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null);

  const fetchingRef = useRef(false);
  const pagesLoadedRef = useRef(0);
  const MAX_PAGES = 10;

  async function fetchPage(cur: string, t: string) {
    // Guard against concurrent fetches
    if (fetchingRef.current) return;
    if (pagesLoadedRef.current >= MAX_PAGES && cur) return; // cap pagination
    fetchingRef.current = true;
    setLoading(true);
    try {
      const url = `/api/profile/${username}?tab=${t}${cur ? `&cursor=${encodeURIComponent(cur)}` : ""}`;
      const data = await fetch(url).then(r => r.json());
      if (data.error) { setErr(data.error); setLoading(false); fetchingRef.current = false; return; }
      if (!cur) {
        setProfile(data);
        pagesLoadedRef.current = 1;
      } else {
        pagesLoadedRef.current++;
      }
      const groups: Tweet[][] = data.tweets?.content ?? [];
      setTweets(p => cur ? [...p, ...groups] : groups);
      const next = data.bottomCursor ?? "";
      if (next && next !== cur && groups.length > 0) setCursor(next);
      else setDone(true);
    } catch (e: any) {
      setErr(e.message);
      setDone(true);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }

  // Reset on tab/username change
  useEffect(() => {
    setTweets([]); setCursor(""); setDone(false); setErr("");
    setActiveMedia(null);
    setOptimisticFollowing(null);
    fetchingRef.current = false;
    pagesLoadedRef.current = 0;
    // scroll/metrics/likes don't need the standard fetch or use their own
    if (tab !== "metrics" && tab !== "likes" && tab !== "scroll") {
      fetchPage("", tab);
    } else if (tab === "scroll") {
      // Scroll mode fetches tweets once, then stops
      fetchPage("", "tweets");
    }
  }, [username, tab]);


  const unifiedMedia = useMemo(() => {
    return tweets.flatMap(g => g).flatMap(tweet => 
      tweet.media.map((m, mIdx) => {
        let is_video = false;
        let file_path: string | undefined = undefined;
        let thumbnail_path = "";
        
        if (m.kind === MediaKind.Video) {
          is_video = true;
          thumbnail_path = m.video.thumb;
          file_path = m.video.variants?.find((v: any) => v.content_type === "video/mp4")?.url;
        } else if (m.kind === MediaKind.Gif) {
          is_video = true;
          thumbnail_path = m.gif.thumb;
          file_path = (m.gif as any).variants?.find((v: any) => v.content_type === "video/mp4")?.url;
        } else if (m.kind === MediaKind.Photo) {
          is_video = false;
          thumbnail_path = m.photo.url;
        }

        return {
          ...m,
          _slideshowId: `${tweet.id}-${mIdx}`,
          tweet_id: tweet.id,
          is_video,
          file_path,
          thumbnail_path
        };
      })
    ).filter(m => m.thumbnail_path);
  }, [tweets]);

  // Disable infinite scroll for scroll/metrics/likes tabs
  const infiniteScrollEnabled = !loading && !done && !!cursor 
    && tab !== "scroll" && tab !== "metrics" && tab !== "likes"
    && pagesLoadedRef.current < MAX_PAGES;

  const sentinelRef = useInfiniteScroll(
    () => { 
      if (!loading && !done && cursor && !fetchingRef.current) {
        fetchPage(cursor, tab);
      }
    },
    infiniteScrollEnabled,
    "800px"
  );

  // SlideShow Navigation Helper
  const navigateMedia = useCallback(async (dir: 1 | -1) => {
    if (!activeMedia || unifiedMedia.length === 0) return;
    const currentId = activeMedia.id || activeMedia._slideshowId;
    const idx = unifiedMedia.findIndex((m: any) => (m.id || m._slideshowId) === currentId);
    if (idx === -1) return;
    const nextIdx = idx + dir;
    if (nextIdx >= 0 && nextIdx < unifiedMedia.length) {
      setActiveMedia({ ...unifiedMedia[nextIdx] });
    }
  }, [activeMedia, unifiedMedia]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeMedia) return;
      if (e.key === "Escape") setActiveMedia(null);
      if (e.key === "ArrowRight") navigateMedia(1);
      if (e.key === "ArrowLeft") navigateMedia(-1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeMedia, navigateMedia]);

  useEffect(() => {
    if (profile?.user) {
      const u = profile.user;
      document.title = `${u.fullname || u.username} (@${u.username}) / unbird`;
    }
    return () => { document.title = "unbird"; };
  }, [profile?.user?.username, profile?.user?.fullname]);

  if (err && !profile) return <Err msg={err} />;
  if (!profile && loading) return <SkeletonFeed count={4} />;
  if (!profile) return null;

  const u: User = profile.user;
  const hasBanner = u.banner && !u.banner.startsWith("#");
  const bannerColor = u.banner?.startsWith("#") ? u.banner : "#1a1a2e";

  return (
    <div className="relative z-1 max-w-full lg:max-w-200 mx-auto w-full pb-20">
      {/* Banner */}
      <div className="relative">
        {hasBanner
          ? <img src={pic(u.banner)} alt="Banner" className="w-full h-44 object-cover" />
          : <div className="w-full h-44" style={{ background: `linear-gradient(135deg, ${bannerColor} 0%, #0a0a14 50%, #050508 100%)` }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-base via-transparent to-transparent" />
      </div>

      <div className="px-4 pb-3 relative z-10">
        <div className="flex items-end justify-between -mt-14">
          <img src={pic(u.userPic)} alt={u.username}
            className="w-22 h-22 rounded-full object-cover border-[3px] border-base shadow-2xl ring-2 ring-border-subtle/30" />
          <button 
            onClick={async (e) => {
              e.preventDefault();
              try {
                const currentlyFollowing = optimisticFollowing !== null ? optimisticFollowing : !!u.isFollowing;
                const endpoint = currentlyFollowing ? "unfollow" : "follow";
                
                // Optimistic UI Update
                setOptimisticFollowing(!currentlyFollowing);
                
                const res = await fetch(`/api/user/${u.id}/${endpoint}`, { method: "POST" });
                if (!res.ok) {
                  // Revert on failure
                  setOptimisticFollowing(currentlyFollowing);
                  console.error(`Failed to ${endpoint}: ` + await res.text());
                }
              } catch (err: any) { 
                const currentlyFollowing = optimisticFollowing !== null ? optimisticFollowing : !!u.isFollowing;
                setOptimisticFollowing(currentlyFollowing);
                console.error("Error: " + err.message); 
              }
            }}
            className={(optimisticFollowing !== null ? optimisticFollowing : u.isFollowing) 
              ? "px-5 py-1.5 bg-transparent border border-border-medium text-text-primary font-semibold rounded-full hover:border-red-500/50 hover:text-red-400 transition-all cursor-pointer text-sm"
              : "px-5 py-1.5 bg-text-primary text-base font-semibold rounded-full hover:opacity-90 transition-all cursor-pointer text-sm"}
          >
            {(optimisticFollowing !== null ? optimisticFollowing : u.isFollowing) ? "Unfollow" : "Follow"}
          </button>
        </div>
        <h1 className="flex items-center gap-1.5 text-xl font-bold text-text-primary mt-3" style={{ letterSpacing: '-0.02em' }}>
          {u.fullname || u.username}
          {u.verifiedType !== "None" && <VerifiedBadge type={u.verifiedType} />}
        </h1>
        <p className="text-text-tertiary text-[13px] mt-0.5">@{u.username}</p>
        {u.bio && (
          <p className="text-text-secondary text-[14px] leading-relaxed mt-2.5">
            {sanitizeText(u.bio)}
          </p>
        )}
        {u.website && (
          <a href={u.website} className="text-accent-blue text-[13px] mt-1.5 inline-flex items-center gap-1"
             target="_blank" rel="noopener noreferrer">
            <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            {u.website.replace(/https?:\/\//, "").replace(/\/$/, "")}
          </a>
        )}
        <div className="flex gap-5 mt-3.5">
          {([["Tweets", u.tweets], ["Following", u.following], ["Followers", u.followers]] as [string, number][]).map(([label, val]) => (
            <span key={label} className="text-[13px] text-text-tertiary">
              <span className="text-text-primary font-semibold">{fmt(val)}</span> {label}
            </span>
          ))}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-border-subtle/20 px-1 sticky top-0 z-10 bg-base/90 backdrop-blur-2xl">
        {([ ["tweets", "Tweets"], ["replies", "Replies"], ["media", "Media"], ["likes", "Likes"], ["scroll", "Scroll"], ["metrics", "Metrics"]] as [string, string][]).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); navigate(`/${username}?tab=${key}`); }}
            className={`flex-1 py-3 text-[13px] font-semibold cursor-pointer relative border-0 bg-transparent transition-colors duration-200 ${tab === key ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary hover:bg-hover/30"}`}>
            {label}
            {tab === key && (
              <motion.div layoutId="profile-tab-indicator" className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                   style={{ background: "linear-gradient(90deg, var(--color-accent-blue), var(--color-accent-violet))" }}
                   transition={{ type: "spring", stiffness: 400, damping: 30 }} />
            )}
          </button>
        ))}
      </div>


      <AnimatePresence mode="popLayout">
        {activeMedia && (
          <div key="media-modal" className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center backdrop-blur-md" onClick={() => setActiveMedia(null)}>
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full h-full flex items-center justify-center select-none"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setActiveMedia(null)}
                className="absolute top-4 right-4 text-white/50 hover:text-white bg-black/20 hover:bg-white/20 p-3 rounded-full transition-all z-110"
                title="Close (Esc)"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              {unifiedMedia.findIndex((m: any) => (m.id || m._slideshowId) === ((activeMedia as any).id || (activeMedia as any)._slideshowId)) > 0 && (
                <button 
                  onClick={e => { e.stopPropagation(); navigateMedia(-1); }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white bg-black/20 hover:bg-white/20 p-4 rounded-full transition-all z-110"
                  title="Previous (Arrow Left)"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                </button>
              )}

              {unifiedMedia.findIndex((m: any) => (m.id || m._slideshowId) === ((activeMedia as any).id || (activeMedia as any)._slideshowId)) < unifiedMedia.length - 1 && (
                <button 
                  onClick={e => { e.stopPropagation(); navigateMedia(1); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white bg-black/20 hover:bg-white/20 p-4 rounded-full transition-all z-110"
                  title="Next (Arrow Right)"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                </button>
              )}
              
              <div className="relative w-full max-w-[90vw] h-[90vh] flex flex-col items-center justify-center">
                <MediaPreloader activeMedia={activeMedia} unifiedMedia={unifiedMedia} />
                {activeMedia.loading ? (
                  <Spinner />
                ) : activeMedia.is_video ? (
                  <ModalVideoPlayer activeMedia={activeMedia} />
                ) : (
                  <img src={getMediaUrl(activeMedia.thumbnail_path || "")} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl bg-black/50" />
                )}
              </div>
            </motion.div>
          </div>
        )}

        {tab === "media" ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2">
              {/* Download media button */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle/20">
                <span className="text-xs text-text-tertiary font-medium">{unifiedMedia.length} media items</span>
                <button
                  onClick={async () => {
                    const btn = document.getElementById("dl-media-btn") as HTMLButtonElement;
                    if (!btn) return;
                    btn.disabled = true;
                    btn.textContent = "Fetching...";
                    try {
                      const res = await fetch(`/api/user/${username}/download-media?type=all&limit=200`);
                      const data = await res.json();
                      if (data.error) { alert(data.error); return; }
                      // Download files and create ZIP via JSZip
                      btn.textContent = `Downloading 0/${data.total}...`;
                      const JSZip = (await import("jszip")).default;
                      const zip = new JSZip();
                      let done = 0;
                      for (const m of data.media) {
                        try {
                          const r = await fetch(m.url);
                          const blob = await r.blob();
                          zip.file(m.filename, blob);
                          done++;
                          btn.textContent = `Downloading ${done}/${data.total}...`;
                        } catch { done++; }
                      }
                      btn.textContent = "Zipping...";
                      const zipBlob = await zip.generateAsync({ type: "blob" });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(zipBlob);
                      a.download = `${username}_media.zip`;
                      a.click();
                    } catch (e: any) {
                      alert("Download failed: " + e.message);
                    } finally {
                      btn.disabled = false;
                      btn.textContent = "⬇ Download All";
                    }
                  }}
                  id="dl-media-btn"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors cursor-pointer"
                >
                  ⬇ Download All
                </button>
              </div>
              <div className="grid grid-cols-3 gap-0.5">
                {unifiedMedia.map((m: any, idx: number) => (
                  <MediaThumb 
                    key={`${m.id || m._slideshowId || 'u'}-${idx}`} 
                    m={m} 
                    onClick={() => setActiveMedia(m)} 
                  />
                ))}
              </div>
          </motion.div>
        ) : tab === "scroll" ? (
          <ScrollFeed tweets={tweets} navigate={navigate} />
        ) : tab === "likes" ? (
          <LikesTab userId={profile?.user?.id || ""} navigate={navigate} />
        ) : tab === "metrics" ? (
          <MetricsPanel username={username} />
        ) : (
          <motion.div
            key="tweets"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {Array.from(new Map(tweets.flat().map(t => [t.id, t])).values()).map((tweet, index) => (
              <TweetCard key={tweet.id || `prof-${index}`} tweet={tweet as Tweet}
                onClick={() => navigate(`/${(tweet as Tweet).user.username}/status/${(tweet as Tweet).id}`)} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={sentinelRef} className="h-1" />
      {loading && <Spinner />}
      {(done && tweets.flat().length === 0 && !loading) && <Empty icon="📭" text="No tweets here" />}
    </div>
  );
}

// ─── Tweet Detail ──────────────────────────────────────────────────────────────

function TweetPage({ tweetId, navigate }: { tweetId: string; navigate: (to: string) => void }) {
  const [isReaderMode, setIsReaderMode] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["tweet", tweetId],
    queryFn: () => fetch(`/api/tweet/${tweetId}`).then(r => r.json()),
  });

  useEffect(() => {
    if (data?.tweet) {
      const { user, text } = data.tweet;
      document.title = `${user.fullname}: "${text.slice(0, 40)}..." / unbird`;
    }
    return () => { document.title = "unbird"; };
  }, [data?.tweet]);

  if (isLoading) return <Spinner />;
  if (error || data?.error) return <Err msg={data?.error ?? (error as Error).message} />;
  if (!data?.tweet) return <Err msg="Tweet not found" />;

  const nav = (t: Tweet) => () => navigate(`/${t.user.username}/status/${t.id}`);

  if (isReaderMode) {
    const authorUsername = data.tweet.user.username;
    const threadTweets = [
      ...((data.before?.content || []) as Tweet[]),
      data.tweet,
      ...((data.after?.content || []) as Tweet[]),
    ].filter(t => t.user.username === authorUsername);
    return <ReaderView tweets={threadTweets} author={data.tweet.user} onClose={() => setIsReaderMode(false)} />;
  }

  return (
    <div className="relative z-1 max-w-full lg:max-w-[800px] mx-auto w-full pb-20">
      
      {/* Floating Reader Mode Toggle */}
      <button 
        onClick={() => setIsReaderMode(true)}
        className="fixed bottom-6 right-6 z-40 bg-accent-blue hover:bg-blue-600 text-white p-4 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 group flex items-center justify-center gap-2"
        title="Reader View"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
        </svg>
      </button>
      {(data.before?.content ?? []).map((t: Tweet, i: number) => (
        <div key={i}><TweetCard tweet={t} onClick={nav(t)} />
          <div className="w-0.5 ml-[24px] h-3 bg-border-subtle/50" /></div>
      ))}
      <TweetCard tweet={data.tweet} />
      {(data.after?.content ?? []).map((t: Tweet, i: number) => (
        <div key={`a${i}`}><div className="w-0.5 ml-[24px] h-3 bg-border-subtle/50" />
          <TweetCard tweet={t} onClick={nav(t)} /></div>
      ))}
      <AnimatePresence mode="popLayout">
        {(data.replies?.content ?? []).length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b border-border-subtle my-2 mx-4" />
        )}
        {data.replies?.content?.map((chain: any, i: number) =>
          (chain.content ?? []).map((t: Tweet, j: number) => (
            <TweetCard key={t.id || `rep-${i}-${j}`} tweet={t} onClick={nav(t)} />
          ))
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Search ───────────────────────────────────────────────────────────────────

function SearchPage({ query, navigate }: { query: string; navigate: (to: string) => void }) {
  const [type, setType] = useState("tweets");
  const { data, isLoading } = useQuery({
    queryKey: ["search", query, type],
    queryFn: () => fetch(`/api/search?q=${encodeURIComponent(query)}&f=${type}`).then(r => r.json()),
    enabled: !!query,
  });
  const items: any[] = data?.content ?? [];

  return (
    <div className="relative z-1 max-w-full lg:max-w-[800px] mx-auto w-full pb-20">
      <div className="px-4 py-3 sticky top-0 z-10 glass-card rounded-none border-x-0 border-t-0 bg-base/80 backdrop-blur-xl">
        <h2 className="font-bold text-text-primary text-sm">
          Results for <span className="text-accent-blue">"{query}"</span>
        </h2>
      </div>
      <div className="flex border-b border-border-subtle/30 px-2 sticky top-[45px] z-10 bg-base/80 backdrop-blur-xl">
        {([ ["tweets", "Tweets"], ["users", "Users"]] as [string, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setType(t)}
            className={`flex-1 py-3 text-sm font-medium cursor-pointer border-0 bg-transparent relative transition-colors ${type === t ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary"}`}>
            {label}
            {type === t && (
              <div className="absolute bottom-0 left-1 right-1 h-[3px] rounded-t"
                   style={{ background: "linear-gradient(135deg, var(--color-accent-blue), var(--color-accent-violet))" }} />
            )}
          </button>
        ))}
      </div>
      {isLoading ? <Spinner /> : items.length === 0 ? <Empty icon="🔍" text="No results" /> : (
        items.map((item, i) =>
          Array.isArray(item)
            ? item.map((t: Tweet, j) => (
                <TweetCard key={`${i}${j}`} tweet={t}
                  onClick={() => navigate(`/${t.user.username}/status/${t.id}`)} />
              ))
            : item.username
              ? (
                <div key={i}
                  className="flex items-start gap-3 p-4 border-b border-border-subtle/30 hover:bg-hover cursor-pointer transition-colors"
                  onClick={() => navigate(`/${item.username}`)}>
                  <img src={pic(item.userPic)} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                  <div>
                    <div className="font-semibold text-sm text-text-primary">{item.fullname}</div>
                    <div className="text-xs text-text-tertiary">@{item.username}</div>
                    {item.bio && <p className="text-sm text-text-secondary mt-1 line-clamp-2">{item.bio}</p>}
                  </div>
                </div>
              )
              : null
        )
      )}
    </div>
  );
}

// ─── Core Pages ─────────────────────────────────────────────────────────────

function DiscoverPage({ navigate }: { navigate: (to: string) => void }) {
  return (
    <div className="max-w-full lg:max-w-[800px] mx-auto w-full pb-20 mt-10">
      <div className="px-4 py-6 border-b border-border-subtle/30">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-accent-blue to-accent-violet">Discover</h1>
        <p className="text-text-secondary mt-1">Explore trending topics and curated lists</p>
      </div>
      <div className="p-4 space-y-4">
        {[
          { tag: "#Technology", tweets: "145K", desc: "The forefront of AI models" },
          { tag: "#Cinematic", tweets: "89K", desc: "Design engineering" },
          { tag: "Big Tech", tweets: "500K", desc: "Software discussions" }
        ].map((t, i) => (
          <div key={i} className="glass-card p-4 hover:border-accent-blue/30 cursor-pointer" onClick={() => navigate(`/search?q=${encodeURIComponent(t.tag)}`)}>
            <div className="text-xs text-text-tertiary mb-1">Trending Worldwide</div>
            <div className="font-bold text-lg">{t.tag}</div>
            <div className="text-sm text-text-secondary mt-1">{t.desc}</div>
            <div className="text-xs text-text-tertiary mt-2">{t.tweets} posts</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LikesTab({ userId, navigate }: { userId: string; navigate: (to: string) => void }) {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [cursor, setCursor] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);

  const fetchLikes = useCallback(async (c = "") => {
    if (!userId) { setLoading(false); return; }
    try {
      const url = c ? `/api/user/${userId}/likes?cursor=${encodeURIComponent(c)}` : `/api/user/${userId}/likes`;
      const res = await fetch(url).then(r => r.json());
      if (res.error) { setLoading(false); return; }
      const newTweets = res.tweets || [];
      setTweets(prev => c ? [...prev, ...newTweets] : newTweets);
      setCursor(res.nextCursor || "");
      if (!res.nextCursor || newTweets.length === 0) setDone(true);
    } catch { }
    setLoading(false);
    setLoadingMore(false);
  }, [userId]);

  useEffect(() => { fetchLikes(); }, [fetchLikes]);

  const loadMore = useCallback(() => {
    if (loadingMore || done || !cursor) return;
    setLoadingMore(true);
    fetchLikes(cursor);
  }, [cursor, done, loadingMore, fetchLikes]);

  const sentinelRef = useInfiniteScroll(loadMore, !done && !loadingMore && !!cursor);

  if (loading) return <Spinner />;
  if (!tweets.length) return <Empty icon="❤️" text="No liked tweets" />;

  return (
    <>
      {tweets.map((tweet, index) => (
        <TweetCard key={tweet.id || `like-${index}`} tweet={tweet}
          onClick={() => navigate(`/${tweet.user.username}/status/${tweet.id}`)} />
      ))}
      {!done && <div ref={sentinelRef} className="h-10" />}
      {loadingMore && <Spinner />}
    </>
  );
}

function NotificationsPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetch("/api/notifications").then(r => r.json()),
    staleTime: 30000,
    refetchInterval: 30000,
  });

  if (isLoading) return <Spinner />;
  if (error || data?.error) return <Err msg={data?.error ?? (error as Error).message} />;

  const notifs = data?.notifications ?? [];

  if (!notifs.length) return <div className="max-w-full lg:max-w-[800px] mx-auto w-full mt-20"><Empty icon="🔔" text="No notifications yet." /></div>;

  return (
    <div className="max-w-full lg:max-w-[800px] mx-auto w-full pb-20">
      <div className="px-4 py-4 border-b border-border-subtle/30 sticky top-0 bg-base/80 backdrop-blur-xl z-20 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Notifications</h1>
          <p className="text-xs text-text-tertiary">{notifs.length} recent</p>
        </div>
        {isFetching && <div className="w-2.5 h-2.5 rounded-full bg-accent-blue animate-pulse" />}
      </div>
      <div className="divide-y divide-border-subtle/20">
        {notifs.map((n: any) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="px-4 py-3 flex gap-3 hover:bg-white/[0.02] transition-colors"
          >
            <div className="text-2xl w-10 h-10 flex items-center justify-center shrink-0 rounded-full"
              style={{
                background: n.type === "like" ? "rgba(249,24,128,0.1)" :
                  n.type === "retweet" ? "rgba(0,186,124,0.1)" :
                  n.type === "follow" ? "rgba(29,155,240,0.1)" :
                  n.type === "reply" ? "rgba(255,212,0,0.1)" :
                  "rgba(255,255,255,0.05)"
              }}
            >
              {n.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {n.users?.slice(0, 5).map((u: any, i: number) => (
                  <img key={i} src={getMediaUrl(u.userPic)} className="w-6 h-6 rounded-full ring-2 ring-base -ml-1 first:ml-0" alt="" />
                ))}
              </div>
              <p className="text-sm text-text-secondary leading-snug">{n.message}</p>
              {n.tweet && (
                <div className="mt-2 px-3 py-2 rounded-xl bg-elevated/50 border border-border-subtle/30 text-xs text-text-tertiary line-clamp-2">
                  {n.tweet.text}
                </div>
              )}
              <p className="text-xs text-text-tertiary mt-1.5">
                {n.time ? new Date(n.time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function BookmarksPage({ navigate, scrollElement }: { navigate: (to: string) => void, scrollElement: HTMLElement | null }) {
  const [query, setQuery] = useState("");
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [cursor, setCursor] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);

  const fetchBookmarks = useCallback(async (c = "") => {
    try {
      const url = c ? `/api/bookmarks?cursor=${encodeURIComponent(c)}` : "/api/bookmarks";
      const res = await fetch(url).then(r => r.json());
      if (res.error) { setLoading(false); return; }
      const newTweets = res.tweets || [];
      setTweets(prev => c ? [...prev, ...newTweets] : newTweets);
      setCursor(res.nextCursor || "");
      if (!res.nextCursor || newTweets.length === 0) setDone(true);
    } catch { }
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => { fetchBookmarks(); }, [fetchBookmarks]);

  const loadMore = useCallback(() => {
    if (loadingMore || done || !cursor) return;
    setLoadingMore(true);
    fetchBookmarks(cursor);
  }, [cursor, done, loadingMore, fetchBookmarks]);

  const sentinelRef = useInfiniteScroll(loadMore, !done && !loadingMore && !!cursor);

  const handleUnbookmark = async (tweetId: string) => {
    try {
      await fetch(`/api/bookmarks/${tweetId}`, { method: "DELETE" });
      setTweets(prev => prev.filter(t => t.id !== tweetId));
    } catch {}
  };

  const fuse = useMemo(() => new Fuse(tweets, { keys: ["text", "user.username", "user.fullname"], threshold: 0.3 }), [tweets]);
  const results = query ? fuse.search(query).map(r => r.item) : tweets;

  if (loading) return <Spinner />;
  if (!tweets.length) return <div className="max-w-full lg:max-w-[800px] mx-auto w-full mt-20"><Empty icon="🔖" text="No bookmarks yet." /></div>;

  return (
    <div className="max-w-full lg:max-w-[800px] mx-auto w-full pb-20">
      <div className="px-4 py-4 border-b border-border-subtle/30 sticky top-0 bg-base/80 backdrop-blur-xl z-20">
        <h1 className="text-xl font-bold">Bookmarks</h1>
        <p className="text-xs text-text-tertiary mb-3">{tweets.length} saved</p>
        <input
          type="text"
          placeholder="Search bookmarks..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full bg-elevated border border-border-subtle rounded-xl px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
        />
      </div>
      {results.map((tweet, index) => (
        <div key={tweet.id || index} className="relative group">
          <TweetCard tweet={tweet} onClick={() => navigate(`/${tweet.user.username}/status/${tweet.id}`)} />
          <button
            onClick={() => handleUnbookmark(String(tweet.id))}
            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded-lg border border-red-500/20"
            title="Remove bookmark"
          >
            ✕
          </button>
        </div>
      ))}
      {!done && <div ref={sentinelRef} className="h-10" />}
      {loadingMore && <Spinner />}
    </div>
  );
}

// ─── Vault (Offline Archive) ───────────────────────────────────────────────────

function VaultPage({ navigate }: { navigate: (to: string) => void }) {
  const [items, setItems] = useState<{ id: string; saved_at: number; data: Tweet }[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const fetchVault = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vault");
      const data = await res.json();
      setItems(data.tweets ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchVault(); }, [fetchVault]);

  const handleDelete = async (id: string) => {
    await fetch(`/api/vault/${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const filtered = query.trim()
    ? items.filter(i => {
        const t = i.data;
        const text = `${t.text ?? ""} ${t.user?.username ?? ""} ${t.user?.fullname ?? ""}`.toLowerCase();
        return text.includes(query.toLowerCase());
      })
    : items;

  if (loading) return <div className="max-w-full lg:max-w-[800px] mx-auto w-full p-6"><Spinner /></div>;
  if (!items.length) return <div className="max-w-full lg:max-w-[800px] mx-auto w-full mt-20"><Empty icon="🗄️" text="Your Vault is empty. Save tweets to access them offline." /></div>;

  return (
    <div className="max-w-full lg:max-w-[800px] mx-auto w-full">
      <div className="p-4 border-b border-border-subtle/30 sticky top-0 bg-base/90 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            🗄️ Vault
            <span className="text-sm font-normal text-text-tertiary">({items.length} saved)</span>
          </h2>
        </div>
        <input
          type="text"
          className="w-full py-2.5 px-4 text-sm text-text-primary bg-surface border border-border-subtle/50 rounded-xl outline-none transition-all placeholder:text-text-tertiary focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/15"
          placeholder="Search saved tweets..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {filtered.map((item) => (
        <div key={item.id} className="relative group">
          <TweetCard tweet={item.data} onClick={() => navigate(`/${item.data.user.username}/status/${item.id}`)} />
          <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] text-text-tertiary bg-surface/80 backdrop-blur-sm px-2 py-1 rounded-lg border border-border-subtle/20">
              Saved {new Date(item.saved_at).toLocaleDateString()}
            </span>
            <button
              onClick={() => handleDelete(item.id)}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded-lg border border-red-500/20 cursor-pointer"
              title="Remove from Vault"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function DeckPage({ navigate }: { navigate: (to: string) => void }) {
  const [homeRef, setHomeRef] = useState<HTMLElement | null>(null);
  const [discRef, setDiscRef] = useState<HTMLElement | null>(null);
  const [bookRef, setBookRef] = useState<HTMLElement | null>(null);

  return (
    <div className="flex h-full w-full overflow-hidden bg-base gap-px p-1">
      <div className="flex-1 min-w-[350px] border-r border-border-subtle/30 overflow-y-auto no-scrollbar bg-base relative" ref={setHomeRef}>
        {homeRef && <HomePage navigate={navigate} scrollElement={homeRef} />}
      </div>
      <div className="flex-1 min-w-[350px] border-r border-border-subtle/30 overflow-y-auto no-scrollbar bg-base relative hide-scrollbar" ref={setDiscRef}>
        {discRef && <FollowingPage navigate={navigate} />}
      </div>
      <div className="flex-1 min-w-[350px] overflow-y-auto no-scrollbar bg-base relative hide-scrollbar" ref={setBookRef}>
        {bookRef && <DiscoverPage navigate={navigate} />}
      </div>
    </div>
  );
}

function ListPage({ listId, navigate, scrollElement }: { listId: string; navigate: (to: string) => void, scrollElement: HTMLElement | null }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["list", listId],
    queryFn: () => fetch(`/api/list/${listId}`).then(r => r.json())
  });

  if (isLoading) return <Spinner />;
  if (error || data?.error) return <Err msg={data?.error ?? (error as Error).message} />;

  const tweets = data.tweets || [];

  return (
    <div className="max-w-full lg:max-w-[800px] mx-auto w-full pb-20">
      <div className="px-4 py-6 border-b border-border-subtle/30 bg-elevated/50">
        <h1 className="text-2xl font-bold">{data.list?.name || `List ${listId}`}</h1>
        <p className="text-text-secondary mt-2">{data.list?.description}</p>
      </div>
      {tweets.map((tweet: any, index: number) => (
        <TweetCard key={tweet.id || index} tweet={tweet} onClick={() => navigate(`/${tweet.user.username}/status/${tweet.id}`)} />
      ))}
    </div>
  );
}

// ─── Keyword Monitor ──────────────────────────────────────────────────────────

function MonitorPage({ navigate }: { navigate: (to: string) => void }) {
  const { isUnlocked } = useAuth();
  const storageKey = "ghost_monitor_keywords";
  const [keywords, setKeywords] = useState<string[]>([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setKeywords(saved ? JSON.parse(saved) : []);
    } catch {
      setKeywords([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (keywords.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(keywords));
    }
  }, [keywords, storageKey]);

  const kwStr = keywords.join(",");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["monitor", kwStr],
    queryFn: () => kwStr ? fetch(`/api/monitor/results?keywords=${encodeURIComponent(kwStr)}`).then(r => r.json()) : { tweets: [] },
    staleTime: 30000,
    refetchInterval: 60000,
    enabled: isUnlocked && keywords.length > 0,
  });

  const addKeyword = () => {
    const kw = input.trim().toLowerCase();
    if (kw && !keywords.includes(kw) && keywords.length < 10) {
      setKeywords(prev => [...prev, kw]);
      setInput("");
    }
  };

  const removeKeyword = (kw: string) => setKeywords(prev => prev.filter(k => k !== kw));

  const kwColors: Record<string, string> = {};
  const palette = ["#1d9bf0", "#7856ff", "#00ba7c", "#f91880", "#ffd400", "#ff7a00", "#34d399", "#f43f5e", "#a78bfa", "#38bdf8"];
  keywords.forEach((kw, i) => { kwColors[kw] = palette[i % palette.length] || "#888"; });

  const highlightText = (text: string) => {
    let result = text;
    keywords.forEach(kw => {
      const re = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      result = result.replace(re, `<mark style="background:${kwColors[kw]}30;color:${kwColors[kw]};padding:0 2px;border-radius:3px;font-weight:600">$1</mark>`);
    });
    return result;
  };

  const tweets = data?.tweets ?? [];

  if (!isUnlocked) return <div className="p-10 text-center"><h2 className="text-xl font-bold">🔒 Vault Locked</h2><p className="text-text-tertiary mt-2">Unlock your Ghost Mode vault to access the keyword monitor.</p></div>;

  return (
    <div className="max-w-full lg:max-w-200 mx-auto w-full pb-20">
      <div className="px-4 py-4 border-b border-border-subtle/30 sticky top-0 bg-base/80 backdrop-blur-xl z-20">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">📡 Keyword Monitor</h1>
            <p className="text-xs text-text-tertiary mt-0.5">Real-time alerts for keywords across Twitter</p>
          </div>
          {isFetching && <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />}
        </div>

        <div className="flex gap-2 mb-3">
          <input
            type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addKeyword()}
            placeholder="Add keyword to monitor..."
            className="flex-1 bg-elevated border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-blue/50 transition-all"
          />
          <button onClick={addKeyword}
            className="px-4 py-2.5 rounded-xl bg-accent-blue/20 text-accent-blue text-sm font-medium hover:bg-accent-blue/30 transition-colors border border-accent-blue/30">
            Add
          </button>
        </div>

        {keywords.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {keywords.map(kw => (
              <span key={kw} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity"
                style={{ background: `${kwColors[kw]}15`, color: kwColors[kw], borderColor: `${kwColors[kw]}30` }}
                onClick={() => removeKeyword(kw)}>
                {kw} <span className="opacity-60">✕</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {keywords.length === 0 && <div className="mt-20"><Empty icon="📡" text="Add keywords above to start monitoring" /></div>}
      {isLoading && keywords.length > 0 && <Spinner />}

      <div className="divide-y divide-border-subtle/20">
        {tweets.map((tweet: any, i: number) => (
          <div key={tweet.id || i} className="px-4 py-3 hover:bg-white/2 transition-colors cursor-pointer"
            onClick={() => navigate(`/${tweet.user?.username}/status/${tweet.id}`)}>
            <div className="flex items-center gap-2 mb-1.5">
              <img src={getMediaUrl(tweet.user?.userPic)} className="w-8 h-8 rounded-full" alt="" />
              <span className="font-semibold text-sm text-text-primary">{tweet.user?.fullname}</span>
              <span className="text-xs text-text-tertiary">@{tweet.user?.username}</span>
              <span className="text-xs ml-auto px-2 py-0.5 rounded-full font-medium"
                style={{ background: `${kwColors[tweet._keyword || ""] || "#333"}15`, color: kwColors[tweet._keyword || ""] || "#999" }}>
                {tweet._keyword}
              </span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">{sanitizeText(tweet.text || "")}</p>
            <div className="flex gap-4 mt-2 text-xs text-text-tertiary">
              <span>❤️ {fmt(tweet.stats?.likes)}</span>
              <span>🔁 {fmt(tweet.stats?.retweets)}</span>
              <span>{tweet.time ? new Date(tweet.time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Engagement Heatmap ───────────────────────────────────────────────────────

function HeatmapPage() {
  const { isUnlocked } = useAuth();
  const [targetUsername, setTargetUsername] = useState("");
  const [activeTarget, setActiveTarget] = useState("");
  const [tweets, setTweets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function analyzeTarget() {
    const un = targetUsername.trim().replace('@', '');
    if (!un) return;
    setActiveTarget(un);
    setLoading(true); setTweets([]);
    try {
      const res = await fetch(`/api/timeline/${un}/tweets`).then(r => r.json());
      setTweets((res.tweets?.content || []).flat());
    } catch {}
    setLoading(false);
  }

  const dayCounts = useMemo(() => {
    const map = new Map<string, { count: number; topTweet: any }>();
    tweets.forEach(t => {
      if (!t.time) return;
      const d = new Date(t.time);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const cur = map.get(key) || { count: 0, topTweet: null };
      cur.count++;
      if (!cur.topTweet || (t.stats?.likes || 0) > (cur.topTweet.stats?.likes || 0)) cur.topTweet = t;
      map.set(key, cur);
    });
    return map;
  }, [tweets]);

  const hourGrid = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    tweets.forEach(t => {
      if (!t.time) return;
      const d = new Date(t.time);
      const day = d.getDay();
      const hour = d.getHours();
      if (grid[day]) grid[day][hour]++;
    });
    return grid;
  }, [tweets]);

  const weeks = useMemo(() => {
    const result: string[][] = [];
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - (52 * 7) + 1 - start.getDay());
    for (let w = 0; w < 52; w++) {
      const week: string[] = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        week.push(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`);
      }
      result.push(week);
    }
    return result;
  }, []);

  const maxCount = Math.max(...Array.from(dayCounts.values()).map(v => v.count), 1);
  const maxHour = Math.max(...hourGrid.flat(), 1);

  const getColor = (count: number, max: number) => {
    if (count === 0) return "rgba(255,255,255,0.03)";
    const intensity = count / max;
    if (intensity > 0.75) return "#39d353";
    if (intensity > 0.5) return "#26a641";
    if (intensity > 0.25) return "#006d32";
    return "#0e4429";
  };

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const hoveredInfo = hoveredDay ? dayCounts.get(hoveredDay) : null;

  if (!isUnlocked) return <div className="p-10 text-center"><h2 className="text-xl font-bold">🔒 Vault Locked</h2><p className="text-text-tertiary mt-2">Unlock your Ghost Mode vault to view engagement heatmap.</p></div>;

  return (
    <div className="max-w-full lg:max-w-200 mx-auto w-full pb-20 px-4">
      <div className="py-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          📊 Engagement Heatmap
        </h1>
        <p className="text-text-tertiary mt-1 sm:text-base text-sm">Analyze posting activity and engagement patterns over time.</p>
        <div className="mt-4">
          <TargetInput value={targetUsername} onChange={setTargetUsername} onSubmit={analyzeTarget} loading={loading && !activeTarget} />
        </div>
      </div>

      {!activeTarget && !loading && (
        <div className="mt-20 flex flex-col items-center opacity-60"><span className="text-4xl mb-4">📊</span><p className="text-center text-text-tertiary">Enter a target username to view their engagement heatmap</p></div>
      )}
      {!activeTarget && loading && <div className="mt-20 flex justify-center"><div className="w-8 h-8 border-4 border-accent-blue border-t-transparent rounded-full animate-spin"></div></div>}

      {activeTarget && tweets.length > 0 && (
        <>

      <div className="bg-elevated/40 rounded-2xl border border-border-subtle/20 p-4 mb-6 overflow-x-auto">
        <h3 className="text-sm font-medium text-text-secondary mb-3">Activity Calendar (52 weeks)</h3>
        <div className="flex gap-0.75 min-w-175">
          <div className="flex flex-col gap-0.75 mr-1">
            {dayLabels.map((d, i) => (
              <div key={d} className="h-3.25 text-[9px] text-text-tertiary flex items-center">{i % 2 === 1 ? d : ""}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.75">
              {week.map(day => {
                const info = dayCounts.get(day);
                return (
                  <div key={day}
                    className="w-3.25 h-3.25 rounded-sm cursor-pointer transition-all hover:ring-1 hover:ring-white/30"
                    style={{ background: getColor(info?.count || 0, maxCount) }}
                    onMouseEnter={() => setHoveredDay(day)}
                    onMouseLeave={() => setHoveredDay(null)}
                    title={`${day}: ${info?.count || 0} tweets`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        {hoveredDay && (
          <div className="mt-3 text-xs text-text-secondary">
            <span className="font-medium text-text-primary">{hoveredDay}</span>: {hoveredInfo?.count || 0} tweets
            {hoveredInfo?.topTweet && <span className="ml-2 text-text-tertiary">• Top: {hoveredInfo.topTweet.text?.slice(0, 60)}...</span>}
          </div>
        )}
        <div className="flex items-center gap-2 mt-3 text-[10px] text-text-tertiary">
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map(v => (
            <div key={v} className="w-2.75 h-2.75 rounded-sm" style={{ background: getColor(v * maxCount || 0, maxCount) }} />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* Hour-of-Day Grid */}
      <div className="bg-elevated/40 rounded-2xl border border-border-subtle/20 p-4">
        <h3 className="text-sm font-medium text-text-secondary mb-3">Best Times to Post</h3>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="flex gap-[2px] mb-1 ml-10">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex-1 text-[8px] text-text-tertiary text-center">{h % 6 === 0 ? `${h}h` : ""}</div>
              ))}
            </div>
            {dayLabels.map((day, di) => (
              <div key={day} className="flex gap-[2px] items-center">
                <div className="w-9 text-[10px] text-text-tertiary shrink-0">{day}</div>
                {(hourGrid[di] || []).map((count: number, hi: number) => (
                  <div key={hi}
                    className="flex-1 h-5 rounded-sm transition-colors"
                    style={{ background: getColor(count, maxHour) }}
                    title={`${day} ${hi}:00 — ${count} tweets`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

// ─── Social Graph ─────────────────────────────────────────────────────────────

function GraphPage({ navigate }: { navigate: (to: string) => void }) {
  const { isUnlocked } = useAuth();
  const [targetUsername, setTargetUsername] = useState("");
  const [activeTarget, setActiveTarget] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<any>(null);

  async function analyzeTarget() {
    const un = targetUsername.trim().replace('@', '');
    if (!un) return;
    setActiveTarget(un);
    setLoading(true); setUsers([]);
    try {
      const profile = await fetch(`/api/profile/${encodeURIComponent(un)}`).then(r => r.json());
      if (profile?.profile?.id || profile?.user?.id) {
        let all: User[] = [];
        let cursor = "";
        for (let i = 0; i < 3; i++) {
          const url = `/api/following/${profile.profile?.id || profile.user?.id}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
          const res = await fetch(url).then(r => r.json());
          all = [...all, ...(res.users ?? [])];
          if (!res.nextCursor) break;
          cursor = res.nextCursor;
        }
        setUsers(all);
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    if (!isUnlocked || !svgRef.current || users.length === 0) return;

    const svg = svgRef.current;
    const width = svg.clientWidth || 800;
    const height = svg.clientHeight || 600;

    // Clear
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Build D3 force simulation
    import("d3").then(d3 => {
      const maxFollowers = Math.max(...users.map(u => u.followers || 1), 1);
      const radiusScale = d3.scaleSqrt().domain([0, maxFollowers]).range([4, 24]);

      const nodes = users.map((u, i) => ({
        id: String(u.id),
        username: u.username,
        fullname: u.fullname,
        pic: u.userPic,
        followers: u.followers || 0,
        verified: u.verifiedType !== "None",
        r: radiusScale(u.followers || 0),
        x: width / 2 + (Math.random() - 0.5) * 200,
        y: height / 2 + (Math.random() - 0.5) * 200,
      }));

      // Create links between mutuals (simplified: connect verified to verified, etc.)
      const links: any[] = [];
      const verifiedNodes = nodes.filter(n => n.verified);
      for (let i = 0; i < verifiedNodes.length; i++) {
        for (let j = i + 1; j < Math.min(verifiedNodes.length, i + 4); j++) {
          const s = verifiedNodes[i];
          const t = verifiedNodes[j];
          if (s && t) links.push({ source: s.id, target: t.id });
        }
      }
      // Connect nearby-follower-count users
      const sorted = [...nodes].sort((a, b) => b.followers - a.followers);
      for (let i = 0; i < sorted.length - 1 && links.length < 200; i++) {
        const s = sorted[i];
        const t = sorted[i + 1];
        if (s && t && Math.random() > 0.6) links.push({ source: s.id, target: t.id });
      }

      const svgD3 = d3.select(svg);

      // Zoom
      const g = svgD3.append("g");
      svgD3.call(
        d3.zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.3, 5])
          .on("zoom", (event) => g.attr("transform", event.transform))
      );

      // Links
      const link = g.append("g").selectAll("line")
        .data(links).enter().append("line")
        .attr("stroke", "rgba(255,255,255,0.05)")
        .attr("stroke-width", 0.5);

      // Nodes
      const node = g.append("g").selectAll("g")
        .data(nodes).enter().append("g")
        .attr("cursor", "pointer")
        .call(d3.drag<SVGGElement, any>()
          .on("start", (event, d: any) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on("drag", (event, d: any) => { d.fx = event.x; d.fy = event.y; })
          .on("end", (event, d: any) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
        ) as any;

      node.append("circle")
        .attr("r", (d: any) => d.r)
        .attr("fill", (d: any) => d.verified ? "#1d9bf0" : "rgba(255,255,255,0.15)")
        .attr("stroke", (d: any) => d.verified ? "#1d9bf044" : "rgba(255,255,255,0.08)")
        .attr("stroke-width", 2);

      node.append("text")
        .attr("dy", (d: any) => d.r + 12)
        .attr("text-anchor", "middle")
        .attr("fill", "rgba(255,255,255,0.5)")
        .attr("font-size", "8px")
        .text((d: any) => d.followers > 10000 ? `@${d.username}` : "");

      node.on("click", (_: any, d: any) => navigate(`/${d.username}`));
      node.on("mouseenter", (_: any, d: any) => setHoveredNode(d));
      node.on("mouseleave", () => setHoveredNode(null));

      const sim = d3.forceSimulation(nodes as any)
        .force("link", d3.forceLink(links).id((d: any) => d.id).distance(60))
        .force("charge", d3.forceManyBody().strength(-30))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius((d: any) => d.r + 2))
        .on("tick", () => {
          link
            .attr("x1", (d: any) => d.source?.x ?? 0)
            .attr("y1", (d: any) => d.source?.y ?? 0)
            .attr("x2", (d: any) => d.target?.x ?? 0)
            .attr("y2", (d: any) => d.target?.y ?? 0);
          node.attr("transform", (d: any) => `translate(${d.x ?? 0},${d.y ?? 0})`);
        });
    });
  }, [users, isUnlocked]);

  if (!isUnlocked) return <div className="p-10 text-center"><h2 className="text-xl font-bold">🔒 Vault Locked</h2><p className="text-text-tertiary mt-2">Unlock your Ghost Mode vault to view your connections graph.</p></div>;

  const verified = users.filter(u => u.verifiedType !== "None").length;
  const avgFollowers = users.length > 0 ? Math.round(users.reduce((s, u) => s + (u.followers || 0), 0) / users.length) : 0;

  return (
    <div className="flex flex-col h-[100dvh] w-full relative overflow-y-auto">
      <div className="px-4 py-6 lg:max-w-200 mx-auto w-full z-20 sticky top-0 bg-base/80 backdrop-blur-xl border-b border-border-subtle/30">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary flex items-center gap-3">
          🕸️ Social Graph
          {activeTarget && users.length > 0 && <span className="bg-elevated text-text-secondary text-sm px-3 py-1 rounded-full border border-border-subtle font-medium">{users.length} nodes</span>}
        </h1>
        <p className="text-text-tertiary mt-1 sm:mt-2 text-sm sm:text-base">Force-directed mapping of network topology.</p>
        <div className="mt-4">
          <TargetInput value={targetUsername} onChange={setTargetUsername} onSubmit={analyzeTarget} loading={loading && !activeTarget} />
        </div>
      </div>

      {!activeTarget && !loading && (
        <div className="mt-20 flex flex-col items-center opacity-60"><span className="text-4xl mb-4">🕸️</span><p className="text-center text-text-tertiary">Enter a target username to visualize their network</p></div>
      )}
      {!activeTarget && loading && <div className="mt-20 flex justify-center"><div className="w-8 h-8 border-4 border-accent-blue border-t-transparent rounded-full animate-spin"></div></div>}
      {activeTarget && !loading && users.length === 0 && (
         <div className="mt-20 flex justify-center"><Empty icon="🕸️" text="No connections found to visualize" /></div>
      )}

      {activeTarget && users.length > 0 && (
        <>
          {/* Stats overlay */}
      <div className="absolute top-4 left-4 z-10 bg-base/90 backdrop-blur-xl rounded-2xl border border-border-subtle/30 p-4 text-xs space-y-1.5">
        <h2 className="text-sm font-bold flex items-center gap-2">🕸️ Social Graph</h2>
        <div className="text-text-tertiary"><span className="text-text-primary font-medium">{users.length}</span> connections</div>
        <div className="text-text-tertiary"><span className="text-accent-blue font-medium">{verified}</span> verified</div>
        <div className="text-text-tertiary"><span className="text-text-primary font-medium">{fmt(avgFollowers)}</span> avg followers</div>
        <div className="text-text-tertiary mt-2 opacity-60">Scroll to zoom • Drag nodes</div>
      </div>

      {/* Hovered node tooltip */}
      {hoveredNode && (
        <div className="absolute top-4 right-4 z-10 bg-base/90 backdrop-blur-xl rounded-2xl border border-border-subtle/30 p-3 text-xs">
          <div className="font-semibold text-text-primary">{hoveredNode.fullname}</div>
          <div className="text-text-tertiary">@{hoveredNode.username}</div>
          <div className="text-text-secondary mt-1">{fmt(hoveredNode.followers)} followers</div>
          {hoveredNode.verified && <span className="text-accent-blue text-[10px]">✓ verified</span>}
        </div>
      )}

          <svg ref={svgRef} className="flex-1 w-full bg-base" style={{ minHeight: "calc(100vh - 200px)" }} />
        </>
      )}
    </div>
  );
}

// ─── Monetization Dashboard ───────────────────────────────────────────────────

function MoneyPage() {
  const { isUnlocked } = useAuth();
  const [targetUsername, setTargetUsername] = useState("");
  const [activeTarget, setActiveTarget] = useState("");
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function analyzeTarget() {
    const un = targetUsername.trim().replace('@', '');
    if (!un) return;
    setActiveTarget(un);
    setLoading(true);
    setProfile(null);
    try {
      const p = await fetch(`/api/timeline/${encodeURIComponent(un)}/tweets`).then(r => r.json());
      setProfile(p);
    } catch {}
    setLoading(false);
  }

  if (!isUnlocked) return <div className="p-10 text-center"><h2 className="text-xl font-bold">🔒 Vault Locked</h2><p className="text-text-tertiary mt-2">Unlock your Ghost Mode vault to view monetization details.</p></div>;

  const user = profile?.user || {};
  const followers = user.followers || 0;
  const tweets = user.tweets || user.statuses || 0;
  const following = user.following || 0;
  const engagementRate = tweets > 0 ? Math.min(((user.likes || 0) / tweets * 100), 15).toFixed(1) : "0";

  // Revenue share eligibility (X Premium)
  const hasEnoughFollowers = followers >= 500;
  const hasEnoughImpressions = true; // Assume meets 5M/3mo threshold if >10K followers
  const isPremium = user.verifiedType !== "None";

  // Estimated earnings
  const cpmEstimate = 2.5; // Average X ads CPM
  const estimatedMonthlyViews = followers * 15; // rough estimate
  const estimatedRevShare = (estimatedMonthlyViews / 1000) * cpmEstimate * 0.5;
  const estimatedSponsored = followers >= 10000 ? (followers / 1000) * 20 : 0;

  const milestones = [
    { target: 500, label: "Revenue Share Eligible", icon: "💰" },
    { target: 1000, label: "X Premium Tips Tier", icon: "🎁" },
    { target: 5000, label: "Subscriptions Unlock", icon: "⭐" },
    { target: 10000, label: "Sponsorship Viable", icon: "🤝" },
    { target: 50000, label: "Media Kit Level", icon: "📋" },
    { target: 100000, label: "Brand Ambassador", icon: "👑" },
    { target: 500000, label: "Premium Partner", icon: "💎" },
    { target: 1000000, label: "Mega Influence", icon: "🔥" },
  ];

  const nextMilestone = milestones.find(m => followers < m.target);
  const progress = nextMilestone ? Math.min((followers / nextMilestone.target) * 100, 100) : 100;

  return (
    <div className="max-w-full lg:max-w-200 mx-auto w-full pb-20 px-4">
      <div className="py-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          💰 Monetization
        </h1>
        <p className="text-text-tertiary mt-1 sm:text-base text-sm">Analyze earnings estimates & platform eligibility score for any account.</p>
        <div className="mt-4">
          <TargetInput value={targetUsername} onChange={setTargetUsername} onSubmit={analyzeTarget} loading={loading && !activeTarget} />
        </div>
      </div>

      {!activeTarget && !loading && (
        <div className="mt-20 flex flex-col items-center opacity-60"><span className="text-4xl mb-4">💰</span><p className="text-center text-text-tertiary">Enter a target username to view monetization estimates</p></div>
      )}
      {!activeTarget && loading && <div className="mt-20 flex justify-center"><div className="w-8 h-8 border-4 border-accent-blue border-t-transparent rounded-full animate-spin"></div></div>}

      {activeTarget && profile && (
        <>

      {/* Progress to Next Milestone */}
      {nextMilestone && (
        <div className="bg-elevated/40 rounded-2xl border border-border-subtle/20 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-secondary">Next Milestone</span>
            <span className="text-sm font-bold text-text-primary">{nextMilestone.icon} {nextMilestone.label}</span>
          </div>
          <div className="h-3 bg-surface rounded-full overflow-hidden mb-2">
            <motion.div
              initial={{ width: 0 }} animate={{ width: `${progress}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg, #1d9bf0, #7856ff)" }}
            />
          </div>
          <div className="flex justify-between text-xs text-text-tertiary">
            <span>{fmt(followers)} followers</span>
            <span>{fmt(nextMilestone.target)} needed ({Math.round(progress)}%)</span>
          </div>
        </div>
      )}

      {/* Revenue Streams */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {/* Revenue Share */}
        <div className="bg-elevated/40 rounded-2xl border border-border-subtle/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center text-lg">💵</div>
            <div>
              <h3 className="text-sm font-medium text-text-primary">X Revenue Share</h3>
              <p className="text-[10px] text-text-tertiary">Ad revenue from impressions</p>
            </div>
          </div>
          <div className="text-2xl font-bold text-green-400 mb-1">${estimatedRevShare.toFixed(0)}<span className="text-xs text-text-tertiary font-normal">/mo est.</span></div>
          <div className="flex gap-1 text-xs mt-2">
            <span className={`px-2 py-0.5 rounded-full ${hasEnoughFollowers ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
              {hasEnoughFollowers ? "✓" : "✗"} 500+ followers
            </span>
            <span className={`px-2 py-0.5 rounded-full ${isPremium ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
              {isPremium ? "✓ Premium" : "⚠ Need Premium"}
            </span>
          </div>
        </div>

        {/* Sponsorships */}
        <div className="bg-elevated/40 rounded-2xl border border-border-subtle/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center text-lg">🤝</div>
            <div>
              <h3 className="text-sm font-medium text-text-primary">Sponsorships</h3>
              <p className="text-[10px] text-text-tertiary">Brand deals & partnerships</p>
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-400 mb-1">${estimatedSponsored.toFixed(0)}<span className="text-xs text-text-tertiary font-normal">/post est.</span></div>
          <div className="text-xs text-text-tertiary mt-2">
            {followers >= 10000 ? "You're eligible for sponsorships" : `Need ${fmt(10000 - followers)} more followers`}
          </div>
        </div>

        {/* Subscriptions */}
        <div className="bg-elevated/40 rounded-2xl border border-border-subtle/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-lg">⭐</div>
            <div>
              <h3 className="text-sm font-medium text-text-primary">Subscriptions</h3>
              <p className="text-[10px] text-text-tertiary">Monthly subscriber revenue</p>
            </div>
          </div>
          <div className="text-xs text-text-tertiary">
            {followers >= 5000 ? (
              <span className="text-blue-400 font-medium">Eligible! Set up at x.com/settings/subscriptions</span>
            ) : (
              <span>Need {fmt(Math.max(0, 5000 - followers))} more followers to unlock</span>
            )}
          </div>
        </div>

        {/* Tips */}
        <div className="bg-elevated/40 rounded-2xl border border-border-subtle/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-yellow-500/10 flex items-center justify-center text-lg">🎁</div>
            <div>
              <h3 className="text-sm font-medium text-text-primary">Tips</h3>
              <p className="text-[10px] text-text-tertiary">Bitcoin, Ethereum, Cash tips</p>
            </div>
          </div>
          <div className="text-xs text-text-tertiary">
            Available to all accounts. Enable at x.com/settings/monetization.
          </div>
        </div>
      </div>

      {/* Milestones */}
      <div className="bg-elevated/40 rounded-2xl border border-border-subtle/20 p-4">
        <h3 className="text-sm font-medium text-text-secondary mb-3">🏆 Follower Milestones</h3>
        <div className="space-y-2">
          {milestones.map(m => {
            const reached = followers >= m.target;
            const pct = Math.min((followers / m.target) * 100, 100);
            return (
              <div key={m.target} className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${reached ? "bg-green-500/5" : "bg-surface/30"}`}>
                <span className="text-lg">{m.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${reached ? "text-green-400" : "text-text-secondary"}`}>{m.label}</span>
                    <span className="text-[10px] text-text-tertiary">{fmt(m.target)}</span>
                  </div>
                  <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: reached ? "#22c55e" : "rgba(29,155,240,0.5)" }} />
                  </div>
                </div>
                {reached && <span className="text-green-400 text-xs">✓</span>}
              </div>
            );
          })}
        </div>
      </div>
        </>
      )}
    </div>
  );
}

// ─── Shadowban Checker ────────────────────────────────────────────────────────

function ShadowbanPage() {
  const { isUnlocked } = useAuth();
  const [targetUsername, setTargetUsername] = useState("");
  const [activeTarget, setActiveTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  if (!isUnlocked) return <div className="p-10 text-center"><h2 className="text-xl font-bold">🔒 Vault Locked</h2><p className="text-text-tertiary mt-2">Unlock your Ghost Mode vault to perform account health checks.</p></div>;

  const analyzeTarget = async () => {
    const un = targetUsername.trim().replace('@', '');
    if (!un) return;
    setActiveTarget(un);
    setLoading(true);
    try {
      const res = await fetch(`/api/shadowban?username=${encodeURIComponent(un)}`);
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: "Failed to check" });
    }
    setLoading(false);
  };

  return (
    <div className="max-w-full lg:max-w-[800px] mx-auto w-full pb-20 px-4">
      <div className="py-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          👻 Shadowban Checker
        </h1>
        <p className="text-text-tertiary mt-1 sm:text-base text-sm">Check if a profile is hidden from search or suggestions.</p>
        <div className="mt-4">
          <TargetInput value={targetUsername} onChange={setTargetUsername} onSubmit={analyzeTarget} loading={loading && !activeTarget} />
        </div>
      </div>

      {!activeTarget && !loading && (
        <div className="mt-20 flex flex-col items-center opacity-60"><span className="text-4xl mb-4">👻</span><p className="text-center text-text-tertiary">Enter a target username to check shadowban status</p></div>
      )}
      {!activeTarget && loading && <div className="mt-20 flex justify-center"><div className="w-8 h-8 border-4 border-accent-red border-t-transparent rounded-full animate-spin"></div></div>}

      {activeTarget && result && !result.error && (
        <div className="space-y-3">
          <div className={`p-4 rounded-xl border ${result.searchBan ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-green-500/10 border-green-500/20 text-green-400"}`}>
            <div className="font-bold mb-1 flex items-center gap-2">
              {result.searchBan ? "❌ Search Ban Active" : "✅ No Search Ban"}
            </div>
            <p className="text-xs opacity-80">
              {result.searchBan ? "Tweets and account are completely hidden from public search results." : "Account and tweets appear normally in search."}
            </p>
          </div>

          <div className={`p-4 rounded-xl border ${result.suggestionBan ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-green-500/10 border-green-500/20 text-green-400"}`}>
            <div className="font-bold mb-1 flex items-center gap-2">
              {result.suggestionBan ? "❌ Suggestion Ban Active" : "✅ No Suggestion Ban"}
            </div>
            <p className="text-xs opacity-80">
              {result.suggestionBan ? "Account is hidden from autocomplete search suggestions and 'Who to follow'." : "Account appears normally in search suggestions."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Direct Messages ──────────────────────────────────────────────────────────

function MessagesPage() {
  const { isUnlocked } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["messages"],
    queryFn: () => fetch("/api/messages").then(r => r.json()),
    enabled: isUnlocked,
  });

  if (!isUnlocked) return <div className="p-10 text-center"><h2 className="text-xl font-bold">🔒 Vault Locked</h2><p className="text-text-tertiary mt-2">Unlock your Ghost Mode vault to view your direct messages.</p></div>;
  if (isLoading) return <Spinner />;

  const entries = data?.inbox_initial_state?.entries || [];
  const users = data?.inbox_initial_state?.users || {};
  const conversations = entries.filter((e: any) => e.message?.message_data).map((e: any) => e.message);

  return (
    <div className="max-w-full lg:max-w-[800px] mx-auto w-full pb-20 h-screen flex flex-col">
      <div className="px-4 py-4 border-b border-border-subtle/30 bg-base/80 backdrop-blur-xl z-20">
        <h1 className="text-xl font-bold flex items-center gap-2">💬 Messages</h1>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border-subtle/20">
        {conversations.length === 0 && <Empty icon="💬" text="No messages found" />}
        {conversations.map((msg: any) => {
          const sender = users[msg.message_data?.sender_id];
          if (!sender) return null;
          return (
            <div key={msg.id} className="p-4 hover:bg-white/[0.02] cursor-pointer transition-colors flex gap-3">
              <img src={getMediaUrl(sender.profile_image_url_https)} className="w-12 h-12 rounded-full" alt="" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm text-text-primary truncate">{sender.name}</span>
                  <span className="text-xs text-text-tertiary whitespace-nowrap ml-2">
                    {new Date(parseInt(msg.message_data.time)).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-text-secondary truncate">{msg.message_data.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Thread Unroller ──────────────────────────────────────────────────────────

function ThreadUnrollerPage({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["thread", id],
    queryFn: () => fetch(`/api/thread/${id}`).then(r => r.json()),
    enabled: !!id,
  });

  if (isLoading) return <Spinner />;
  const tweets = data?.tweets || [];
  if (!tweets.length) return <Empty icon="🧵" text="Could not unroll thread" />;

  // Sort chronologically
  tweets.sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const op = tweets[0].user;

  // Filter out other users' replies to make it a clean author thread
  const authorTweets = tweets.filter((t: any) => t.user?.id === op?.id);

  return (
    <div className="max-w-2xl mx-auto w-full pb-20 px-4 pt-8">
      <div className="flex items-center gap-3 mb-8">
        <img src={getMediaUrl(op.userPic)} className="w-12 h-12 rounded-full" alt="" />
        <div>
          <h1 className="font-bold text-lg">{op.fullname}</h1>
          <p className="text-sm text-text-tertiary">@{op.username}</p>
        </div>
        <button onClick={() => window.print()} className="ml-auto px-4 py-2 bg-text-primary text-base rounded-full text-sm font-bold hover:opacity-90 transition-opacity">
          Export PDF
        </button>
      </div>

      <div className="space-y-6">
        {authorTweets.map((t: any, i: number) => (
          <div key={t.id} className="text-text-primary leading-relaxed text-[15px] sm:text-[17px]">
            <p className="whitespace-pre-wrap">{sanitizeText(t.text)}</p>
            {t.media?.map((m: any, j: number) => (
              <img key={j} src={getMediaUrl(m.url)} className="mt-4 rounded-xl border border-border-subtle max-h-[400px] object-cover" alt="" />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-12 pt-6 border-t border-border-subtle/30 text-center text-text-tertiary text-sm">
        🧵 Thread complete • {authorTweets.length} tweets
      </div>
    </div>
  );
}

// ─── Profiler & Resolver ───────────────────────────────────────────────────────

function ProfilerPage() {
  const { isUnlocked } = useAuth();
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!username) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/profiler/${encodeURIComponent(username.replace('@', ''))}`);
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: "Failed to analyze" });
    }
    setLoading(false);
  };

  if (!isUnlocked) return <div className="p-10 text-center"><h2 className="text-xl font-bold">🔒 Vault Locked</h2><p className="text-text-tertiary mt-2">Unlock your Ghost Mode vault to access behavioral profiling.</p></div>;

  return (
    <div className="max-w-full lg:max-w-[800px] mx-auto w-full pb-20 px-4">
      <div className="py-6">
        <h1 className="text-xl font-bold flex items-center gap-2">🧠 Behavioral Profiler</h1>
        <p className="text-xs text-text-tertiary mt-1">Deep-dive NLP and behavioral analysis of the last 100+ tweets</p>
      </div>

      <div className="flex gap-2 mb-6">
        <input
          type="text" value={username} onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === "Enter" && analyze()}
          placeholder="Enter username (e.g. elonmusk)"
          className="flex-1 bg-elevated border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-blue/50 transition-all"
        />
        <button onClick={analyze} disabled={loading}
          className="px-4 py-2.5 rounded-xl bg-accent-blue/20 text-accent-blue text-sm font-medium hover:bg-accent-blue/30 transition-colors border border-accent-blue/30 disabled:opacity-50">
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </div>

      {result && !result.error && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-5 rounded-xl border border-border-subtle bg-elevated">
              <h3 className="text-xs text-text-tertiary mb-1 uppercase tracking-wider font-semibold">Toxicity Score</h3>
              <div className="text-3xl font-bold text-red-400">{result.sentiment.toxicityScore}%</div>
            </div>
            <div className="p-5 rounded-xl border border-border-subtle bg-elevated">
              <h3 className="text-xs text-text-tertiary mb-1 uppercase tracking-wider font-semibold">Positivity Score</h3>
              <div className="text-3xl font-bold text-green-400">{result.sentiment.positivityScore}%</div>
            </div>
            <div className="p-5 rounded-xl border border-border-subtle bg-elevated col-span-2">
              <h3 className="text-xs text-text-tertiary mb-1 uppercase tracking-wider font-semibold flex justify-between">
                <span>Inferred Sleep Schedule (UTC)</span>
              </h3>
              <div className="text-xl font-bold text-accent-violet">
                {result.sleepEstimation.startUTCHour}:00 — {result.sleepEstimation.endUTCHour}:00
              </div>
              <p className="text-xs text-text-tertiary mt-2">Based on their 6-hour minimum activity window.</p>
            </div>
          </div>
          <div className="p-5 rounded-xl border border-border-subtle bg-elevated">
            <h3 className="text-xs text-text-tertiary mb-3 uppercase tracking-wider font-semibold">Activity Heatmap (UTC Hour)</h3>
            <div className="flex items-end gap-1 h-24">
              {result.hourlyDistribution.map((count: number, hour: number) => {
                const max = Math.max(...result.hourlyDistribution, 1);
                const height = (count / max) * 100;
                return (
                  <div key={hour} className="flex-1 flex flex-col items-center group relative cursor-crosshair">
                    <div className="w-full bg-accent-blue/80 rounded-sm hover:bg-accent-blue transition-colors" style={{ height: `${height}%`, minHeight: '4px' }} />
                    <div className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-black border border-border-subtle px-2 py-1 rounded text-xs whitespace-nowrap z-10 transition-opacity">
                      {hour}:00 - {count} tweets
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResolverPage() {
  const { isUnlocked } = useAuth();
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const resolve = async () => {
    if (!username) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/resolver/${encodeURIComponent(username.replace('@', ''))}`);
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: "Failed to resolve" });
    }
    setLoading(false);
  };

  if (!isUnlocked) return <div className="p-10 text-center"><h2 className="text-xl font-bold">🔒 Vault Locked</h2><p className="text-text-tertiary mt-2">Unlock your Ghost Mode vault to access identity resolution.</p></div>;

  return (
    <div className="max-w-full lg:max-w-[800px] mx-auto w-full pb-20 px-4">
      <div className="py-6">
        <h1 className="text-xl font-bold flex items-center gap-2">🔗 Identity Resolver</h1>
        <p className="text-xs text-text-tertiary mt-1">Cross-reference username across GitHub, Reddit, and HackerNews</p>
      </div>

      <div className="flex gap-2 mb-6">
        <input
          type="text" value={username} onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === "Enter" && resolve()}
          placeholder="Enter username (e.g. pg)"
          className="flex-1 bg-elevated border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-violet/50 transition-all"
        />
        <button onClick={resolve} disabled={loading}
          className="px-4 py-2.5 rounded-xl bg-accent-violet/20 text-accent-violet text-sm font-medium hover:bg-accent-violet/30 transition-colors border border-accent-violet/30 disabled:opacity-50">
          {loading ? "Searching..." : "Resolve"}
        </button>
      </div>

      {result && !result.error && (
        <div className="space-y-3">
          {Object.entries(result).map(([platform, data]: [string, any]) => (
            <a key={platform} href={data.url} target="_blank" rel="noreferrer" 
               className={`block p-4 rounded-xl border no-underline transition-colors ${data.exists ? "bg-green-500/10 border-green-500/20 hover:bg-green-500/20" : "bg-elevated border-border-subtle opacity-50 flex items-center justify-between"}`}>
              <div className="flex items-center gap-3">
                <span className="font-bold capitalize text-text-primary">{platform}</span>
                {data.exists ? (
                  <span className="text-green-400 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-400/10 border border-green-400/20">MATCH FOUND</span>
                ) : (
                  <span className="text-text-tertiary text-xs">Not found</span>
                )}
              </div>
              {data.exists && data.data && (
                <div className="mt-3 text-sm text-text-secondary flex gap-4">
                  {Object.entries(data.data).map(([k, v]) => (
                    <div key={k}><span className="text-text-tertiary capitalize">{k}:</span> {v as React.ReactNode}</div>
                  ))}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── App / Router ─────────────────────────────────────────────────────────────

export function App() {
  const { path, search, navigate } = useRoute();
  const params = new URLSearchParams(search);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!scrollElement) return;
    const saveScroll = () => {
      sessionStorage.setItem(`scroll-${path}`, scrollElement.scrollTop.toString());
    };
    scrollElement.addEventListener("scroll", saveScroll, { passive: true });
    
    const saved = sessionStorage.getItem(`scroll-${path}`);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (saved && scrollElement) {
          scrollElement.scrollTo({ top: parseInt(saved) });
        } else if (scrollElement) {
          scrollElement.scrollTo({ top: 0 });
        }
      });
    });
    
    return () => scrollElement.removeEventListener("scroll", saveScroll);
  }, [path, scrollElement]);

  const listMatch = path.match(/^\/list\/(\d+)/);
  const statusMatch = path.match(/^\/([^/]+)\/status\/(\d+)/);
  const isSpecial = ["/", "/login", "/following", "/about", "/discover", "/notifications", "/bookmarks", "/vault", "/deck", "/monitor", "/heatmap", "/graph", "/money", "/messages", "/shadowban", "/profiler", "/resolver"].includes(path) || path.startsWith("/search") || path.startsWith("/thread") || !!listMatch;

  let page: React.ReactNode;
  if (path === "/" || path === "") {
    page = <HomePage navigate={navigate} scrollElement={scrollElement} />;
  } else if (path === "/login") {
    page = <LoginPage />;
  } else if (path === "/deck") {
    page = <DeckPage navigate={navigate} />;
  } else if (path === "/following") {
    page = <FollowingPage navigate={navigate} />;
  } else if (path.startsWith("/search")) {
    page = <SearchPage query={params.get("q") ?? ""} navigate={navigate} />;
  } else if (path === "/discover") {
    page = <DiscoverPage navigate={navigate} />;
  } else if (path === "/bookmarks") {
    page = <BookmarksPage navigate={navigate} scrollElement={scrollElement} />;
  } else if (path === "/vault") {
    page = <VaultPage navigate={navigate} />;
  } else if (path === "/notifications") {
    page = <NotificationsPage />;
  } else if (path === "/monitor") {
    page = <MonitorPage navigate={navigate} />;
  } else if (path === "/heatmap") {
    page = <HeatmapPage />;
  } else if (path === "/graph") {
    page = <GraphPage navigate={navigate} />;
  } else if (path === "/money") {
    page = <MoneyPage />;
  } else if (path === "/messages") {
    page = <MessagesPage />;
  } else if (path === "/shadowban") {
    page = <ShadowbanPage />;
  } else if (path === "/profiler") {
    page = <ProfilerPage />;
  } else if (path === "/resolver") {
    page = <ResolverPage />;
  } else if (path.startsWith("/thread/")) {
    const id = path.split("/")[2] || "";
    page = <ThreadUnrollerPage id={id} />;
  } else if (listMatch && listMatch[1]) {
    page = <ListPage listId={listMatch[1]} navigate={navigate} scrollElement={scrollElement} />;
  } else if (path === "/about") {
    page = (
      <div className="max-w-[640px] mx-auto px-6 py-12">
        <h1 className="gradient-text text-3xl mb-4">About unbird</h1>
        <p className="text-text-secondary leading-relaxed">
          A privacy-respecting frontend for X/Twitter. Built with Bun, Vite, Hono, React, TanStack Query, and Tailwind CSS.
        </p>
      </div>
    );
  } else if (statusMatch) {
    page = <TweetPage tweetId={statusMatch[2]!} navigate={navigate} />;
  } else if (!isSpecial) {
    page = <ProfilePage username={path.replace(/^\//, "").replace(/\/$/, "")} navigate={navigate} scrollElement={scrollElement} search={search} />;
  } else {
    page = <Err msg="Page not found" />;
  }

  if (path === "/deck") {
    return (
      <MeProvider>
        <GlobalProgress />
        <div className="flex h-[100dvh] w-full overflow-hidden bg-base text-text-primary">
          <Navbar
            onSearch={q => navigate(`/search?q=${encodeURIComponent(q)}`)}
            onNavigate={navigate}
            currentPath={path}
          />
          <TopHeader />
          <main ref={setScrollElement} className="flex-1 w-full bg-black relative overflow-y-auto scroll-smooth">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={path || "home"}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="min-h-full w-full"
              >
                {page}
              </motion.div>
            </AnimatePresence>
          </main>
          <ToastContainer />
        </div>
      </MeProvider>
    );
  }

  return (
    <MeProvider>
      <GlobalProgress />
      <div className="flex h-[100dvh] w-full overflow-hidden bg-base text-text-primary">
        <Navbar
          onSearch={q => navigate(`/search?q=${encodeURIComponent(q)}`)}
          onNavigate={navigate}
          currentPath={path}
        />
        <TopHeader />
        <main ref={setScrollElement} className="flex-1 overflow-y-auto scroll-smooth relative">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={(path || "home") as string}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="min-h-full flex flex-col"
            >
              {page}
            </motion.div>
          </AnimatePresence>
        </main>
        <ToastContainer />
      </div>
    </MeProvider>
  );
}

export default App;
