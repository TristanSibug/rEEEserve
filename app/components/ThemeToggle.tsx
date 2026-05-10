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
      viewBox="0 0 480 480"
      width="20"
      height="20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M459.782 347.328c-4.288-5.28-11.488-7.232-17.824-4.96-17.76 6.368-37.024 9.632-57.312 9.632-97.056 0-176-78.976-176-176 0-58.4 28.832-112.768 77.12-145.472 5.472-3.712 8.096-10.4 6.624-16.832S285.638 2.4 279.078 1.44C271.59.352 264.134 0 256.646 0c-132.352 0-240 107.648-240 240s107.648 240 240 240c84 0 160.416-42.688 204.352-114.176 3.552-5.792 3.04-13.184-1.216-18.496z" />
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
