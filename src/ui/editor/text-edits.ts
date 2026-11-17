// Editing rules of the code editor, as pure functions so they can be tested without a
// browser: what a key does to the text and where the cursor goes afterwards.
import { tokenizeCpp } from "./cpp-syntax";

export interface TextState {
  value: string;
  /** Selection start and end, as in a <textarea>. */
  start: number;
  end: number;
}

export interface TextEdit {
  value: string;
  /** Where the cursor goes after the edit. */
  caret: number;
}

const INDENT = "    ";
const OPENERS: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
const PAIRS: Record<string, string> = { ...OPENERS, '"': '"', "'": "'" };
const CLOSERS = new Set(Object.values(OPENERS));
/** A quote typed after one of these starts a literal, so it is closed automatically. */
const BEFORE_LITERAL = /[\s({[,;=+\-*/<>!&|^~%?:]/;

function replace({ value, start, end }: TextState, text: string, caretOffset = text.length): TextEdit {
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + caretOffset };
}

/**
 * The edit a key press makes, or null to let the browser handle the key.
 * Handles Tab and Shift+Tab, Enter with indentation, bracket and quote pairs.
 */
export function editForKey(state: TextState, key: string, shift: boolean): TextEdit | null {
  const { value, start, end } = state;
  const before = value[start - 1];
  const after = value[start];
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;

  switch (key) {
    case "Tab": {
      if (!shift) return replace(state, INDENT);
      const line = value.slice(lineStart, end);
      const dedented = line.replace(/^( {1,4}|\t)/, "");
      const removed = line.length - dedented.length;
      return { value: value.slice(0, lineStart) + dedented + value.slice(end), caret: Math.max(lineStart, start - removed) };
    }
    case "Enter": {
      const indent = /^\s*/.exec(value.slice(lineStart, start))![0];
      if (before === "{" && after === "}") {
        return replace(state, `\n${indent}${INDENT}\n${indent}`, 1 + indent.length + INDENT.length);
      }
      const deeper = value.slice(0, start).trimEnd().endsWith("{") ? INDENT : "";
      return replace(state, `\n${indent}${deeper}`);
    }
    case "Backspace":
      if (start === end && before && PAIRS[before] === after) {
        return { value: value.slice(0, start - 1) + value.slice(start + 1), caret: start - 1 };
      }
      return null;
  }
  if (start === end && (CLOSERS.has(key) || key === '"' || key === "'") && after === key) {
    return { value, caret: start + 1 }; // type over the closing character
  }
  if (OPENERS[key]) return replace(state, key + OPENERS[key], 1);
  if ((key === '"' || key === "'") && (!before || BEFORE_LITERAL.test(before))) return replace(state, key + key, 1);
  return null;
}

/** Re-indents code by its braces. Braces inside strings and comments are ignored. */
export function formatCpp(code: string): string {
  let depth = 0;
  return code.split("\n").map((raw) => {
    const line = raw.trim();
    if (!line) return "";
    let opens = 0;
    let closes = 0;
    let leadingCloses = 0;
    let sawCode = false;
    for (const token of tokenizeCpp(line)) {
      if (token.kind !== "plain") { sawCode = true; continue; }
      for (const ch of token.text) {
        if (ch === "{") { opens++; sawCode = true; }
        else if (ch === "}") { closes++; if (!sawCode) leadingCloses++; }
        else if (ch.trim()) sawCode = true;
      }
    }
    const printed = INDENT.repeat(Math.max(0, depth - leadingCloses)) + line;
    depth = Math.max(0, depth + opens - closes);
    return printed;
  }).join("\n");
}
