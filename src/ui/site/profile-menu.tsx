"use client";
// The signed-in visitor's menu: a round profile icon (never their name, so nothing personal
// shows on screen) that opens Account settings, Admin for admins, and Log out.
import { CircleUserRound, LogOut, Settings, ShieldCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const item = "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left lg:min-h-0 lg:py-2 text-sm text-foreground transition-colors hover:bg-card-border/50 focus-visible:bg-card-border/50 focus-visible:outline-none";

export function ProfileMenu({ admin }: { admin: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); button.current?.focus(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = [...(box.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
        const at = items.indexOf(document.activeElement as HTMLElement);
        items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", keys);
    box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", keys); };
  }, [open]);

  return (
    <div ref={box} className="relative" data-account-menu>
      <button
        ref={button}
        type="button"
        aria-label="Your account"
        title="Your account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        data-profile-button
        className="flex h-10 w-10 items-center justify-center rounded-full border-2 lg:h-9 lg:w-9 border-card-border text-muted-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent aria-expanded:border-accent aria-expanded:text-accent"
      >
        <CircleUserRound size={20} aria-hidden />
      </button>
      {open && (
        <div id={id} role="menu" aria-label="Your account" className="absolute right-0 top-11 z-50 w-52 rounded-xl border-2 border-card-border bg-card p-1.5 shadow-xl">
          <a role="menuitem" href="/account" className={item} data-account-link><Settings size={15} aria-hidden />Account settings</a>
          {admin && <a role="menuitem" href="/admin" className={item} data-admin-link><ShieldCheck size={15} aria-hidden />Admin</a>}
          <div className="my-1 border-t border-card-border" role="separator" />
          {/* A plain form post: the server checks the Origin and the cookie is SameSite. */}
          <form method="post" action="/auth/logout">
            <button role="menuitem" type="submit" className={`${item} text-danger`} data-logout><LogOut size={15} aria-hidden />Log out</button>
          </form>
        </div>
      )}
    </div>
  );
}
