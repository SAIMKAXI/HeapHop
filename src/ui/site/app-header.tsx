"use client";

// The bar at the top of every screen: the logo and name, an optional way back, the site's pages
// (on the website only) and the theme switch. Under 640 px the page links and Log in / Sign up move
// into the menu button's panel (mobile-menu.tsx); controls are 40 px tall below 1024 px, for fingers.
import { ChevronLeft } from "lucide-react";
import { ThemeToggle } from "@/ui/theme-toggle";
import { cn } from "@/ui/utils";
import { Logo } from "./logo";
import { NAV_LINKS, type SitePage } from "./links";
import { MobileMenu } from "./mobile-menu";
import { ProfileMenu } from "./profile-menu";
import { useOnWebsite, useSession } from "./website";

interface AppHeaderProps {
  /** The page being shown, marked in the navigation. */
  current?: SitePage;
  onBack?: () => void;
  /** Where the back button goes, in words. */
  backLabel?: string;
}

const pill = "inline-flex items-center rounded-full px-3.5 py-2.5 lg:py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-card-border/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent";

export function AppHeader({ current, onBack, backLabel = "Back" }: AppHeaderProps) {
  const onWebsite = useOnWebsite();
  const session = useSession();
  // With a back button beside it, the name gives way to the logo alone on narrow phones.
  const name = <span className="flex items-center gap-2 text-lg font-bold"><Logo /><span className={onBack ? "max-[419px]:sr-only" : undefined}>HeapHop</span></span>;
  return (
    <header className="relative flex items-center justify-between gap-2 border-b border-card-border bg-header px-3 py-2 sm:gap-3 sm:px-6 sm:py-2.5 phone-land:py-1">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {onBack && (
          <button
            type="button"
            data-back
            onClick={onBack}
            className="flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-card-border bg-card px-3.5 text-sm font-medium lg:min-h-0 lg:py-1.5 text-muted-foreground transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronLeft size={14} aria-hidden />
            {backLabel}
          </button>
        )}
        {onWebsite ? <a href="/" data-home-link className="flex min-h-10 min-w-10 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-accent" aria-label={onBack ? "HeapHop home" : undefined}>{name}</a> : name}
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
                  "inline-flex items-center rounded-full px-3.5 py-2.5 text-sm font-medium transition-colors lg:py-1.5 focus-visible:outline-2 focus-visible:outline-accent",
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
          <div className="hidden items-center gap-1 sm:flex">
            <a href="/login" className={pill} data-login-link>Log in</a>
            <a href="/signup" className="inline-flex items-center rounded-full bg-accent px-3.5 py-2.5 text-sm lg:py-1.5 font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-accent" data-signup-link>Sign up</a>
          </div>
        ))}
        <ThemeToggle />
        {onWebsite && <MobileMenu current={current} signedIn={!!session} />}
      </div>
    </header>
  );
}
