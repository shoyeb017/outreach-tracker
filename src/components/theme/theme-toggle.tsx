"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export const themeStorageKey = "outreach-theme";
function snapshot() { return document.documentElement.dataset.theme === "dark"; }
function subscribe(callback: () => void) {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  function sync() {
    let saved: string | null = null;
    try { saved = localStorage.getItem(themeStorageKey); } catch { /* Storage may be disabled. */ }
    document.documentElement.dataset.theme = saved === "light" || saved === "dark" ? saved : media?.matches ? "dark" : "light";
    callback();
  }
  window.addEventListener("outreach-theme-change", callback);
  window.addEventListener("storage", sync);
  media?.addEventListener("change", sync);
  return () => { window.removeEventListener("outreach-theme-change", callback); window.removeEventListener("storage", sync); media?.removeEventListener("change", sync); };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, snapshot, () => false);
  return <Button variant="ghost" size="icon" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => {
    const theme = dark ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(themeStorageKey, theme); } catch { /* The choice still works for this page. */ }
    window.dispatchEvent(new Event("outreach-theme-change"));
  }}>{dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}</Button>;
}
