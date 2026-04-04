import { useState, useRef, useEffect } from "react";
import { useTheme, type ThemeInfo } from "../../context/ThemeContext";
import { motion, AnimatePresence } from "framer-motion";

export function ThemeSwitcher() {
  const { theme, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const currentTheme = themes.find((t: ThemeInfo) => t.id === theme)!;

  return (
    <div ref={panelRef} className="relative">
      {/* Trigger Button */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen(o => !o)}
        title="Switch Theme"
        className={`p-2.5 rounded-xl transition-all duration-200 cursor-pointer border-0 bg-transparent flex items-center justify-center ${
          open
            ? "text-text-primary bg-elevated/80 shadow-sm ring-1 ring-border-subtle/40"
            : "text-text-tertiary hover:text-text-secondary hover:bg-hover/50"
        }`}
      >
        {/* Palette icon */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
        </svg>
      </motion.button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -8 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="absolute left-full ml-3 bottom-0 sm:left-auto sm:bottom-auto sm:top-0 sm:ml-3 w-64 bg-elevated/95 backdrop-blur-2xl border border-border-subtle/50 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] z-100 overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 pt-4 pb-2">
              <div className="text-xs font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
                  <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
                  <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
                  <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
                </svg>
                Theme
              </div>
            </div>

            {/* Theme Options */}
            <div className="px-2 pb-3 flex flex-col gap-1">
              {themes.map((t: ThemeInfo) => (
                <ThemeOption
                  key={t.id}
                  theme={t}
                  isActive={theme === t.id}
                  onClick={() => {
                    setTheme(t.id);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ThemeOption({
  theme,
  isActive,
  onClick,
}: {
  theme: ThemeInfo;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02, x: 2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-0 cursor-pointer transition-all duration-200 text-left ${
        isActive
          ? "bg-hover/80 ring-1 ring-border-medium"
          : "bg-transparent hover:bg-hover/40"
      }`}
    >
      {/* Color Preview Swatches */}
      <div
        className="w-9 h-9 rounded-lg shrink-0 relative overflow-hidden shadow-inner"
        style={{ background: theme.bg, border: `1px solid ${theme.accent}30` }}
      >
        {/* Three-dot swatch */}
        <div className="absolute inset-0 flex items-center justify-center gap-0.75">
          <div
            className="w-1.75 h-1.75 rounded-full"
            style={{ background: theme.accent }}
          />
          <div
            className="w-1.75 h-1.75 rounded-full"
            style={{ background: theme.fg, opacity: 0.7 }}
          />
          <div
            className="w-1.75 h-1.75 rounded-full"
            style={{ background: theme.accent, opacity: 0.5 }}
          />
        </div>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text-primary truncate">
          {theme.name}
        </div>
        <div className="text-[11px] text-text-tertiary truncate leading-tight">
          {theme.description}
        </div>
      </div>

      {/* Active Indicator */}
      {isActive && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
          style={{ background: theme.accent }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </motion.div>
      )}
    </motion.button>
  );
}
