"use client";

// The bar at the top of every screen: the logo and name, an optional way back, the site's pages
// (on the website only) and the theme switch.
import { ChevronLeft } from "lucide-react";
import { ThemeToggle } from "@/ui/theme-toggle";
import { cn } from "@/ui/utils";
import { Logo } from "./logo";
import { NAV_LINKS, type SitePage } from "./links";
import { ProfileMenu } from "./profile-menu";
import { useOnWebsite, useSession } from "./website";

interface AppHeaderProps {
  /** The page being shown, marked in the navigation. */
  current?: SitePage;
  onBack?: () => void;
  /** Where the back button goes, in words. */
  backLabel?: string;
}

const pill = "rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-card-border/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent";

export function AppHeader({ current, onBack, backLabel = "Back" }: AppHeaderProps) {
  const onWebsite = useOnWebsite();
  const session = useSession();
  const name = <span className="flex items-center gap-2 text-lg font-bold"><Logo />HeapHop</span>;
  return (
    <header className="flex items-center justify-between gap-3 border-b border-card-border bg-header px-4 py-2.5 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onBack && (
          <button
            type="button"
            data-back
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-full border border-card-border bg-card px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronLeft size={14} aria-hidden />
            {backLabel}
          </button>
        )}
        {onWebsite ? <a href="/" data-home-link className="rounded focus-visible:outline-2 focus-visible:outline-accent">{name}</a> : name}
      </div>
      <div className="flex items-center gap-1.5">
        {onWebsite && (
          <nav aria-label="Site" className="hidden items-center gap-1 sm:flex">
            {NAV_LINKS.map((l) => (
              <a
                key={l.page}
                href={l.href}
                aria-current={current === l.page ? "page" : undefined}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                  current === l.page ? "bg-accent text-on-accent" : "text-muted-foreground hover:bg-card-border/40 hover:text-foreground"
                )}
              >
                {l.label}
              </a>
            ))}
          </nav>
        )}
        {onWebsite && (session ? (
          <ProfileMenu admin={session.admin} />
        ) : (
          <div className="flex items-center gap-1">
            <a href="/login" className={pill} data-login-link>Log in</a>
            <a href="/signup" className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-accent" data-signup-link>Sign up</a>
          </div>
        ))}
        <ThemeToggle />
      </div>
    </header>
  );
}
