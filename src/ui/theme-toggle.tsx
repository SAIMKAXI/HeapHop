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
      className="flex h-10 w-10 items-center justify-center rounded-lg border border-card-border text-muted-foreground lg:h-8 lg:w-8 lg:rounded-md transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
    >
      {light ? <Moon size={15} aria-hidden /> : <Sun size={15} aria-hidden />}
    </button>
  );
}
