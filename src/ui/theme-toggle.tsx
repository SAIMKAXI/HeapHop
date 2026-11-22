"use client";

import { Moon, Sun } from "lucide-react";
import { toggleTheme, useLightTheme } from "@/ui/theme";

export function ThemeToggle() {
  const light = useLightTheme();
  const label = light ? "Switch to dark mode" : "Switch to light mode";
  return (
    <button
      type="button"
      data-theme-toggle
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="rounded-md border border-card-border p-1.5 text-muted-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
    >
      {light ? <Moon size={13} aria-hidden /> : <Sun size={13} aria-hidden />}
    </button>
  );
}
