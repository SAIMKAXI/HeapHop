// The editor's pure helpers: display tokenizer, key editing rules, formatter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tokenizeCpp } from "../../src/ui/editor/cpp-syntax";
import { editForKey, formatCpp, type TextState } from "../../src/ui/editor/text-edits";

const at = (text: string): TextState => {
  const start = text.indexOf("|");
  return { value: text.replace("|", ""), start, end: start };
};
const shown = (e: { value: string; caret: number } | null) => (e ? e.value.slice(0, e.caret) + "|" + e.value.slice(e.caret) : null);

test("tokenizeCpp gives back every fixture exactly, with the right kinds", () => {
  const dir = join(__dirname, "..", "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".cpp"))) {
    const code = readFileSync(join(dir, f), "utf8");
    assert.equal(tokenizeCpp(code).map((t) => t.text).join(""), code, f);
  }
  const kinds = tokenizeCpp('#include <x>\nint main() { cout << "a\\"b" << 3; // hi\n}').map((t) => `${t.kind}:${t.text.trim()}`).filter((s) => !s.startsWith("plain"));
  assert.deepEqual(kinds, ["preprocessor:#include <x>", "type:int", "function:main", "builtin:cout", 'string:"a\\"b"', "number:3", "comment:// hi"]);
});

test("an unterminated string or comment stops at the end of the line or text", () => {
  assert.deepEqual(tokenizeCpp('"abc\nx').map((t) => t.kind), ["string", "plain"]);
  assert.deepEqual(tokenizeCpp("/* open").map((t) => t.kind), ["comment"]);
});

test("Tab inserts four spaces; Shift+Tab removes them", () => {
  assert.equal(shown(editForKey(at("a|b"), "Tab", false)), "a    |b");
  assert.equal(shown(editForKey(at("    x|"), "Tab", true)), "x|");
  assert.equal(shown(editForKey(at("  x|"), "Tab", true)), "x|");
});

test("Enter keeps the indentation and goes one deeper after {", () => {
  assert.equal(shown(editForKey(at("    a;|"), "Enter", false)), "    a;\n    |");
  assert.equal(shown(editForKey(at("if (x) {|"), "Enter", false)), "if (x) {\n    |");
  assert.equal(shown(editForKey(at("  f() {|}"), "Enter", false)), "  f() {\n      |\n  }");
});

test("brackets and quotes close themselves, can be typed over and deleted as a pair", () => {
  assert.equal(shown(editForKey(at("f|"), "(", false)), "f(|)");
  assert.equal(shown(editForKey(at("f(|)"), ")", false)), "f()|");
  assert.equal(shown(editForKey(at("x = |"), '"', false)), 'x = "|"');
  assert.equal(shown(editForKey(at("don|"), "'", false)), null, "an apostrophe inside a word is just typed");
  assert.equal(shown(editForKey(at("[|]"), "Backspace", false)), "|");
  assert.equal(shown(editForKey(at("a|b"), "Backspace", false)), null);
  assert.equal(editForKey(at("a|"), "x", false), null);
});

test("formatCpp indents by braces, including closing braces of nested blocks", () => {
  const messy = "int main() {\nif (x) {\ny();\n}\nreturn 0;\n}";
  assert.equal(formatCpp(messy), "int main() {\n    if (x) {\n        y();\n    }\n    return 0;\n}");
  assert.equal(formatCpp("void f() {\nif (a) {\n} else {\nb();\n}\n}"), "void f() {\n    if (a) {\n    } else {\n        b();\n    }\n}");
});

test("formatCpp ignores braces inside strings and comments", () => {
  assert.equal(formatCpp('int main() {\ncout << "{";\n// }\nreturn 0;\n}'), 'int main() {\n    cout << "{";\n    // }\n    return 0;\n}');
});
