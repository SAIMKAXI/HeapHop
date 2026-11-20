// The editor's state: the student's own programs, which one is open, and the code of
// each. Kept in localStorage so work survives a reload. A first visit starts with one
// program holding the starter code; after that the editor opens on the last program.
//
// It is an external store read with useSyncExternalStore: the page is pre-rendered with
// the defaults, and the saved state is picked up right after hydration without an
// effect that calls setState.
import { useSyncExternalStore } from "react";
import { MAX_SOURCE_CHARS } from "@/core/types";

interface Snippet {
  id: string;
  title: string;
}

export interface EditorState {
  /** Id of the open program ("my:1731831000000"). */
  tab: string;
  /** Edited code by program id. A program with no entry shows the starter code. */
  codes: Record<string, string>;
  /** Never empty: deleting the last program leaves a fresh one. */
  snippets: Snippet[];
}

const STORAGE_KEY = "heaphop.editor.v1";
export const MAX_SNIPPETS = 20;
const STARTER = "#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n";
const FIRST: Snippet = { id: "my:first", title: "My program" };
const DEFAULT_STATE: EditorState = { tab: FIRST.id, codes: {}, snippets: [FIRST] };

export function codeOf(state: EditorState, tab = state.tab): string {
  return Object.hasOwn(state.codes, tab) ? state.codes[tab] : STARTER;
}

export function titleOf(state: EditorState, tab = state.tab): string {
  return state.snippets.find((s) => s.id === tab)?.title ?? FIRST.title;
}

/** At least one program, an open tab that exists, and no code for programs that are gone. */
function normalize(state: EditorState): EditorState {
  if (state.snippets.length === 0) return DEFAULT_STATE;
  const ids = new Set(state.snippets.map((s) => s.id));
  const codes = Object.fromEntries(Object.entries(state.codes).filter(([id]) => ids.has(id)));
  return { tab: ids.has(state.tab) ? state.tab : state.snippets[0].id, codes, snippets: state.snippets };
}

// ---- the store --------------------------------------------------------------

const listeners = new Set<() => void>();
let current: EditorState | null = null;

const MAX_TITLE = 80;
const SNIPPET_ID = /^my:[\w-]{1,40}$/;

/**
 * Saved state, checked field by field. localStorage can be edited by anyone with the
 * browser's developer tools, so nothing read from it is trusted: wrong types are dropped,
 * sizes are capped, and anything unreadable starts fresh.
 */
export function fromSaved(raw: string | null): EditorState {
  let saved: unknown;
  try {
    saved = JSON.parse(raw ?? "null");
  } catch {
    return DEFAULT_STATE;
  }
  if (typeof saved !== "object" || saved === null) return DEFAULT_STATE;
  const { tab, codes, snippets } = saved as Record<string, unknown>;
  if (typeof tab !== "string" || typeof codes !== "object" || codes === null || Array.isArray(codes) || !Array.isArray(snippets)) return DEFAULT_STATE;
  const kept: Snippet[] = [];
  for (const x of snippets) {
    if (kept.length >= MAX_SNIPPETS) break;
    if (typeof x !== "object" || x === null) continue;
    const { id, title } = x as Record<string, unknown>;
    if (typeof id !== "string" || !SNIPPET_ID.test(id) || kept.some((k) => k.id === id)) continue;
    kept.push({ id, title: typeof title === "string" && title.trim() ? title.slice(0, MAX_TITLE) : FIRST.title });
  }
  const clean: Record<string, string> = {};
  for (const [id, code] of Object.entries(codes)) {
    if (typeof code === "string") clean[id] = code.slice(0, MAX_SOURCE_CHARS);
  }
  return normalize({ tab, codes: clean, snippets: kept });
}

function load(): EditorState {
  try {
    return fromSaved(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage blocked: start fresh.
    return DEFAULT_STATE;
  }
}

/** Writes the state; when storage is full, keeps dropping the oldest snippets' code. */
function save(state: EditorState) {
  const codes = { ...state.codes };
  const oldestFirst = state.snippets.map((s) => s.id).filter((id) => id !== state.tab);
  for (;;) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, codes }));
      return;
    } catch {
      const drop = oldestFirst.shift();
      if (drop === undefined) return; // nothing left to give up; keep working without saving
      delete codes[drop];
    }
  }
}

function update(change: (state: EditorState) => EditorState) {
  const changed = change(snapshot());
  if (changed === current) return;
  const next = normalize(changed);
  current = next;
  save(next);
  listeners.forEach((l) => l());
}

function snapshot(): EditorState {
  current ??= load();
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEditorState(): EditorState {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_STATE);
}

// ---- actions ----------------------------------------------------------------

/** Edits the code of the open program. Code equal to the starter is not stored. */
export function setCode(code: string) {
  update((s) => {
    const codes = { ...s.codes };
    if (code === STARTER) delete codes[s.tab];
    else codes[s.tab] = code;
    return { ...s, codes };
  });
}

export function openTab(tab: string) {
  update((s) => (s.tab === tab ? s : { ...s, tab }));
}

/** Back to the starter code. */
export function resetTab() {
  setCode(STARTER);
}

/** Creates a snippet and opens it. At the limit, the oldest snippet makes room. */
export function createSnippet(): string {
  const id = `my:${Date.now()}`;
  update((s) => {
    const snippets = [...s.snippets, { id, title: "Untitled" }];
    const codes = { ...s.codes };
    while (snippets.length > MAX_SNIPPETS) delete codes[snippets.shift()!.id];
    return { tab: id, codes, snippets };
  });
  return id;
}

export function renameSnippet(id: string, title: string) {
  update((s) => ({ ...s, snippets: s.snippets.map((x) => (x.id === id ? { ...x, title: title.trim() || "Untitled" } : x)) }));
}

export function deleteSnippet(id: string) {
  update((s) => {
    const codes = { ...s.codes };
    delete codes[id];
    return { tab: s.tab, codes, snippets: s.snippets.filter((x) => x.id !== id) };
  });
}
