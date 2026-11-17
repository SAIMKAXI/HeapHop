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
      className="rounded-lg border-2 border-card-border p-2 text-muted-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
    >
      {light ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
