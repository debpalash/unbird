import { useAuth } from "../../context/AuthContext";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { Lock, Unlock } from "lucide-react";
import { motion } from "framer-motion";

export function TopHeader() {
  const { isUnlocked, hasStoredSession, logout } = useAuth();
  
  const navToLogin = () => {
    window.history.pushState({}, "", "/login");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="fixed top-0 right-0 p-4 z-50 flex items-center justify-end gap-3 pointer-events-none">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 bg-elevated/80 backdrop-blur-xl border border-border-subtle p-2 rounded-2xl shadow-xl pointer-events-auto"
      >
        <ThemeSwitcher />
        <div className="w-px h-6 bg-border-subtle" />
        <button
          onClick={() => {
            if (isUnlocked) logout();
            else navToLogin();
          }}
          title={isUnlocked ? "Lock Vault (Log out)" : hasStoredSession ? "Unlock Vault" : "Login Securely"}
          className={`px-4 py-2 rounded-xl transition-all duration-300 cursor-pointer border flex items-center gap-2 font-medium text-sm ${
            isUnlocked 
              ? "bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20 hover:bg-accent-emerald/20" 
              : "bg-surface border-border-subtle hover:bg-hover text-text-secondary"
          }`}
        >
          {isUnlocked ? <><Unlock size={16} /> <span className="hidden sm:inline">Active</span></> : <><Lock size={16} /> <span className="hidden sm:inline">Login</span></>}
        </button>
      </motion.div>
    </div>
  );
}
