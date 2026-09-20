// Shared light/dark theme, used by every route so the toggle and preference are
// one system. Effective theme = a stored manual override, else the OS preference
// (kept live). The override is written to documentElement as [data-theme]; with
// no override the attribute is removed and prefers-color-scheme governs. All
// palette values live in theme.css - this only flips which set is active.

import { useCallback, useEffect, useState } from "react";
import { ThemeIcon } from "../components/icons.js";

type Theme = "light" | "dark";
const KEY = "ml-theme";

function readOverride(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Apply the stored override before first paint to avoid a flash (called in main). */
export function applyStoredTheme(): void {
  const o = readOverride();
  if (o) document.documentElement.setAttribute("data-theme", o);
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [override, setOverride] = useState<Theme | null>(() => readOverride());
  const [system, setSystem] = useState<Theme>(systemTheme);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystem(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (override) root.setAttribute("data-theme", override);
    else root.removeAttribute("data-theme");
  }, [override]);

  const toggle = useCallback(() => {
    setOverride((prev) => {
      const effective = prev ?? systemTheme();
      const next: Theme = effective === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* private mode - session-only toggle is fine */
      }
      return next;
    });
  }, []);

  return { theme: override ?? system, toggle };
}

/** Compact icon-only pill toggle for the nav, shared by all routes. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const target: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${target} theme`}
      data-cursor="hover"
    >
      <ThemeIcon target={target} />
    </button>
  );
}
