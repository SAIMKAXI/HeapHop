// How moving between pages builds the browser's history, so that Back feels right:
//   - from Home, a main page is a new step;
//   - between main pages (Learn, Editor, About, FAQ, Privacy, Supported, Account, Admin) the
//     current page is replaced, so Back goes straight to Home;
//   - inside a section (Learn -> a topic -> a lesson) every page is a step, so Back goes one at
//     a time, and leaving the section first rewinds to its first page;
//   - a main page opened directly (bookmark, shared link) gets Home underneath it
//     (NAV_START_SCRIPT, before the app starts), so Back goes to Home before leaving the site.
// Sign-in pages and other sites are left to the browser.
//
// Each history entry remembers, in history.state.hh, how many steps it is from the first page
// of its section (depth) and whether Home is right below that first page (home). The pure
// decisions are here and unit-tested; nav-history-client.tsx carries them out.

export type Section = "home" | "learn" | "editor" | "about" | "faq" | "privacy" | "supported" | "account" | "admin";
export interface Entry { depth: number; home: boolean }
export type Move =
  | { kind: "ignore" }
  | { kind: "assign"; url: string; entry: Entry }
  | { kind: "replace"; url: string; entry: Entry }
  | { kind: "back"; steps: number }
  | { kind: "rewind"; steps: number; url: string; entry: Entry };

const MAIN = /^\/(learn|editor|about|faq|privacy|supported|account|admin)(?:\/|$)/;

export function sectionOf(pathname: string): Section | null {
  if (pathname === "/") return "home";
  const m = MAIN.exec(pathname);
  return m ? (m[1] as Section) : null;
}

const pathOf = (u: { pathname: string; search: string }) => u.pathname + u.search;

export function planMove(from: URL | Location, to: URL, current: Entry | null): Move {
  if (to.origin !== from.origin || pathOf(to) === pathOf(from)) return { kind: "ignore" };
  const a = sectionOf(from.pathname);
  const b = sectionOf(to.pathname);
  if (!a || !b) return { kind: "ignore" };
  const url = pathOf(to);
  const here = current ?? { depth: 0, home: false };
  if (a === "home") return { kind: "assign", url, entry: { depth: 0, home: true } };
  if (a === b) return { kind: "assign", url, entry: { depth: here.depth + 1, home: here.home } };
  if (b === "home") return here.home ? { kind: "back", steps: here.depth + 1 } : { kind: "replace", url, entry: { depth: 0, home: false } };
  const entry = { depth: 0, home: here.home };
  return here.depth > 0 ? { kind: "rewind", steps: here.depth, url, entry } : { kind: "replace", url, entry };
}

/** For a page reached some other way (a redirect, a link we didn't handle). */
export function entryFromReferrer(referrer: string, origin: string): Entry {
  try {
    const r = new URL(referrer);
    return { depth: 0, home: r.origin === origin && r.pathname === "/" };
  } catch {
    return { depth: 0, home: false };
  }
}

/**
 * Runs before the app starts. A main page opened directly (no page of this site before it,
 * a fresh visit, not a reload) gets Home put underneath it: the current entry becomes Home
 * and the page is pushed on top. Back lands on an entry the app router didn't write, so it
 * reloads, and Home is shown.
 */
// The placeholder Home entry has no Next.js state, so Next reloads it when Back lands there.
// Before the app has started nobody is listening yet, so the script listens itself.
export const NAV_START_SCRIPT = `try{var L=location,P=L.pathname;if(${MAIN.toString()}.test(P)&&!history.state){var N=performance.getEntriesByType("navigation")[0],R=document.referrer,S=false;try{S=!!R&&new URL(R).origin===L.origin}catch(e){}if(!S&&(!N||N.type==="navigate")){var U=P+L.search+L.hash;history.replaceState({hhHome:1},"","/");history.pushState({hh:{depth:0,home:true}},"",U);addEventListener("popstate",function(e){if(e.state&&e.state.hhHome)location.reload()})}}}catch(e){}`;
