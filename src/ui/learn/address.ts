// The lesson or example being shown is part of the address (?lesson=reverse-a-list,
// ?example=doubly), so it can be shared and the browser's back button leaves it.
import { useMemo, useSyncExternalStore } from "react";

export interface Pick {
  kind: "lesson" | "example";
  id: string;
}

const NAVIGATED = "heaphop:navigate";

function subscribe(onChange: () => void) {
  addEventListener("popstate", onChange);
  addEventListener(NAVIGATED, onChange);
  return () => {
    removeEventListener("popstate", onChange);
    removeEventListener(NAVIGATED, onChange);
  };
}

function parse(search: string): Pick | null {
  const query = new URLSearchParams(search);
  const lesson = query.get("lesson");
  if (lesson) return { kind: "lesson", id: lesson };
  const example = query.get("example");
  return example ? { kind: "example", id: example } : null;
}

/** What the address asks to show. Nothing while pre-rendering. */
export function usePick(): Pick | null {
  const search = useSyncExternalStore(subscribe, () => location.search, () => "");
  return useMemo(() => parse(search), [search]);
}

export const hrefOf = (pick: Pick) => `?${pick.kind}=${encodeURIComponent(pick.id)}`;

/** Opens a lesson or example as a new history entry. */
export function openPick(pick: Pick) {
  history.pushState({ heaphop: true }, "", hrefOf(pick));
  dispatchEvent(new Event(NAVIGATED));
}

/** Back to the list: the previous history entry, or a clean address after a shared link. */
export function backToList() {
  if (history.state?.heaphop) history.back();
  else {
    history.replaceState(null, "", location.pathname);
    dispatchEvent(new Event(NAVIGATED));
  }
}
