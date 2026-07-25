"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
    root.style.colorScheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    return;
  }
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("system");

  useEffect(() => {
    const stored = localStorage.getItem("tripistic-theme");
    if (stored === "light" || stored === "dark" || stored === "system") {
      setThemeState(stored);
      applyTheme(stored);
    } else {
      applyTheme("system");
    }
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyTheme("system");
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme(nextTheme) {
        setThemeState(nextTheme);
        localStorage.setItem("tripistic-theme", nextTheme);
        document.cookie = `tripistic-theme=${nextTheme}; path=/; max-age=31536000; samesite=lax`;
        applyTheme(nextTheme);
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
