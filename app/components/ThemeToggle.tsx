"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      className="theme-toggle-moon-svg"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="currentColor"
    >
      <path d="M21 14.6A8.5 8.5 0 0 1 9.4 3a7 7 0 1 0 11.6 11.6Z" />
    </svg>
  );
}

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
      className="theme-toggle-single"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span
        className="theme-toggle-single-icon theme-toggle-single-icon-sun"
        aria-hidden="true"
      >
        <SunIcon />
      </span>

      <span
        className="theme-toggle-single-icon theme-toggle-single-icon-moon"
        aria-hidden="true"
      >
        <MoonIcon />
      </span>
    </button>
  );
}
