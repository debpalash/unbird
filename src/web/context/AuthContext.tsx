import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface UserSession {
  auth_token: string;
  ct0: string;
  username: string;
  id: string | null;
}

interface AuthCtx {
  session: UserSession | null;
  isUnlocked: boolean;
  hasStoredSession: boolean;
  login: (session: UserSession, pin: string) => Promise<void>;
  unlock: (pin: string) => Promise<boolean>;
  logout: () => void;
  showLoginModal: boolean;
  setShowLoginModal: (v: boolean) => void;
}

const AuthContext = createContext<AuthCtx>({
  session: null,
  isUnlocked: false,
  hasStoredSession: false,
  login: async () => {},
  unlock: async () => false,
  logout: () => {},
  showLoginModal: false,
  setShowLoginModal: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// --- Web Crypto Helpers ---

async function getEncryptionKey(pin: string, saltHex: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(pin), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
  );
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  return await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

function bufToHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuf(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
}

// --- LocalStorage Keys ---
const STORAGE_KEY = "unbird_vault_session";
const SALT_KEY = "unbird_vault_salt";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasStoredSession, setHasStoredSession] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasStoredSession(!!localStorage.getItem(STORAGE_KEY));
    }
  }, []);

  // Sync with global fetch interceptor
  useEffect(() => {
    if (typeof window === "undefined") return;

    // We store the current session in a mutable ref-like object 
    // so the fetch interceptor always has the latest token without needing a dependency array closure
    (window as any).__UNBIRD_ISOLATED_SESSION__ = session;
    
    // Only patch once
    if (!(window as any).__FETCH_PATCHED_FOR_AUTH__) {
      const originalFetch = window.fetch;
      window.fetch = (async (...args: Parameters<typeof fetch>) => {
        const url = args[0] as string;
        // Only append to internal API calls
        if (typeof url === "string" && url.startsWith("/api/")) {
          const s = (window as any).__UNBIRD_ISOLATED_SESSION__;
          if (s) {
            args[1] = args[1] || {};
            args[1].headers = {
              ...(args[1].headers || {}),
              "X-User-Session": encodeURIComponent(JSON.stringify(s)),
            };
          }
        }
        return originalFetch.apply(window, args as any);
      }) as typeof fetch;
      (window as any).__FETCH_PATCHED_FOR_AUTH__ = true;
    }
  }, [session]);

  const login = async (newSession: UserSession, pin: string) => {
    // Generate salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = bufToHex(salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const key = await getEncryptionKey(pin, saltHex);
    const enc = new TextEncoder();
    
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(JSON.stringify(newSession))
    );

    const payload = JSON.stringify({
      iv: bufToHex(iv),
      data: bufToHex(encrypted),
      username: newSession.username // stored in plaintext so UI knows who is locked
    });

    localStorage.setItem(SALT_KEY, saltHex);
    localStorage.setItem(STORAGE_KEY, payload);
    
    setHasStoredSession(true);
    setSession(newSession);
    setIsUnlocked(true);
    setShowLoginModal(false);
  };

  const unlock = async (pin: string): Promise<boolean> => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saltHex = localStorage.getItem(SALT_KEY);
    if (!raw || !saltHex) return false;

    try {
      const payload = JSON.parse(raw);
      const key = await getEncryptionKey(pin, saltHex);
      
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: hexToBuf(payload.iv) as unknown as BufferSource },
        key,
        hexToBuf(payload.data) as unknown as BufferSource
      );
      
      const decStr = new TextDecoder().decode(decrypted);
      const decSession = JSON.parse(decStr) as UserSession;
      
      setSession(decSession);
      setIsUnlocked(true);
      return true;
    } catch (e) {
      console.error("Unlock failed", e);
      return false; // Wrong PIN
    }
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SALT_KEY);
    setSession(null);
    setIsUnlocked(false);
    setHasStoredSession(false);
  };

  return (
    <AuthContext.Provider value={{
      session, isUnlocked, hasStoredSession, login, unlock, logout, showLoginModal, setShowLoginModal
    }}>
      {children}
    </AuthContext.Provider>
  );
}
