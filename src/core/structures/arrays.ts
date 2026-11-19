// Which variables a program uses as indexes of which arrays, read from its source once.
// `table[keys[k] % 5]` makes k an index of keys, not of table; `a[j + 1]` makes j an
// index of a; in `adj[u][v]`, u indexes the rows of adj and v its columns ("adj[]"). The array drawing shows a variable above an array only when the program
// indexes that array with it, so a loop counter of one array never marks another.

const KEYWORDS = new Set(["new", "delete", "sizeof", "true", "false", "nullptr", "NULL", "int", "char", "double", "float", "bool", "this"]);

export function arrayIndexNames(source: readonly string[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const text = source
    .map((l) => l.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""').replace(/\/\/.*$/, ""))
    .join("\n");
  /** Collect the top-level names of the subscript that opens at `from`; returns the index after its `]`. */
  const scan = (from: number, names: Set<string>): number => {
    let depth = 1, i = from;
    for (; i < text.length && depth > 0; i++) {
      const word = /^[A-Za-z_]\w*/.exec(text.slice(i))?.[0];
      if (word) {
        const after = text.slice(i + word.length).trimStart();
        // Only names at the top level of this subscript, and not themselves arrays being indexed.
        if (depth === 1 && !after.startsWith("[") && !after.startsWith("(") && !KEYWORDS.has(word)) names.add(word);
        i += word.length - 1;
      } else if (text[i] === "[") depth++;
      else if (text[i] === "]") depth--;
    }
    return i;
  };
  const get = (key: string) => out.get(key) ?? out.set(key, new Set()).get(key)!;
  const subscript = /([A-Za-z_]\w*)\s*\[/g;
  for (let m = subscript.exec(text); m; m = subscript.exec(text)) {
    const end = scan(subscript.lastIndex, get(m[1]));
    // The second subscript of a 2-D array (`adj[u][v]`) is filed under "adj[]".
    const rest = /^\s*\[/.exec(text.slice(end));
    if (rest) scan(end + rest[0].length, get(`${m[1]}[]`));
  }
  return out;
}
