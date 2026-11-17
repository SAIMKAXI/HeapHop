// Tokenizer: source text in, list of tokens out.
import { KEYWORDS, PUNCTUATION, type Token } from "./tokens";
import { parseError } from "./errors";

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", "0": "\0", "\\": "\\", "'": "'", '"': '"' };

const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";

export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  const defines = new Map<string, string>();
  let i = 0;
  let line = 1;
  const push = (type: Token["type"], value: string) => tokens.push({ type, value, line });

  while (i < code.length) {
    const c = code[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }

    // Preprocessor lines. `#define NAME 100` is remembered as a constant; the rest
    // (#include ...) carries no runtime meaning here.
    if (c === "#") {
      const start = i;
      while (i < code.length && code[i] !== "\n") i++;
      const def = /^#\s*define\s+([A-Za-z_]\w*)\s+(-?\d+(?:\.\d+)?)\s*(?:\/\/.*)?$/.exec(code.slice(start, i).trim());
      if (def) defines.set(def[1], def[2]);
      continue;
    }
    if (c === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && code[i + 1] === "*") {
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) {
        if (code[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }

    if (isIdentStart(c)) {
      const s = i;
      while (i < code.length && isIdentPart(code[i])) i++;
      const word = code.slice(s, i);
      // `using namespace std;` and `using std::cout;` change nothing we show.
      if (word === "using") {
        while (i < code.length && code[i] !== ";") { if (code[i] === "\n") line++; i++; }
        i++;
        continue;
      }
      const defined = defines.get(word);
      if (defined !== undefined) push(defined.includes(".") ? "float" : "int", defined);
      else push(KEYWORDS.has(word) ? "keyword" : "ident", word);
      continue;
    }

    if (isDigit(c) || (c === "." && isDigit(code[i + 1] ?? ""))) {
      const s = i;
      while (i < code.length && isDigit(code[i])) i++;
      let isFloat = false;
      if (code[i] === "." && isDigit(code[i + 1] ?? "")) {
        isFloat = true;
        i++;
        while (i < code.length && isDigit(code[i])) i++;
      } else if (code[i] === "." && !isIdentStart(code[i + 1] ?? "")) {
        isFloat = true; // "5."
        i++;
      }
      const text = code.slice(s, i);
      if (/[fFlLuU]/.test(code[i] ?? "")) i++; // 2.5f, 10L
      push(isFloat ? "float" : "int", text);
      continue;
    }

    if (c === '"') {
      i++;
      let str = "";
      while (i < code.length && code[i] !== '"') {
        if (code[i] === "\n") throw parseError("this text is missing its closing quote (\")", line);
        if (code[i] === "\\" && i + 1 < code.length) {
          str += ESCAPES[code[i + 1]] ?? code[i + 1];
          i += 2;
        } else {
          str += code[i++];
        }
      }
      if (i >= code.length) throw parseError("this text is missing its closing quote (\")", line);
      i++;
      push("string", str);
      continue;
    }

    if (c === "'") {
      let ch: string;
      if (code[i + 1] === "\\") { ch = ESCAPES[code[i + 2]] ?? code[i + 2]; i += 3; }
      else { ch = code[i + 1]; i += 2; }
      if (code[i] !== "'") throw parseError("a character literal holds exactly one character, like 'a'", line);
      i++;
      push("char", ch);
      continue;
    }

    const punct = PUNCTUATION.find((p) => code.startsWith(p, i));
    if (punct) {
      push("punct", punct);
      i += punct.length;
      continue;
    }

    throw parseError(`unexpected character "${c}"`, line);
  }
  tokens.push({ type: "eof", value: "", line });
  return tokens;
}
