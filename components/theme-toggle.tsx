"use client";
// Adapted to Nool from Hairline UI's MIT-licensed theme-toggle.
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
const key = "nool-appearance";
const subscribe = (callback: () => void) => {
  const notify = () => {
    try {
      const saved = localStorage.getItem(key);
      if (saved === "dark" || saved === "light") {
        document.documentElement.dataset.mode = saved;
        document.documentElement.style.colorScheme = saved;
      } else {
        delete document.documentElement.dataset.mode;
        document.documentElement.style.colorScheme = "light dark";
      }
    } catch {
      /* Keep the current page preference when storage is blocked. */
    }
    callback();
  };
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", notify);
  window.addEventListener("storage", notify);
  window.addEventListener("nool-theme", notify);
  return () => {
    media.removeEventListener("change", notify);
    window.removeEventListener("storage", notify);
    window.removeEventListener("nool-theme", notify);
  };
};
function snapshot() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(key);
  } catch {
    saved = document.documentElement.dataset.mode ?? null;
  }
  return saved === "dark" || saved === "light"
    ? saved
    : window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
}
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, snapshot, () => "system");
  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      aria-pressed={mode === "system" ? undefined : mode === "dark"}
      onClick={() => {
        const next = snapshot() === "dark" ? "light" : "dark";
        document.documentElement.dataset.mode = next;
        document.documentElement.style.colorScheme = next;
        try {
          localStorage.setItem(key, next);
        } catch {
          /* The current page still changes. */
        }
        window.dispatchEvent(new Event("nool-theme"));
      }}
    >
      <Sun size={17} className="theme-sun" aria-hidden="true" />
      <Moon size={17} className="theme-moon" aria-hidden="true" />
    </button>
  );
}
