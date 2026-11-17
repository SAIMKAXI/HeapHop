"use client";

// The bar at the top of every screen: the name, an optional way back, the site's pages
// (on the website only) and the theme switch.
import { ChevronLeft } from "lucide-react";
import { ThemeToggle } from "@/ui/theme-toggle";
import { cn } from "@/ui/utils";
import { NAV_LINKS, type SitePage } from "./links";
import { useOnWebsite } from "./website";

interface AppHeaderProps {
  /** The page being shown, marked in the navigation. */
  current?: SitePage;
  onBack?: () => void;
  /** Where the back button goes, in words. */
  backLabel?: string;
}

export function AppHeader({ current, onBack, backLabel = "Back" }: AppHeaderProps) {
  const onWebsite = useOnWebsite();
  const name = <span className="text-lg font-bold">HeapHop</span>;
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
            {backLabel}
          </button>
        )}
        {onWebsite ? <a href="/" data-home-link className="rounded focus-visible:outline-2 focus-visible:outline-accent">{name}</a> : name}
      </div>
      <div className="flex items-center gap-1">
        {onWebsite && (
          <nav aria-label="Site" className="hidden items-center gap-1 sm:flex">
            {NAV_LINKS.map((l) => (
              <a
                key={l.page}
                href={l.href}
                aria-current={current === l.page ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                  current === l.page ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-card-border/30 hover:text-foreground"
                )}
              >
                {l.label}
              </a>
            ))}
          </nav>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
