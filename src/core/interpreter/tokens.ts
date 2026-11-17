// Token shapes for the C++ subset tokenizer.

type TokenType = "ident" | "keyword" | "int" | "float" | "char" | "string" | "punct" | "eof";

export interface Token {
  type: TokenType;
  /** Keyword, identifier name, punctuation text, or the literal's decoded value. */
  value: string;
  line: number;
}

export const KEYWORDS = new Set([
  "struct", "class", "public", "private", "protected", "typedef",
  "int", "void", "bool", "char", "double", "float", "long", "short", "unsigned", "signed", "const",
  "new", "delete", "nullptr", "NULL", "true", "false", "this",
  "if", "else", "while", "do", "for", "switch", "case", "default", "break", "continue", "return",
  // recognised only so they can be reported as unsupported with a clear message
  "template", "typename", "virtual", "friend", "operator", "static", "namespace", "try", "catch",
  "throw", "goto", "sizeof", "enum", "union", "auto", "inline",
]);

/** Longest first, so "->" wins over "-". */
export const PUNCTUATION = [
  "<<=", ">>=", "...",
  "->", "==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/=", "%=", "::", "<<", ">>",
  "{", "}", "(", ")", "[", "]", ";", ",", ".", "=", "+", "-", "*", "/", "%", "&", "<", ">", "!", ":", "?", "~", "|", "^",
];

/** How a token is named in an error message. */
export function describeToken(t: Token): string {
  switch (t.type) {
    case "eof": return "the end of the file";
    case "string": return `the text "${t.value}"`;
    case "char": return `the character '${t.value}'`;
    case "int": case "float": return `the number ${t.value}`;
    default: return `"${t.value}"`;
  }
}
