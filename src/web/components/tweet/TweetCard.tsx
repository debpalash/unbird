import type { Tweet, Media } from "../../../server/types";
import { MediaKind, VerifiedType } from "../../../server/types";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Lightbox } from "./Lightbox";
import { showToast } from "../../../App";

function AnimatedNumber({ value }: { value: number }) {
  const [prev, setPrev] = useState(value);
  const [direction, setDirection] = useState(1);
  useEffect(() => {
    if (value !== prev) {
      setDirection(value > prev ? 1 : -1);
      setPrev(value);
    }
  }, [value, prev]);

  return (
    <span className="relative inline-flex overflow-hidden h-4 items-center">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: direction * 15, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -direction * 15, opacity: 0 }}
          transition={{ duration: 0.25, type: "spring", stiffness: 300, damping: 25 }}
        >
          {formatCount(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

interface TweetCardProps {
  tweet: Tweet;
  isQuote?: boolean;
  onClick?: () => void;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n > 0 ? String(n) : "";
}

function getShortTime(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (now.getFullYear() !== d.getFullYear()) return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  if (diffHours >= 24) return `${months[d.getMonth()]} ${d.getDate()}`;
  if (diffHours >= 1) return `${diffHours}h`;
  if (diffMins >= 1) return `${diffMins}m`;
  return "now";
}

function getPicUrl(url: string): string {
  if (!url) return "";
  const targetUrl = url.startsWith("http") ? url : `https://pbs.twimg.com/${url}`;
  return `/api/image?url=${encodeURIComponent(targetUrl)}`;
}

function getMediaUrl(url: string): string {
  if (!url) return "";
  const targetUrl = url.startsWith("http") ? url : `https://pbs.twimg.com/${url}?format=webp&name=medium`;
  return `/api/image?url=${encodeURIComponent(targetUrl)}`;
}

function VerifiedBadge({ type }: { type: VerifiedType }) {
  if (type === VerifiedType.None) return null;
  const color = type === VerifiedType.Blue ? "text-accent-blue" : type === VerifiedType.Business ? "text-amber-400" : "text-gray-400";
  return (
    <svg className={`w-4 h-4 ${color} inline-block ml-1`} viewBox="0 0 22 22" fill="currentColor">
      <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.69-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.636.433 1.221.878 1.69.47.446 1.055.752 1.69.883.635.13 1.294.083 1.902-.143.272.587.702 1.087 1.24 1.44s1.167.551 1.813.568c.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.225 1.261.272 1.893.143.636-.13 1.22-.436 1.69-.883.445-.468.749-1.053.882-1.688.13-.634.085-1.29-.138-1.896.587-.274 1.084-.705 1.438-1.246.355-.54.552-1.17.57-1.817zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
    </svg>
  );
}

import { useRef } from "react";

function SmartVideo({ media }: { media: { kind: MediaKind.Video | MediaKind.Gif; video?: any; gif?: any } }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;
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
  }, []);

  let src = "";
  let poster = "";
  if (media.kind === MediaKind.Video && media.video) {
    const mp4s = media.video.variants?.filter((v: any) => v.contentType === "video/mp4") || [];
    mp4s.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    src = mp4s.length > 0 ? mp4s[0].url : media.video.url;
    src = `/api/video?url=${encodeURIComponent(src)}`;
    poster = getMediaUrl(media.video.thumb);
  } else if (media.kind === MediaKind.Gif && media.gif) {
    src = media.gif.url;
    src = `/api/video?url=${encodeURIComponent(src)}`;
    poster = getMediaUrl(media.gif.thumb);
  }

  if (!src) return null;

  return (
    <div 
      className="relative w-full rounded-lg overflow-hidden bg-base group shrink-0"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <video 
        ref={videoRef}
        src={src}
        poster={poster}
        crossOrigin="anonymous"
        preload="metadata"
        loop muted playsInline
        controls={isHovered}
        className={`w-full h-auto max-h-[80vh] object-cover transition-opacity duration-500 ${isPlaying ? "opacity-100" : "opacity-90"}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (videoRef.current) {
            videoRef.current.muted = !videoRef.current.muted;
          }
        }}
      />
      {!isHovered && (
        <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-md font-medium pointer-events-none shadow-lg">
          {media.kind === MediaKind.Gif ? "GIF" : "VIDEO"}
        </div>
      )}
      {isHovered && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (document.pictureInPictureElement) document.exitPictureInPicture();
            else videoRef.current?.requestPictureInPicture();
          }}
          className="absolute top-3 right-3 bg-black/60 hover:bg-black/90 text-white p-2 rounded-full backdrop-blur-md transition-all border-0 cursor-pointer shadow-lg group-hover:opacity-100 opacity-0 z-20"
          title="Picture in Picture"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <rect x="12" y="14" width="7" height="5" rx="1" ry="1"></rect>
          </svg>
        </button>
      )}
      <div 
        className="absolute inset-0 z-10 cursor-pointer" 
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
      />
    </div>
  );
}

export function MediaViewer({ media }: { media: Media[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (media.length === 0) return null;

  const photos = media.filter(m => m.kind === MediaKind.Photo);
  const videos = media.filter(m => m.kind !== MediaKind.Photo);

  // Grid class based on photo count
  const gridClass = photos.length === 2
    ? "grid grid-cols-2 gap-0.5"
    : photos.length === 3
    ? "grid grid-cols-2 grid-rows-2 gap-0.5"
    : photos.length >= 4
    ? "grid grid-cols-2 grid-rows-2 gap-0.5"
    : "";

  return (
    <>
      {/* Photo grid */}
      {photos.length > 0 && (
        <div className={`mt-3 rounded-lg overflow-hidden ${gridClass}`}
             style={photos.length > 1 ? { maxHeight: '520px' } : undefined}>
          {photos.slice(0, 4).map((m, i) => {
            const mediaIdx = media.indexOf(m);
            return (
              <FadeImage
                key={i}
                src={getMediaUrl(m.photo.url)}
                alt={m.photo.altText || "Media"}
                className={`w-full object-cover cursor-pointer hover:opacity-90 transition-opacity ${
                  photos.length === 1 ? "h-auto max-h-[85vh] rounded-lg" :
                  photos.length === 3 && i === 0 ? "row-span-2 h-full" :
                  "h-full"
                }`}
                style={photos.length > 1 ? { minHeight: '140px', maxHeight: photos.length === 1 ? '85vh' : '260px' } : { maxHeight: '85vh' }}
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setLightboxIndex(mediaIdx); }}
              />
            );
          })}
        </div>
      )}

      {/* Videos */}
      {videos.map((m, i) => {
        const mediaIdx = media.indexOf(m);
        return (
          <div key={`v-${i}`} className="mt-3 rounded-lg overflow-hidden cursor-pointer" onClick={(e) => { e.stopPropagation(); setLightboxIndex(mediaIdx); }}>
            <SmartVideo media={m as any} />
          </div>
        );
      })}

      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox 
            media={media} 
            initialIndex={lightboxIndex} 
            onClose={() => setLightboxIndex(null)} 
          />
        )}
      </AnimatePresence>
    </>
  );
}

/** Image with fade-in on load */
function FadeImage({ src, alt, className, style, onClick }: {
  src: string; alt: string; className?: string; style?: React.CSSProperties; onClick?: (e: React.MouseEvent) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      className={`${className} transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      style={style}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      onClick={onClick}
    />
  );
}

function PollDisplay({ poll }: { poll: NonNullable<Tweet["poll"]> }) {
  const total = poll.votes || 1;
  return (
    <div className="mt-3">
      {poll.options.map((opt, i) => {
        const pct = Math.round((poll.values[i]! / total) * 100);
        return (
          <div key={i} className="relative py-2.5 px-3.5 mb-1.5 rounded-sm overflow-hidden text-sm">
            <div className={`absolute inset-0 rounded-sm transition-all duration-500 ${i === poll.leader ? "bg-accent-blue/20" : "bg-accent-blue/10"}`} style={{ width: `${pct}%` }} />
            <div className="relative z-1 flex justify-between text-text-primary">
              <span>{opt}</span>
              <span className="font-semibold text-text-secondary">{pct}%</span>
            </div>
          </div>
        );
      })}
      <div className="flex gap-2 mt-2 text-xs text-text-tertiary">
        <span>{formatCount(poll.votes)} votes</span>
        <span>·</span>
        <span>{poll.status}</span>
      </div>
    </div>
  );
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Tweet[]>([]);
  useEffect(() => {
    try { setBookmarks(JSON.parse(localStorage.getItem("bookmarks") || "[]")); } catch {}
  }, []);
  const toggleBookmark = (t: Tweet) => {
    const isBookmarked = bookmarks.some(b => b.id === t.id);
    const next = isBookmarked ? bookmarks.filter(b => b.id !== t.id) : [t, ...bookmarks];
    setBookmarks(next);
    localStorage.setItem("bookmarks", JSON.stringify(next));
  };
  return { bookmarks, toggleBookmark };
}

function TweetText({ text }: { text: string }) {
  if (!text) return null;
  // Split by URLs, @mentions, #hashtags, and newlines
  const parts = text.split(/(https?:\/\/[^\s]+|@[a-zA-Z0-9_]{1,15}|#[a-zA-Z0-9_]+|\n)/g);

  const navigate = (to: string) => {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new Event("popstate"));
  };
  
  return (
    <div className="text-[15px] leading-[1.45] text-text-primary mt-1.5 wrap-break-word whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part === '\n') return <br key={i} />;
        if (part.startsWith('http')) {
          return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline" onClick={e => e.stopPropagation()}>{part}</a>;
        }
        if (part.startsWith('@')) {
          const handler = part.slice(1);
          return <a key={i} href={`/${handler}`} className="text-accent-blue hover:underline" onClick={e => { e.preventDefault(); e.stopPropagation(); navigate(`/${handler}`); }}>{part}</a>;
        }
        if (part.startsWith('#')) {
          const tag = part.slice(1);
          return <a key={i} href={`/search?q=${encodeURIComponent('#'+tag)}`} className="text-accent-blue hover:underline" onClick={e => { e.preventDefault(); e.stopPropagation(); navigate(`/search?q=${encodeURIComponent('#'+tag)}`); }}>{part}</a>;
        }
        // Properly escape html entities since we are rendering as React nodes
        return <span key={i}>{part.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')}</span>;
      })}
    </div>
  );
}

