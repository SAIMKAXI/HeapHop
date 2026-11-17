// Light or dark theme: the class on <html> plus a saved choice.
// The website applies the saved choice before the first paint (see src/app/layout.tsx).
import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY as STORAGE_KEY } from "./theme-script";
const listeners = new Set<() => void>();

const isLight = () => document.documentElement.classList.contains("light");

function apply(light: boolean) {
  document.documentElement.classList.toggle("light", light);
  document.documentElement.classList.toggle("dark", !light);
  listeners.forEach((l) => l());
}

/** Applies the saved theme. Called once by shells that cannot run a script before paint. */
export function applySavedTheme() {
  try {
    if (localStorage.getItem(STORAGE_KEY) === "light") apply(true);
  } catch {
    // Storage blocked: keep the default.
  }
}

export function toggleTheme() {
  const light = !isLight();
  apply(light);
  try {
    localStorage.setItem(STORAGE_KEY, light ? "light" : "dark");
  } catch {
    // The choice just is not remembered.
  }
}

export function useLightTheme(): boolean {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    isLight,
    () => false
  );
}
