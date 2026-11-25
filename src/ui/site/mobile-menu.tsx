"use client";
// The phone menu (under 640 px, where the header has no room for the page links): a button that
// opens a panel under the header with the site's pages, and Log in / Sign up for visitors.
// Escape, a tap outside, or leaving the page closes it; the page coming back from the browser's
// back/forward cache starts closed.
import { Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/ui/utils";
import { NAV_LINKS, type SitePage } from "./links";

const row = "flex min-h-12 items-center rounded-xl px-4 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent";

export function MobileMenu({ current, signedIn }: { current?: SitePage; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const restored = (e: PageTransitionEvent) => { if (e.persisted) setOpen(false); };
    addEventListener("pageshow", restored);
    return () => removeEventListener("pageshow", restored);
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    const keys = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    const wide = matchMedia("(min-width: 640px)");
    const grew = () => { if (wide.matches) setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", keys);
    wide.addEventListener("change", grew);
    panel.current?.querySelector<HTMLElement>("a")?.focus();
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", keys);
      wide.removeEventListener("change", grew);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        data-menu-button
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-card-border text-muted-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent aria-expanded:border-accent aria-expanded:text-accent sm:hidden"
      >
        {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
      </button>
      <div
        ref={panel}
        id={id}
        hidden={!open}
        data-menu-panel
        className="absolute inset-x-0 top-full z-50 border-b-2 border-card-border bg-header px-3 pb-4 pt-2 shadow-2xl sm:hidden"
      >
        <nav aria-label="Site menu" className="flex flex-col gap-1">
          {NAV_LINKS.map((l) => (
            <a
              key={l.page}
              href={l.href}
              onClick={() => setOpen(false)}
              aria-current={current === l.page ? "page" : undefined}
              className={cn(row, current === l.page ? "bg-accent/15 text-accent" : "text-foreground hover:bg-card-border/40")}
            >
              {l.label}
            </a>
          ))}
        </nav>
        {!signedIn && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-card-border pt-3">
            <a href="/login" className={cn(row, "justify-center border border-card-border text-foreground hover:border-accent")} data-menu-login>Log in</a>
            <a href="/signup" className={cn(row, "justify-center bg-accent font-semibold text-on-accent hover:opacity-90")} data-menu-signup>Sign up</a>
          </div>
        )}
      </div>
    </>
  );
}
