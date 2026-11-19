// Which variables a program uses as indexes of which arrays, read from its source once.
// `table[keys[k] % 5]` makes k an index of keys, not of table; `a[j + 1]` makes j an
// index of a. The array drawing shows a variable above an array only when the program
// indexes that array with it, so a loop counter of one array never marks another.

const KEYWORDS = new Set(["new", "delete", "sizeof", "true", "false", "nullptr", "NULL", "int", "char", "double", "float", "bool", "this"]);

export function arrayIndexNames(source: readonly string[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const text = source
    .map((l) => l.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""').replace(/\/\/.*$/, ""))
    .join("\n");
  const subscript = /([A-Za-z_]\w*)\s*\[/g;
  for (let m = subscript.exec(text); m; m = subscript.exec(text)) {
    const names = out.get(m[1]) ?? new Set<string>();
    out.set(m[1], names);
    let depth = 1;
    for (let i = subscript.lastIndex; i < text.length && depth > 0; i++) {
      const word = /^[A-Za-z_]\w*/.exec(text.slice(i))?.[0];
      if (word) {
        const after = text.slice(i + word.length).trimStart();
        // Only names at the top level of this subscript, and not themselves arrays being indexed.
        if (depth === 1 && !after.startsWith("[") && !after.startsWith("(") && !KEYWORDS.has(word)) names.add(word);
        i += word.length - 1;
      } else if (text[i] === "[") depth++;
      else if (text[i] === "]") depth--;
    }
  }
  return out;
}
