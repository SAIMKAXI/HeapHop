// The editor's state: which example or snippet is open, the code of each, and the
// student's own snippets. Kept in localStorage so work survives a reload.
//
// It is an external store read with useSyncExternalStore: the page is pre-rendered with
// the defaults, and the saved state is picked up right after hydration without an
// effect that calls setState.
import { useSyncExternalStore } from "react";
import { EXAMPLES } from "@content/examples";

interface Snippet {
  id: string;
  title: string;
}

export interface EditorState {
  /** Id of the open example ("ex:reverse") or snippet ("my:1731831000000"). */
  tab: string;
  /** Edited code by tab id. A tab with no entry shows its original code. */
  codes: Record<string, string>;
  snippets: Snippet[];
}

const STORAGE_KEY = "heaphop.editor.v1";
export const MAX_SNIPPETS = 20;
const BLANK_PROGRAM = "int main() {\n    \n    return 0;\n}\n";

export const exampleTab = (id: string) => `ex:${id}`;
const isSnippetTab = (tab: string) => tab.startsWith("my:");

const DEFAULT_STATE: EditorState = { tab: exampleTab(EXAMPLES[0].id), codes: {}, snippets: [] };

/** The code a tab starts with before the student edits it. */
function originalCode(tab: string): string {
  return EXAMPLES.find((e) => exampleTab(e.id) === tab)?.code ?? BLANK_PROGRAM;
}

export function codeOf(state: EditorState, tab = state.tab): string {
  return state.codes[tab] ?? originalCode(tab);
}

export function titleOf(state: EditorState, tab = state.tab): string {
  return state.snippets.find((s) => s.id === tab)?.title ?? EXAMPLES.find((e) => exampleTab(e.id) === tab)?.title ?? "Untitled";
}

// ---- the store --------------------------------------------------------------

const listeners = new Set<() => void>();
let current: EditorState | null = null;

function load(): EditorState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<EditorState> | null;
    if (saved && typeof saved.tab === "string" && saved.codes && Array.isArray(saved.snippets)) {
      const tabExists = isSnippetTab(saved.tab) ? saved.snippets.some((s) => s.id === saved.tab) : EXAMPLES.some((e) => exampleTab(e.id) === saved.tab);
      return { tab: tabExists ? saved.tab : DEFAULT_STATE.tab, codes: saved.codes, snippets: saved.snippets };
    }
  } catch {
    // Storage blocked or unreadable: start fresh.
  }
  return DEFAULT_STATE;
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
  const next = change(snapshot());
  if (next === current) return;
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

/** Edits the code of the open tab. Code equal to the original is not stored. */
export function setCode(code: string) {
  update((s) => {
    const codes = { ...s.codes };
    if (code === originalCode(s.tab)) delete codes[s.tab];
    else codes[s.tab] = code;
    return { ...s, codes };
  });
}

export function openTab(tab: string) {
  update((s) => (s.tab === tab ? s : { ...s, tab }));
}

/** Back to the tab's original code (the example, or a blank program for a snippet). */
export function resetTab() {
  setCode(originalCode(snapshot().tab));
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
    return { tab: s.tab === id ? DEFAULT_STATE.tab : s.tab, codes, snippets: s.snippets.filter((x) => x.id !== id) };
  });
}
