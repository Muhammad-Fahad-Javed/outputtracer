"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getWallpaperFromCache } from "@/lib/photo-cache";

export type ThemeColor = "teal" | "blue" | "purple" | "pink" | "orange";

interface ThemeContextType {
  themeColor: ThemeColor;
  setThemeColor: (color: ThemeColor) => void;
  wallpaperUrl: string | null;
  refreshWallpaper: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const THEME_COLORS: Record<ThemeColor, { primary: string; dark: string; bubbleOut: string }> = {
  teal: { primary: "#128C7E", dark: "#0D6E63", bubbleOut: "#DCF8C6" }, // WhatsApp style
  blue: { primary: "#007AFF", dark: "#0056B3", bubbleOut: "#D1E8FF" }, // iMessage style
  purple: { primary: "#8A2BE2", dark: "#5E17A8", bubbleOut: "#E9D8FD" },
  pink: { primary: "#EC4899", dark: "#BE185D", bubbleOut: "#FCE7F3" },
  orange: { primary: "#F97316", dark: "#C2410C", bubbleOut: "#FFEDD5" },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeColor, setThemeColorState] = useState<ThemeColor>("teal");
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);

  useEffect(() => {
    // Load saved preferences
    const savedColor = localStorage.getItem("chat_theme_color") as ThemeColor;
    if (savedColor && THEME_COLORS[savedColor]) {
      setThemeColorState(savedColor);
    }
    refreshWallpaper();
  }, []);

  const refreshWallpaper = async () => {
    const url = await getWallpaperFromCache();
    setWallpaperUrl(url);
  };

  const setThemeColor = (color: ThemeColor) => {
    setThemeColorState(color);
    localStorage.setItem("chat_theme_color", color);
  };

  useEffect(() => {
    const root = document.documentElement;
    const colors = THEME_COLORS[themeColor];
    
    root.style.setProperty("--theme-primary", colors.primary);
    root.style.setProperty("--theme-primary-dark", colors.dark);
    root.style.setProperty("--theme-bubble-out", colors.bubbleOut);
  }, [themeColor]);

  return (
    <ThemeContext.Provider value={{ themeColor, setThemeColor, wallpaperUrl, refreshWallpaper }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
