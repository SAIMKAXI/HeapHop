// Version numbers that both the page and the Worker need. Kept in their own tiny file
// so the page can read them without loading the interpreter.

/** Bumped when the interpreter's behaviour changes, so cached traces are not reused. */
export const INTERPRETER_VERSION = 4;
