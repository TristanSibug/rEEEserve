"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>("light");
  const isDark = theme === "dark";

  useEffect(() => {
    const currentTheme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";

    setThemeState(currentTheme);
  }, []);

  function setTheme(nextTheme: Theme) {
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("reeeserve-theme", nextTheme);
    setThemeState(nextTheme);
  }

  function toggleTheme() {
    setTheme(isDark ? "light" : "dark");
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span className="theme-toggle-icon sun">☀️</span>
      <span className="theme-toggle-icon moon">🌙</span>
      <span className="theme-toggle-thumb" />
    </button>
  );
}
