// One C++ tokenizer for display, used by the editor's colour layer and by the code
// panel. It only colours text; the interpreter has its own, stricter tokenizer.

export type SyntaxKind = "comment" | "string" | "preprocessor" | "number" | "type" | "keyword" | "builtin" | "function" | "plain";

export interface SyntaxToken {
  text: string;
  kind: SyntaxKind;
}

/** CSS class for each kind (defined in globals.css, with light and dark colours). */
export const SYNTAX_CLASS: Record<SyntaxKind, string> = {
  comment: "syn-cmt", string: "syn-str", preprocessor: "syn-prep", number: "syn-num",
  type: "syn-type", keyword: "syn-kw", builtin: "syn-bi", function: "syn-fn", plain: "",
};

const KEYWORDS = new Set([
  "if", "else", "while", "do", "for", "return", "break", "continue", "switch", "case", "default",
  "struct", "class", "new", "delete", "typedef", "const", "nullptr", "NULL", "true", "false",
  "namespace", "using", "template", "typename", "public", "private", "protected", "virtual",
  "override", "static", "extern", "sizeof", "this", "throw", "try", "catch",
]);
const TYPES = new Set(["int", "void", "double", "float", "char", "bool", "string", "auto", "long", "short", "unsigned", "signed", "size_t"]);
const BUILTINS = new Set(["cout", "cin", "endl", "cerr", "getline", "printf", "scanf", "std"]);

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;
const NUMBER_PART = /[0-9a-fA-FxX.]/;

function wordKind(word: string, rest: string): SyntaxKind {
  if (TYPES.has(word)) return "type";
  if (KEYWORDS.has(word)) return "keyword";
  if (BUILTINS.has(word)) return "builtin";
  return /^\s*\(/.test(rest) ? "function" : "plain";
}

/** Splits code into coloured runs. Joining every `text` gives back the input exactly. */
export function tokenizeCpp(code: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  const push = (text: string, kind: SyntaxKind) => {
    const last = tokens.at(-1);
    if (kind === "plain" && last?.kind === "plain") last.text += text;
    else tokens.push({ text, kind });
  };
  const lineEnd = (from: number) => (code.indexOf("\n", from) === -1 ? code.length : code.indexOf("\n", from));
  /** End of a "..." or '...' literal starting at `from`; stops at the end of the line. */
  const quotedEnd = (from: number) => {
    const quote = code[from];
    let j = from + 1;
    while (j < code.length && code[j] !== quote && code[j] !== "\n") j += code[j] === "\\" ? 2 : 1;
    return code[j] === quote ? j + 1 : Math.min(j, code.length);
  };

  let i = 0;
  while (i < code.length) {
    const c = code[i];
    let end: number;
    let kind: SyntaxKind;
    if (c === "/" && code[i + 1] === "/") { end = lineEnd(i); kind = "comment"; }
    else if (c === "/" && code[i + 1] === "*") { const close = code.indexOf("*/", i + 2); end = close === -1 ? code.length : close + 2; kind = "comment"; }
    else if (c === '"' || c === "'") { end = quotedEnd(i); kind = "string"; }
    else if (c === "#") { end = lineEnd(i); kind = "preprocessor"; }
    else if (c >= "0" && c <= "9") { end = i; while (end < code.length && NUMBER_PART.test(code[end])) end++; kind = "number"; }
    else if (IDENT_START.test(c)) {
      end = i;
      while (end < code.length && IDENT_PART.test(code[end])) end++;
      kind = wordKind(code.slice(i, end), code.slice(end, end + 40));
    } else { end = i + 1; kind = "plain"; }
    push(code.slice(i, end), kind);
    i = end;
  }
  return tokens;
}
