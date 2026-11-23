"use client";
// Carries out nav-history.ts: watches clicks on links to this site's pages and builds the
// history so Back goes straight to Home between main pages, one step at a time inside a
// section. Links it handles load as full pages (location.assign / replace / history.go).
import { useEffect } from "react";
import { entryFromReferrer, planMove, type Entry } from "./nav-history";

const NEXT = "hh-nav-next"; // the entry the next page should record
const REWIND = "hh-nav-rewind"; // after rewinding to a section's first page, where to go
const FRESH_MS = 15_000;

interface Handoff { url: string; entry: Entry; t: number }
function take(key: string): Handoff | null {
  try {
    const raw = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    const v = raw ? (JSON.parse(raw) as Handoff) : null;
    return v && typeof v.url === "string" && v.url.startsWith("/") && !v.url.startsWith("//") && Date.now() - v.t < FRESH_MS ? v : null;
  } catch {
    return null;
  }
}
function give(key: string, url: string, entry: Entry) {
  try { sessionStorage.setItem(key, JSON.stringify({ url, entry, t: Date.now() })); } catch { /* storage off: plain navigation */ }
}
const isEntry = (v: unknown): v is Entry => !!v && typeof (v as Entry).depth === "number" && typeof (v as Entry).home === "boolean";
const currentEntry = (): Entry | null => (isEntry(history.state?.hh) ? history.state.hh : null);

export function NavHistory() {
  useEffect(() => {
    const settle = () => {
      const rewind = take(REWIND);
      if (rewind) {
        give(NEXT, rewind.url, rewind.entry);
        location.replace(rewind.url);
        return;
      }
      if (currentEntry()) return;
      const next = take(NEXT);
      const here = location.pathname + location.search;
      const entry = next && next.url === here ? next.entry : entryFromReferrer(document.referrer, location.origin);
      history.replaceState({ ...history.state, hh: entry }, "");
    };
    settle();
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) settle(); };
    const onPop = () => { if (sessionStorage.getItem(REWIND)) settle(); };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      if (a.dataset.lesson !== undefined || a.dataset.example !== undefined) return; // opens in place itself
      const to = new URL(a.href, location.href);
      const move = planMove(location, to, currentEntry());
      if (move.kind === "ignore") return;
      e.preventDefault();
      e.stopPropagation(); // the app router's own link handling must not run as well
      if (move.kind === "assign") { give(NEXT, move.url, move.entry); location.assign(move.url); }
      else if (move.kind === "replace") { give(NEXT, move.url, move.entry); location.replace(move.url); }
      else if (move.kind === "back") history.go(-move.steps);
      else { give(REWIND, move.url, move.entry); history.go(-move.steps); }
    };
    addEventListener("pageshow", onShow);
    addEventListener("popstate", onPop);
    document.addEventListener("click", onClick, true);
    return () => {
      removeEventListener("pageshow", onShow);
      removeEventListener("popstate", onPop);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
