// Program input for cin. The student supplies all input before the run;
// `cin >> x` and getline consume it in order, exactly as a piped stdin would.
export class InputReader {
  private pos = 0;

  constructor(private text: string) {}

  /** Next whitespace-delimited token, as `cin >> x` reads it. Null when nothing is left. */
  token(): string | null {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos++;
    if (this.pos >= this.text.length) return null;
    const start = this.pos;
    while (this.pos < this.text.length && !/\s/.test(this.text[this.pos])) this.pos++;
    return this.text.slice(start, this.pos);
  }

  /** Next non-space character, as `cin >> c` reads a char. */
  char(): string | null {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos++;
    return this.pos < this.text.length ? this.text[this.pos++] : null;
  }

  /** The rest of the current line, as getline(cin, s) reads it. Null at the end of the input. */
  line(): string | null {
    if (this.pos >= this.text.length) return null;
    const end = this.text.indexOf("\n", this.pos);
    const line = end < 0 ? this.text.slice(this.pos) : this.text.slice(this.pos, end);
    this.pos = end < 0 ? this.text.length : end + 1;
    return line;
  }

  /** `cin.ignore()`: skip one character (usually the newline left by `cin >> x`). */
  skipChar() {
    if (this.pos < this.text.length) this.pos++;
  }
}
