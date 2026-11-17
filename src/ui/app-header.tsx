"use client";

// The bar at the top of both screens: name, an optional way back, the theme switch.
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { ThemeToggle } from "@/ui/theme-toggle";

interface AppHeaderProps {
  /** Shown under the name in the editor. */
  subtitle?: string;
  onBack?: () => void;
  children?: ReactNode;
}

export function AppHeader({ subtitle, onBack, children }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 border-b-2 border-card-border bg-card px-4 py-2.5 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onBack && (
          <button
            type="button"
            data-back
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg border border-card-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronLeft size={14} aria-hidden />
            Editor
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-bold">HeapHop</h1>
          {subtitle && <p className="hidden truncate text-sm text-muted-foreground sm:block">{subtitle}</p>}
        </div>
        {children}
      </div>
      <ThemeToggle />
    </header>
  );
}
