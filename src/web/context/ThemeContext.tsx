import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type ThemeId = "twitter" | "gruvbox" | "dracula";

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  description: string;
  accent: string;     // preview swatch color
  bg: string;         // preview bg color
  fg: string;         // preview fg color
}

export const THEMES: ThemeInfo[] = [
  {
    id: "twitter",
    name: "Twitter Classic",
    description: "The original dark blue aesthetic",
    accent: "#1D9BF0",
    bg: "#050508",
    fg: "#E7E9EA",
  },
  {
    id: "gruvbox",
    name: "Gruvbox",
    description: "Retro warm earthy tones",
    accent: "#D79921",
    bg: "#1D2021",
    fg: "#EBDBB2",
  },
  {
    id: "dracula",
    name: "Dracula",
    description: "Cool purple-infused darkness",
    accent: "#BD93F9",
    bg: "#282A36",
    fg: "#F8F8F2",
  },
];

interface ThemeCtx {
  theme: ThemeId;
  themeInfo: ThemeInfo;
  setTheme: (id: ThemeId) => void;
  themes: ThemeInfo[];
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "twitter",
  themeInfo: THEMES[0]!,
  setTheme: () => {},
  themes: THEMES,
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "unbird-theme";

function applyThemeToDOM(themeId: ThemeId) {
  document.documentElement.setAttribute("data-theme", themeId);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && THEMES.some(t => t.id === saved)) return saved as ThemeId;
    }
    return "twitter";
  });

  const themeInfo = THEMES.find(t => t.id === theme) ?? THEMES[0]!;

  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(id);
    localStorage.setItem(STORAGE_KEY, id);
    applyThemeToDOM(id);
  }, []);

  // Apply on mount and when theme changes
  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, themeInfo, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}
