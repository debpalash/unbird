import { motion } from "framer-motion";
import { useState, useEffect, useRef, useMemo } from "react";
import type { Tweet } from "../../../server/types";
import { MediaViewer } from "./TweetCard";

function getPicUrl(url: string): string {
  if (!url) return "";
  const target = url.startsWith("http") ? url : `https://pbs.twimg.com/${url}`;
  return `/api/image?url=${encodeURIComponent(target)}`;
}

function getShortDate(dStr: string | number | Date) {
  const d = new Date(dStr);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function ReaderView({ tweets, author, onClose }: { tweets: Tweet[], author: any, onClose: () => void }) {
  const [readProgress, setReadProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const articleRef = useRef<HTMLDivElement>(null);

  // Compute word count and read time
  const { wordCount, readTime } = useMemo(() => {
    const allText = tweets.map(t => t.text ? stripHtml(t.text) : "").join(" ");
    const words = allText.split(/\s+/).filter(Boolean).length;
    return { wordCount: words, readTime: Math.max(1, Math.ceil(words / 200)) };
  }, [tweets]);

  // Reading progress bar
  useEffect(() => {
    const container = articleRef.current?.closest(".fixed");
    if (!container) return;
    const scrollEl = container as HTMLElement;
    const handler = () => {
      const scrollTop = scrollEl.scrollTop;
      const scrollHeight = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (scrollHeight > 0) {
        setReadProgress(Math.min((scrollTop / scrollHeight) * 100, 100));
      }
    };
    scrollEl.addEventListener("scroll", handler, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handler);
  }, []);

  // Copy thread as plain text
  const copyThread = async () => {
    const text = tweets
      .map((t, i) => {
        const body = t.text ? stripHtml(t.text) : "";
        return `${i + 1}/${tweets.length}\n${body}`;
      })
      .join("\n\n---\n\n");
    const header = `🧵 Thread by @${author.username} · ${getShortDate(tweets[0]?.time || Date.now())}\n\n`;
    await navigator.clipboard.writeText(header + text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (tweets.length === 0) return null;
  const firstTweet = tweets[0];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 bg-base overflow-y-auto"
    >
      {/* Reading progress bar */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 60,
        background: "rgba(255,255,255,0.08)",
      }}>
        <div style={{
          height: "100%",
          width: `${readProgress}%`,
          background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
          transition: "width 100ms ease-out",
        }} />
      </div>

      <div ref={articleRef} className="max-w-[700px] mx-auto px-6 py-12 md:py-20 relative min-h-screen">
        
        {/* Sticky Header */}
        <div className="sticky top-0 -mt-12 md:-mt-20 pt-6 pb-6 bg-base/90 backdrop-blur-xl z-20 flex justify-between items-center mb-12 border-b border-border-subtle/20">
          <button 
            onClick={onClose}
            className="flex items-center justify-center p-2.5 rounded-full hover:bg-hover active:bg-border-subtle transition-colors text-text-secondary"
            title="Exit Reader Mode"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>

          <div className="flex items-center gap-3">
            {/* Copy thread button */}
            <button
              onClick={copyThread}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-hover hover:bg-border-subtle transition-colors text-text-secondary"
              title="Copy thread as text"
            >
              {copied ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  Copy
                </>
              )}
            </button>
            
            <div className="text-xs uppercase tracking-widest font-bold text-text-tertiary">
              Reader Mode
            </div>
          </div>
        </div>

        {/* Article Header */}
        <header className="mb-12">
          <div className="flex items-center gap-4 mb-6">
            <img src={getPicUrl(author.userPic)} alt={author.fullname} className="w-14 h-14 rounded-full object-cover shadow-sm border border-border-subtle/30" />
            <div>
              <h1 className="text-xl font-bold text-text-primary">{author.fullname}</h1>
              <div className="text-sm text-text-tertiary font-medium">@{author.username} · {getShortDate(firstTweet!.time)}</div>
            </div>
          </div>
          {/* Read stats */}
          <div className="flex items-center gap-4 text-xs text-text-tertiary font-medium">
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              {wordCount.toLocaleString()} words
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              {readTime} min read
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              {tweets.length} tweets in thread
            </span>
          </div>
        </header>

        {/* Article Body */}
        <article className="prose prose-invert prose-lg md:prose-xl max-w-none text-text-secondary">
          {tweets.map((t, i) => (
            <div key={t.id || i} className="mb-8 last:mb-0">
              {t.text && (
                <div 
                  className="font-serif leading-relaxed text-[18px] md:text-[21px] text-text-primary space-y-6 opacity-95"
                >
                  {stripHtml(t.text)}
                </div>
              )}
              {t.media && t.media.length > 0 && (
                <div className="my-10 -mx-4 sm:mx-0 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10">
                  <MediaViewer media={t.media} />
                </div>
              )}
              {/* Thread divider between tweets */}
              {i < tweets.length - 1 && (
                <div className="flex items-center justify-center my-8 opacity-30">
                  <div className="w-1 h-8 rounded-full bg-text-tertiary" />
                </div>
              )}
            </div>
          ))}
        </article>

        {/* Article Footer */}
        <footer className="mt-20 pt-10 border-t border-border-subtle/20 flex flex-col items-center justify-center text-center opacity-60">
          <div className="w-12 h-12 rounded-full bg-border-subtle/30 flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
            </svg>
          </div>
          <p className="text-sm font-medium">End of Thread</p>
          <p className="text-xs text-text-tertiary mt-1">{wordCount.toLocaleString()} words · {readTime} min read</p>
        </footer>

      </div>
    </motion.div>
  );
}
