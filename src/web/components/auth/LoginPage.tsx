import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";

export function LoginPage() {
  const { login, unlock, hasStoredSession, isUnlocked } = useAuth();
  
  const [step, setStep] = useState<"login" | "pin" | "unlock">(hasStoredSession && !isUnlocked ? "unlock" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [tempSession, setTempSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navHome = () => {
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, totp: totp || undefined, email: email || undefined }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Login failed");
      
      setTempSession(data);
      setStep("pin");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) {
      setError("PIN must be at least 4 chars");
      return;
    }
    await login(tempSession, pin);
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const success = await unlock(pin);
    if (!success) {
      setError("Incorrect PIN");
    } else {
      navHome();
    }
    setLoading(false);
  };

  const handleFinishedPin = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSetPin(e);
    navHome();
  }

  return (
    <div className="flex-1 min-h-[80vh] w-full flex flex-col items-center justify-center p-4 bg-base relative overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-sm bg-elevated border border-border-subtle rounded-2xl shadow-2xl overflow-hidden relative"
      >
        {/* Back Button */}
        {!(hasStoredSession && !isUnlocked && step === "unlock") && (
          <button 
            type="button"
            onClick={navHome}
            className="absolute top-4 right-4 text-text-tertiary hover:text-text-primary p-2 cursor-pointer z-10 bg-surface rounded-full shadow hover:bg-hover transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        )}

        <div className="p-6 sm:p-8">
          {step === "unlock" && (
            <form onSubmit={handleUnlock} className="flex flex-col gap-5">
              <div className="text-center mb-2">
                <div className="w-16 h-16 rounded-2xl bg-surface border border-border-subtle flex items-center justify-center mx-auto mb-4 shadow-inner">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-blue"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                </div>
                <h3 className="text-xl font-bold text-text-primary">Unlock Vault</h3>
                <p className="text-sm text-text-tertiary mt-1">Enter PIN to decrypt your session</p>
              </div>
              
              <div>
                <input 
                  type="password" autoFocus
                  value={pin} onChange={(e) => setPin(e.target.value)}
                  placeholder="Encryption PIN" 
                  className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all"
                />
              </div>

              {error && <div className="text-red-400 text-sm font-medium bg-red-500/10 p-3 rounded-lg border border-red-500/20">{error}</div>}

              <button disabled={loading} className="w-full py-3 rounded-xl bg-accent-blue hover:bg-opacity-90 text-white font-bold transition-all disabled:opacity-50 mt-2">
                {loading ? "Unlocking..." : "Unlock"}
              </button>
              
              <button type="button" onClick={() => setStep("login")} className="text-xs text-text-tertiary hover:text-text-secondary mt-2">
                Or sign in with a different account
              </button>
            </form>
          )}

          {step === "login" && (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="text-center mb-4">
                 <h3 className="text-2xl font-bold text-text-primary">Ghost Mode Vault</h3>
                 <p className="text-sm text-text-tertiary mt-2">
                   Your credentials <span className="text-accent-blue font-medium">never touch our server</span>. 
                   They are AES-GCM encrypted directly in your browser.
                 </p>
                 <div className="mt-4 p-3 bg-accent-amber/10 border border-accent-amber/20 rounded-xl flex items-start gap-3 text-left">
                   <div className="text-accent-amber mt-0.5">
                     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                   </div>
                   <p className="text-xs text-text-secondary leading-relaxed">
                     For maximum safety, we strongly encourage logging in with a <strong className="text-text-primary">disposable alt account</strong>. Ghost Mode will use this account to fetch your private proxy data.
                   </p>
                 </div>
              </div>

              <input 
                  autoFocus
                  type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username" required disabled={loading}
                  className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all"
                />
                
                <input 
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password" required disabled={loading}
                  className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all"
                />

                <input 
                  type="text" value={totp} onChange={(e) => setTotp(e.target.value)}
                  placeholder="2FA Code or Secret (Optional)" disabled={loading}
                  className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all"
                />

                <input 
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email (if Twitter asks for verification)" disabled={loading}
                  className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all"
                />

              {error && <div className="text-red-400 text-sm font-medium bg-red-500/10 p-3 rounded-lg border border-red-500/20">{error}</div>}

              <button disabled={loading} className="w-full py-3 rounded-xl bg-accent-blue hover:bg-opacity-90 text-white font-bold transition-all disabled:opacity-50 mt-2">
                {loading ? "Authenticating..." : "Login Securely"}
              </button>
            </form>
          )}

          {step === "pin" && (
            <form onSubmit={handleFinishedPin} className="flex flex-col gap-5">
              <div className="text-center mb-2">
                <div className="w-16 h-16 rounded-2xl bg-surface border border-border-subtle flex items-center justify-center mx-auto mb-4 shadow-inner">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-emerald"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                </div>
                <h3 className="text-xl font-bold text-text-primary">Secure Local Vault</h3>
                <p className="text-sm text-text-tertiary mt-1">Set a PIN to encrypt your session tokens in this browser.</p>
              </div>

               <div>
                <input 
                  type="text" autoFocus
                  value={pin} onChange={(e) => setPin(e.target.value)}
                  placeholder="Create a PIN (e.g. 1234)" 
                  className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-emerald focus:ring-1 focus:ring-accent-emerald transition-all"
                />
              </div>

               {error && <div className="text-red-400 text-sm font-medium bg-red-500/10 p-3 rounded-lg border border-red-500/20">{error}</div>}

               <button className="w-full py-3 rounded-xl bg-accent-emerald hover:bg-opacity-90 text-white font-bold transition-all mt-2 shadow-[0_0_20px_rgba(0,186,124,0.3)]">
                Encrypt & Finish
              </button>
            </form>
          )}

        </div>
      </motion.div>
    </div>
  );
}
