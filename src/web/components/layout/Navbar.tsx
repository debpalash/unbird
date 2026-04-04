import { useState, type FormEvent } from "react";
import { Home, Search, Users, Info, Bell, Bookmark, Compass, List as ListIcon, LayoutGrid, Radio, BarChart3, Share2, DollarSign, BrainCircuit, Link as LinkIcon, MessageSquare, AlertTriangle, Archive } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";

interface NavbarProps {
  onSearch?: (query: string) => void;
  onNavigate?: (to: string) => void;
  currentPath?: string;
}

export function Navbar({ onSearch, onNavigate, currentPath = "/" }: NavbarProps) {
  const [query, setQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { isUnlocked } = useAuth();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim() && onSearch) {
      onSearch(query.trim());
      setIsSearchOpen(false);
    }
  };

  const navLink = (href: string, title: string, Icon: any) => {
    const active = href === "/" ? currentPath === "/" : currentPath.startsWith(href);
    return (
      <motion.button
        key={href}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => {
          setIsSearchOpen(false);
          onNavigate?.(href);
        }}
        title={title}
        className={`p-2.5 rounded-xl transition-all duration-200 cursor-pointer border-0 bg-transparent flex items-center justify-center ${
          active ? "text-text-primary bg-elevated/80 shadow-sm ring-1 ring-border-subtle/40" : "text-text-tertiary hover:text-text-secondary hover:bg-hover/50"
        }`}
      >
        <Icon size={22} strokeWidth={active ? 2.5 : 1.75} />
      </motion.button>
    );
  };

  return (
    <>
      <nav className="fixed bottom-0 w-full sm:static sm:w-18 sm:h-screen shrink-0 border-t sm:border-t-0 sm:border-r border-border-subtle/30 z-50 flex sm:flex-col items-center justify-around sm:justify-start sm:py-5 px-1 sm:px-0 bg-base/95 backdrop-blur-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.4)] sm:shadow-none">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onNavigate?.("/")}
          className="hidden sm:flex flex-col items-center justify-center mb-10 bg-transparent border-0 cursor-pointer p-0 group"
          title="Home"
        >
          <img src="/logo.svg" alt="unbird Logo" className="w-12 h-12 rounded-2xl shadow-lg ring-1 ring-border-subtle/50 group-hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all duration-300" />
        </motion.button>

        <div className="flex sm:flex-col w-full sm:w-auto items-center justify-around sm:gap-1.5 flex-1 sm:flex-none py-1.5 sm:py-0 overflow-x-auto no-scrollbar px-1 sm:px-0">
          {navLink("/", "Home", Home)}
          {navLink("/discover", "Discover", Compass)}
          {isUnlocked && navLink("/deck", "Deck", LayoutGrid)}
          {isUnlocked && navLink("/notifications", "Notifications", Bell)}
          <motion.button
            whileHover={{ scale: 1.15, y: -2 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            title="Search"
            className={`p-3 rounded-xl transition-colors duration-300 cursor-pointer border-0 bg-transparent flex items-center justify-center ${
              isSearchOpen || currentPath.startsWith("/search") ? "text-text-primary bg-elevated shadow-sm ring-1 ring-border-subtle/50" : "text-text-tertiary hover:text-text-primary hover:bg-hover"
            }`}
          >
            <Search size={24} strokeWidth={isSearchOpen || currentPath.startsWith("/search") ? 2.5 : 2} />
          </motion.button>
          
          {isUnlocked && navLink("/bookmarks", "Bookmarks", Bookmark)}
          {navLink("/vault", "Vault", Archive)}
          
          {isUnlocked && (
            <>
              {navLink("/monitor", "Keyword Monitor", Radio)}
              {navLink("/heatmap", "Heatmap", BarChart3)}
              {navLink("/graph", "Social Graph", Share2)}
              {navLink("/money", "Monetization", DollarSign)}
              {navLink("/profiler", "Behavioral Profiler", BrainCircuit)}
              {navLink("/resolver", "Identity Resolver", LinkIcon)}
              {navLink("/messages", "Messages", MessageSquare)}
              {navLink("/shadowban", "Shadowban Check", AlertTriangle)}
              {navLink("/following", "Following", Users)}
            </>
          )}
        </div>
      </nav>

      {/* Slide-out search panel */}
      <div 
        className={`fixed top-0 left-0 sm:left-18 w-full sm:w-80 h-auto sm:h-screen bg-elevated/95 backdrop-blur-3xl z-40 border-b sm:border-b-0 sm:border-r border-border-subtle/30 shadow-2xl transition-transform duration-300 transform ${
          isSearchOpen ? "translate-y-0 sm:translate-x-0" : "-translate-y-full sm:translate-y-0 sm:-translate-x-full"
        }`}
      >
        <div className="p-6 pt-12 sm:pt-6">
          <h3 className="text-xl font-bold text-text-primary mb-4">Search</h3>
          <form onSubmit={handleSubmit} className="relative w-full">
            <input
              type="text"
              autoFocus={isSearchOpen}
              className="w-full py-3 px-12 text-sm text-text-primary bg-surface border border-border-subtle/50 rounded-2xl outline-none transition-all duration-300 placeholder:text-text-tertiary focus:border-accent-blue focus:ring-4 focus:ring-accent-blue/15 focus:bg-elevated shadow-inner"
              placeholder="Search users, tweets..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary" size={18} />
          </form>
          <button 
            onClick={() => setIsSearchOpen(false)}
            className="sm:hidden absolute top-4 right-4 p-2 text-text-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
