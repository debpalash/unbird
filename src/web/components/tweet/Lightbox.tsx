import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FastAverageColor } from "fast-average-color";
import type { Media } from "../../../server/types";
import { MediaKind } from "../../../server/types";

function getMediaUrl(url: string, hires = false): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  const targetUrl = `https://pbs.twimg.com/${url}?format=webp&name=${hires ? "large" : "medium"}`;
  return `/api/image?url=${encodeURIComponent(targetUrl)}`;
}

interface LightboxProps {
  media: Media[];
  initialIndex: number;
  onClose: () => void;
}

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) => Math.abs(offset) * velocity;

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 800 : -800, opacity: 0 }),
  center: { zIndex: 1, x: 0, opacity: 1 },
  exit: (dir: number) => ({ zIndex: 0, x: dir < 0 ? 800 : -800, opacity: 0 }),
};

export function Lightbox({ media, initialIndex, onClose }: LightboxProps) {
  const [[page, dir], setPage] = useState([initialIndex, 0]);
  const [bgColor, setBgColor] = useState("rgba(0,0,0,0.95)");
  const fac = useMemo(() => new FastAverageColor(), []);

  // Sync index clamping
  const index = Math.max(0, Math.min(page, media.length - 1));
  const current = media[index];

  const paginate = (newDir: number) => {
    const next = page + newDir;
    if (next >= 0 && next < media.length) {
      setPage([next, newDir]);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") paginate(1);
      if (e.key === "ArrowLeft") paginate(-1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [page, media.length, onClose]);

  // Extract color
  useEffect(() => {
    if (!current) return;
    if (current.kind === MediaKind.Photo) {
      const imgUrl = getMediaUrl((current as any).photo.url, false);
      fac.getColorAsync(imgUrl, { crossOrigin: "anonymous" })
        .then(color => {
          setBgColor(color.rgba.replace(", 1)", ", 0.95)"));
        })
        .catch(() => setBgColor("rgba(0,0,0,0.95)"));
    } else {
      setBgColor("rgba(0,0,0,0.95)");
    }
  }, [current, fac]);

  if (!current) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, backgroundColor: bgColor }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-xl"
    >
      <button 
        onClick={onClose}
        className="absolute top-6 left-6 z-50 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>

      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={page}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ x: { type: "spring", stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
            drag="y" // allow swipe to dismiss vertically
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={1}
            onDragEnd={(e, { offset, velocity }) => {
              const swipe = swipePower(offset.y, velocity.y);
              if (swipe > swipeConfidenceThreshold || Math.abs(offset.y) > 150) {
                onClose();
              }
            }}
            className="absolute w-full h-full flex items-center justify-center p-4 cursor-grab active:cursor-grabbing"
          >
            {current.kind === MediaKind.Photo ? (
              <img 
                src={getMediaUrl((current as any).photo.url, true)}
                alt="Fullscreen Media"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                draggable={false}
                onDoubleClick={onClose}
              />
            ) : (
              <video 
                src={(current as any).video?.variants?.[0]?.url || (current as any).video?.url || `/api/video?url=${encodeURIComponent((current as any).gif?.url || "")}`}
                controls
                autoPlay
                loop
                crossOrigin="anonymous"
                className="max-w-full max-h-[90vh] rounded-lg shadow-2xl outline-none"
              />
            )}
          </motion.div>
        </AnimatePresence>

        {media.length > 1 && (
          <>
            {index > 0 && (
              <button onClick={(e) => { e.stopPropagation(); paginate(-1); }} className="absolute left-6 z-40 p-3 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors hidden md:block">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
            )}
            {index < media.length - 1 && (
              <button onClick={(e) => { e.stopPropagation(); paginate(1); }} className="absolute right-6 z-40 p-3 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors hidden md:block">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            )}
            
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 z-40 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full">
              {media.map((_, i) => (
                <button 
                  key={i} 
                  onClick={(e) => { e.stopPropagation(); setPage([i, i > index ? 1 : -1]); }}
                  className={`w-2 h-2 rounded-full transition-all ${i === index ? "bg-white w-4" : "bg-white/50 hover:bg-white/80"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