export function TweetCard({ tweet, isQuote, onClick }: TweetCardProps) {
  if (!tweet.available && !tweet.text) return null;

  const { bookmarks, toggleBookmark } = useBookmarks();
  const isBookmarked = bookmarks.some(b => b.id === tweet.id);

  const displayTweet = tweet.retweet ?? tweet;
  const isRetweet = !!tweet.retweet;

  const toggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    fetch(`/api/like/${tweet.id}`, { method: 'POST' });
  };
  
  const toggleRetweet = async (e: React.MouseEvent) => {
    e.stopPropagation();
    fetch(`/api/retweet/${tweet.id}`, { method: 'POST' });
  };

  const avatarUrl = getPicUrl(displayTweet.user.userPic);
  const wrapperClass = isQuote
    ? "glass-card p-3 mb-2 text-sm"
    : "py-3 px-4 group hover:bg-hover/60 transition-colors duration-200 relative isolate before:content-[''] before:absolute before:inset-x-4 before:bottom-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-border-subtle/30 before:to-transparent";

  return (
    <motion.article 
      layout="position"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={wrapperClass} 
      onClick={onClick} 
      style={{ cursor: onClick ? "pointer" : undefined }}
    >
      {isRetweet && (
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary mb-1.5 ml-13">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="opacity-60">
            <path d="M4.75 3.79l4.603 4.3-1.706 1.82L6 8.38v7.37c0 .97.784 1.75 1.75 1.75H13V19.5H7.75c-2.347 0-4.25-1.9-4.25-4.25V8.38L1.853 9.91.147 8.09l4.603-4.3zm11.5 2.71H11V4.5h5.25c2.347 0 4.25 1.9 4.25 4.25v7.37l1.647-1.53 1.706 1.82-4.603 4.3-4.603-4.3 1.706-1.82L18 16.12V8.75c0-.97-.784-1.75-1.75-1.75z" />
          </svg>
          <span>{tweet.user.fullname || tweet.user.username} retweeted</span>
        </div>
      )}

      <div className="flex items-start gap-3">
        {avatarUrl && (
          <a href={`/${displayTweet.user.username}`} onClick={(e) => e.stopPropagation()} className="mt-0.5 shrink-0">
            <img src={avatarUrl} alt={displayTweet.user.username}
                 className="w-10 h-10 rounded-full object-cover ring-1 ring-border-subtle/50 ring-offset-1 ring-offset-base hover:ring-accent-blue/50 hover:shadow-[0_0_16px_rgba(29,155,240,0.2)] transition-all duration-300" />
          </a>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1 flex-wrap leading-tight">
            <a href={`/${displayTweet.user.username}`} className="font-semibold text-[15px] text-text-primary no-underline hover:underline" onClick={(e) => e.stopPropagation()} style={{ textUnderlineOffset: '2px' }}>
              {displayTweet.user.fullname || displayTweet.user.username}
            </a>
            <VerifiedBadge type={displayTweet.user.verifiedType} />
            <span className="text-[13px] text-text-tertiary truncate">@{displayTweet.user.username}</span>
            <span className="text-[13px] text-text-tertiary/60 ml-auto whitespace-nowrap">·&thinsp;{getShortTime(displayTweet.time)}</span>
          </div>

          {displayTweet.reply.length > 0 && (
            <div className="text-xs text-text-tertiary mt-0.5">
              Replying to {displayTweet.reply.map((r, i) => (
                <span key={i}><a href={`/${r}`} className="text-accent-blue" onClick={(e) => e.stopPropagation()}>@{r}</a>{i < displayTweet.reply.length - 1 ? " " : ""}</span>
              ))}
            </div>
          )}

          {displayTweet.text && <TweetText text={displayTweet.text} />}

          {displayTweet.media.length > 0 && <MediaViewer media={displayTweet.media} />}
          {displayTweet.poll && <PollDisplay poll={displayTweet.poll} />}

          {displayTweet.quote && displayTweet.quote.available && (
            <div className="mt-2.5 cursor-pointer" onClick={(e) => e.stopPropagation()}>
              <TweetCard tweet={displayTweet.quote} isQuote />
            </div>
          )}

          {!isQuote && (
            <div className="flex gap-6 mt-2.5 text-text-tertiary text-[13px] opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <span className="flex items-center gap-1.5 cursor-pointer hover:text-accent-blue transition-colors group/btn">
                <svg className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1.751 10c0-4.42 3.58-8 8-8h4.5c4.42 0 8 3.58 8 8v4.5c0 4.42-3.58 8-8 8h-12.75l3.659-3.635C3.19 16.713 1.751 13.542 1.751 10z" /></svg>
                <AnimatedNumber value={displayTweet.stats.replies} />
              </span>
              <span className="flex items-center gap-1.5 cursor-pointer hover:text-accent-emerald transition-colors group/btn" onClick={toggleRetweet}>
                <svg className="w-4 h-4 group-hover/btn:-translate-y-0.5 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z" /></svg>
                <AnimatedNumber value={displayTweet.stats.retweets} />
              </span>
              <span className="flex items-center gap-1.5 cursor-pointer hover:text-accent-rose transition-colors group/btn" onClick={toggleLike}>
                <svg className="w-4 h-4 group-hover/btn:scale-110 group-hover/btn:fill-accent-rose transition-all duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z" /></svg>
                <AnimatedNumber value={displayTweet.stats.likes} />
              </span>
              <span 
                className={`flex items-center gap-1.5 cursor-pointer hover:text-accent-blue transition-colors group/btn ${isBookmarked ? "text-accent-blue" : ""}`}
                onClick={(e) => { e.stopPropagation(); toggleBookmark(tweet); }}
              >
                <svg className={`w-4 h-4 transition-all duration-300 ${isBookmarked ? "fill-accent-blue pt-0" : "group-hover/btn:scale-110"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z" />
                </svg>
                {displayTweet.stats.views > 0 && <AnimatedNumber value={displayTweet.stats.views} />}
              </span>
              <a 
                href={`/thread/${displayTweet.id}`}
                className="flex items-center gap-1.5 cursor-pointer hover:text-accent-violet transition-colors group/btn ml-auto no-underline text-text-tertiary"
                onClick={(e) => e.stopPropagation()}
                title="Read Thread"
              >
                <svg className="w-4 h-4 group-hover/btn:-translate-y-0.5 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </a>
              <span
                className="flex items-center gap-1.5 cursor-pointer hover:text-accent-emerald transition-colors group/btn"
                onClick={async (e) => {
                  e.stopPropagation();
                  const el = e.currentTarget;
                  try {
                    const res = await fetch("/api/vault", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: tweet.id, data: tweet }),
                    });
                    if (res.ok) {
                      el.querySelector("svg")?.classList.add("fill-accent-emerald");
                      showToast("Saved to Vault", "success");
                    }
                  } catch {}
                }}
                title="Save to Vault"
              >
                <svg className="w-4 h-4 group-hover/btn:scale-110 transition-all duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}
