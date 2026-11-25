// Parser: tokens in, Program out. Recursive descent over the supported C++ subset.
// Anything outside the subset raises a SourceError that names the construct and
// its line (rule 7: a readable error, never a wrong picture).
import { describeToken, type Token } from "./tokens";
import { parseError, unsupported } from "./errors";
import { typeText } from "./ast";
import type {
  AssignOp, BinaryOp, ClassDef, Declarator, Expr, Field, FuncDef, MemberInit, Param, Program,
  Stmt, SwitchCase, TypeRef,
} from "./ast";

/** What the parser may accept beyond the core subset. */
export interface ParseOptions {
  /** Accept std::list (with auto and range-for). Off on the website, on in the VS Code extension. */
  stl?: boolean;
  /** What the #include lines name, from the tokenizer. */
  includes?: string[];
  /** The using lines, from the tokenizer. */
  usings?: string[];
}

const BUILTIN_TYPES = new Set(["int", "void", "bool", "char", "double", "float", "long", "short", "unsigned", "signed"]);

const UNSUPPORTED_KEYWORDS: Record<string, [what: string, hint: string]> = {
  template: ["A template", "Write the class for one type (for example int) instead."],
  typename: ["A template", "Write the class for one type (for example int) instead."],
  virtual: ["A virtual function", ""],
  friend: ["A friend declaration", ""],
  operator: ["Operator overloading", ""],
  static: ["A static member or variable", ""],
  namespace: ["A namespace", ""],
  try: ["try / catch", ""],
  catch: ["try / catch", ""],
  throw: ["throw", ""],
  goto: ["goto", ""],
  sizeof: ["sizeof", ""],
  enum: ["An enum", "Use int constants instead."],
  union: ["A union", ""],
  auto: ["auto", "Write the type out, for example Node*."],
};

const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%="]);

class Parser {
  private pos = 0;
  /** Names that start a declaration: built-ins plus every struct / class in the file. */
  private typeNames = new Set<string>(["string"]);
  private classes = new Map<string, ClassDef>();
  /** File-level integer constants (`const int MAX = 100;`), usable as array sizes. */
  private consts = new Map<string, number>();
  /** std::list is switched on for this run. */
  private stl: boolean;
  /** `#include <list>` or `#include <bits/stdc++.h>` is present. */
  private listIncluded: boolean;
  /** `using namespace std;` or `using std::list;` is present, so plain `list` means std::list. */
  private listUnqualified: boolean;
  /** Name of the class whose body is being read (inside it, its own name is never ambiguous). */
  private currentClass: string | null = null;

  constructor(private tokens: Token[], options: ParseOptions = {}) {
    this.stl = options.stl === true;
    const includes = options.includes ?? [];
    const usings = options.usings ?? [];
    this.listIncluded = includes.includes("<list>") || includes.includes("<bits/stdc++.h>");
    this.listUnqualified = usings.includes("using namespace std") || usings.includes("using std::list");
    // Pre-scan so `Node* p;` is read as a declaration even before Node is fully parsed.
    for (let i = 0; i < tokens.length - 1; i++) {
      const t = tokens[i];
      if (t.type === "keyword" && (t.value === "struct" || t.value === "class") && tokens[i + 1].type === "ident") {
        this.typeNames.add(tokens[i + 1].value);
      }
      // typedef struct { ... } Name;
      if (t.type === "punct" && t.value === "}" && tokens[i + 1].type === "ident" && tokens[i + 2]?.value === ";") {
        this.typeNames.add(tokens[i + 1].value);
      }
    }
  }

  // ---- token helpers -------------------------------------------------------

  private peek(offset = 0): Token { return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]; }
  private advance(): Token { return this.tokens[this.pos++] ?? this.tokens[this.tokens.length - 1]; }
  private is(value: string, offset = 0): boolean {
    const t = this.peek(offset);
    return (t.type === "punct" || t.type === "keyword") && t.value === value;
  }
  private isIdent(offset = 0): boolean { return this.peek(offset).type === "ident"; }
  private match(value: string): boolean {
    if (this.is(value)) { this.pos++; return true; }
    return false;
  }
  private expect(value: string): Token {
    const t = this.peek();
    if (this.is(value)) return this.advance();
    const prev = this.tokens[this.pos - 1];
    if (value === ";" && prev && prev.line < t.line) {
      throw parseError(`this line is missing a ";" at the end.`, prev.line);
    }
    throw parseError(`expected "${value}" but found ${describeToken(t)}.`, t.line);
  }
  private expectIdent(what: string): Token {
    const t = this.peek();
    if (t.type === "ident") return this.advance();
    if (t.type === "keyword" && UNSUPPORTED_KEYWORDS[t.value]) this.rejectKeyword(t);
    throw parseError(`expected ${what} but found ${describeToken(t)}.`, t.line);
  }
  private rejectKeyword(t: Token): never {
    const [what, hint] = UNSUPPORTED_KEYWORDS[t.value];
    throw unsupported(what, t.line, hint);
  }
  /** `std::` in front of a name changes nothing for us, except for std::list (see parseListType). */
  private skipStd() {
    if (this.isIdent() && this.peek().value === "std" && this.is("::", 1) && !(this.stl && this.isListAt(0))) this.pos += 2;
  }

  // ---- types ---------------------------------------------------------------

  private isTypeStart(offset = 0): boolean {
    const t = this.peek(offset);
    if (this.stl && this.isListAt(offset)) return true;
    if (t.type === "keyword") {
      if (BUILTIN_TYPES.has(t.value) || t.value === "const") return true;
      if (t.value === "auto" && this.stl) return true;
      if (t.value === "struct" || t.value === "class") return this.isIdent(offset + 1) && !this.is("{", offset + 2) && !this.is(":", offset + 2);
      return false;
    }
    if (t.type === "ident") {
      if (t.value === "std" && this.is("::", offset + 1)) return this.typeNames.has(this.peek(offset + 2).value);
      return this.typeNames.has(t.value);
    }
    return false;
  }

  /** `list<` or `std::list<` starts at this offset. */
  private isListAt(offset: number): boolean {
    const t = this.peek(offset);
    if (t.type !== "ident") return false;
    if (t.value === "std" && this.is("::", offset + 1)) return this.peek(offset + 2).type === "ident" && this.peek(offset + 2).value === "list" && this.is("<", offset + 3);
    return t.value === "list" && this.is("<", offset + 1);
  }

  /**
   * `list<int>`, `std::list<Node*>`, `list<string>::iterator`. Follows the rules g++ applies:
   * the header must be included, and plain `list` needs `using namespace std;` or `using std::list;`.
   */
  private parseListType(): string {
    const qualified = this.peek().value === "std";
    if (qualified) this.pos += 2; // std::
    const id = this.advance(); // list
    if (!this.listIncluded) {
      throw parseError(`"${qualified ? "std::" : ""}list" is used, but its header is not included. Add #include <list> at the top of the file.`, id.line);
    }
    if (!qualified) {
      if (!this.listUnqualified) {
        throw parseError(`"list" is not declared here. Write std::list, or add using namespace std; at the top of the file.`, id.line);
      }
      if (this.classes.has("list") || this.typeNames.has("list")) {
        throw parseError(`"list" is ambiguous: this file defines its own list, and using namespace std; also brings in std::list. Rename your class (for example to List) or write std::list.`, id.line);
      }
    }
    this.expect("<");
    if (this.isListAt(0)) throw unsupported("A list of lists", id.line, "Use a list of pointers, or an array of lists.");
    const t = this.peek();
    if (t.type === "keyword" && t.value === "auto") throw parseError("auto cannot be the element type of a list.", t.line);
    const elemBase = this.parseBaseType();
    let ptrs = 0;
    while (this.match("*")) ptrs++;
    if (this.is(">>")) throw unsupported("A list of lists", id.line, "Use a list of pointers, or an array of lists.");
    if (this.is(",")) throw unsupported("A list with a custom allocator", id.line);
    if (this.is("&")) throw parseError("a list cannot hold references.", id.line);
    this.expect(">");
    if (elemBase === "void" && ptrs === 0) throw parseError("a list cannot hold void.", id.line);
    const name = this.ensureList({ base: elemBase, ptr: ptrs, ref: false }, id.line);
    if (this.match("::")) {
      const member = this.expectIdent("a member type of list, such as iterator");
      if (member.value === "iterator" || member.value === "const_iterator") return `${name}::iterator`;
      if (member.value === "reverse_iterator" || member.value === "const_reverse_iterator") {
        throw unsupported(`list<...>::${member.value}`, member.line, "Walk the list backwards with --it, starting from end().");
      }
      throw unsupported(`list<...>::${member.value}`, member.line);
    }
    return name;
  }

  /** The classes that stand for list<elem> and its node, made the first time the type is named. */
  private ensureList(elem: TypeRef, line: number): string {
    const name = `list<${typeText(elem)}>`;
    if (this.classes.has(name)) return name;
    const node = `${name}::node`;
    const nodePtr: TypeRef = { base: node, ptr: 1, ref: false };
    const field = (fname: string, type: TypeRef) => ({ type, name: fname, arraySize: null, arraySize2: null, init: null, line });
    this.classes.set(name, {
      name, fields: [field("head", nodePtr), field("tail", nodePtr), field("size", { base: "int", ptr: 0, ref: false })],
      ctors: [], dtor: null, methods: [], line, builtin: { kind: "list", elem, node },
    });
    this.classes.set(node, {
      name: node, fields: [field("prev", nodePtr), field("value", elem), field("next", nodePtr)],
      ctors: [], dtor: null, methods: [], line, builtin: { kind: "listNode", list: name },
    });
    return name;
  }

  /** Base type without pointer stars: `const unsigned int`, `struct Node`, `std::string`. */
  private parseBaseType(): string {
    while (this.match("const")) { /* accepted, not enforced */ }
    const t = this.peek();
    let base: string;
    if (this.stl && this.isListAt(0)) {
      base = this.parseListType();
    } else if (this.stl && t.type === "keyword" && t.value === "auto") {
      this.advance();
      base = "auto";
    } else if (t.type === "keyword" && (t.value === "struct" || t.value === "class")) {
      this.advance();
      base = this.expectIdent("a type name").value;
    } else if (t.type === "keyword" && BUILTIN_TYPES.has(t.value)) {
      const words: string[] = [];
      while (this.peek().type === "keyword" && BUILTIN_TYPES.has(this.peek().value)) words.push(this.advance().value);
      const core = words.filter((w) => !["unsigned", "signed", "long", "short"].includes(w));
      base = core[0] ?? "int"; // `unsigned`, `long long` ... are shown as int
    } else {
      const qualified = this.isIdent() && this.peek().value === "std" && this.is("::", 1);
      this.skipStd();
      const id = this.expectIdent("a type name");
      if (!this.typeNames.has(id.value)) throw parseError(`"${id.value}" is not a type HeapHop knows.`, id.line);
      if (id.value === "list" && !qualified && this.stl && this.listIncluded && this.listUnqualified && this.currentClass !== "list") {
        throw parseError(`"list" is ambiguous: this file defines its own list, and using namespace std; also brings in std::list. Rename your class (for example to List).`, id.line);
      }
      base = id.value;
      if (this.is("<")) throw unsupported("A template type such as " + base + "<...>", id.line);
    }
    while (this.match("const")) { /* e.g. `int const` */ }
    return base;
  }

  /** Pointer stars and a reference mark that belong to one declarator: the `*&` of `Node*& head`. */
  private parseDeclType(base: string): TypeRef {
    let ptr = 0;
    for (;;) {
      if (this.match("*")) ptr++;
      else if (this.match("const")) continue;
      else break;
    }
    const ref = this.match("&");
    return { base, ptr, ref };
  }

  // ---- program -------------------------------------------------------------

  parseProgram(): Program {
    const functions: FuncDef[] = [];
    const globals: Stmt[] = [];
    const loose: Stmt[] = [];

    while (this.peek().type !== "eof") {
      const t = this.peek();
      if (this.match(";")) continue;
      if (t.type === "keyword" && UNSUPPORTED_KEYWORDS[t.value] && t.value !== "sizeof" && !(t.value === "auto" && this.stl)) this.rejectKeyword(t);

      if (this.is("typedef")) { this.parseTypedef(); continue; }
      if ((this.is("struct") || this.is("class")) && this.isIdent(1) && (this.is("{", 2) || this.is(":", 2) || this.is(";", 2))) {
        this.parseClass(false);
        continue;
      }
      // Out-of-class constructor / destructor: `LinkedList::LinkedList() {...}`, `LinkedList::~LinkedList()`
      if (this.isIdent() && this.classes.has(t.value) && this.is("::", 1)) {
        functions.push(this.parseOutOfClassSpecial());
        continue;
      }
      if (this.isTypeStart()) {
        const save = this.pos;
        const base = this.parseBaseType();
        const type = this.parseDeclType(base);
        // `int f(int x)` / `int f()` is a function; `Node n(5);` is a variable with constructor arguments.
        const looksLikeParams = this.is(")", 2) || this.isTypeStart(2);
        const isFunc = (this.isIdent() && this.is("(", 1) && looksLikeParams) || (this.isIdent() && this.is("::", 1));
        if (isFunc) {
          const f = this.parseFunction(type);
          if (f) functions.push(f);
          continue;
        }
        this.pos = save;
        const decl = this.parseDeclaration();
        if (decl.k === "decl") for (const d of decl.items) if (d.init?.k === "int") this.consts.set(d.name, d.init.v);
        globals.push(decl);
        continue;
      }
      loose.push(this.parseStatement());
    }

    // Attach out-of-class method definitions to their classes.
    const free: FuncDef[] = [];
    for (const f of functions) {
      if (!f.className) { free.push(f); continue; }
      const cls = this.classes.get(f.className);
      if (!cls) throw parseError(`"${f.className}" is not a class in this file.`, f.line);
      if (f.kind === "ctor") cls.ctors.push(f);
      else if (f.kind === "dtor") cls.dtor = f;
      else cls.methods.push(f);
    }

    const hasMain = free.some((f) => f.name === "main");
    if (hasMain && loose.length > 0) {
      throw parseError("this statement is outside any function. Move it inside main().", loose[0].line);
    }
    return {
      classes: this.classes,
      functions: free,
      globals: hasMain ? globals : [],
      // Snippet style (no main): file-level declarations and statements run top to bottom.
      topLevel: hasMain ? [] : [...globals, ...loose].sort((a, b) => a.line - b.line),
    };
  }

  private parseTypedef() {
    const start = this.advance(); // typedef
    if (!(this.is("struct") || this.is("class"))) {
      throw unsupported("This kind of typedef", start.line, "Only `typedef struct { ... } Name;` is supported.");
    }
    this.parseClass(true);
  }

  /** `struct Node { ... };`, `class LinkedList { ... };`, and the typedef form. */
  private parseClass(typedefForm: boolean) {
    const kw = this.advance(); // struct | class
    let name = this.isIdent() ? this.advance().value : "";
    if (this.match(";")) return; // forward declaration
    if (this.is(":")) throw unsupported("Inheritance", kw.line);
    if (!name) {
      // typedef struct { ... } Name;  -> find the alias after the matching brace
      let depth = 0;
      for (let i = this.pos; i < this.tokens.length; i++) {
        if (this.tokens[i].value === "{") depth++;
        if (this.tokens[i].value === "}" && --depth === 0) { name = this.tokens[i + 1]?.value ?? ""; break; }
      }
      if (!name) throw parseError("this struct has no name.", kw.line);
    }
    this.typeNames.add(name);
    const cls: ClassDef = { name, fields: [], ctors: [], dtor: null, methods: [], line: kw.line };
    this.classes.set(name, cls);
    this.expect("{");
    const outer = this.currentClass;
    this.currentClass = name;

    while (!this.is("}")) {
      const t = this.peek();
      if (t.type === "eof") throw parseError(`"${name}" is missing its closing "}".`, kw.line);
      if (this.match(";")) continue;
      if (this.is("public") || this.is("private") || this.is("protected")) {
        this.advance();
        this.expect(":");
        continue;
      }
      if (t.type === "keyword" && UNSUPPORTED_KEYWORDS[t.value]) this.rejectKeyword(t);

      if (this.is("~")) {
        this.advance();
        const id = this.expectIdent("the class name after ~");
        const f = this.parseFunctionRest({ base: "void", ptr: 0, ref: false }, "~" + id.value, name, "dtor", id.line);
        if (f) cls.dtor = f;
        continue;
      }
      if (this.isIdent() && t.value === name && this.is("(", 1)) {
        this.advance();
        const f = this.parseFunctionRest({ base: "void", ptr: 0, ref: false }, name, name, "ctor", t.line);
        if (f) cls.ctors.push(f);
        continue;
      }

      const base = this.parseBaseType();
      const first = this.parseDeclType(base);
      const id = this.expectIdent("a member name");
      if (this.is("(")) {
        const f = this.parseFunctionRest(first, id.value, name, "method", id.line);
        if (f) cls.methods.push(f);
        continue;
      }
      // One or more fields: `Node *head, *tail;`
      let type = first;
      let fieldName = id;
      for (;;) {
        cls.fields.push(this.parseFieldRest(type, fieldName));
        if (!this.match(",")) break;
        type = this.parseDeclType(base);
        fieldName = this.expectIdent("a member name");
      }
      this.expect(";");
    }
    this.expect("}");
    this.currentClass = outer;
    if (typedefForm) {
      while (this.isIdent()) {
        const alias = this.advance().value;
        this.typeNames.add(alias);
        if (alias !== name) this.classes.set(alias, cls);
        if (!this.match(",")) break;
      }
    } else if (this.isIdent() || this.is("*")) {
      throw unsupported("Declaring a variable right after the closing brace of a struct", this.peek().line, "Declare it on its own line.");
    }
    this.expect(";");
  }

  private parseFieldRest(type: TypeRef, id: Token): Field {
    if (type.ref) throw unsupported("A reference member", id.line);
    if (type.base === "auto") throw parseError("a member cannot be declared auto. Write its type.", id.line);
    const size = (): number => {
      const n = this.advance();
      this.expect("]");
      if (n.type === "int") return parseInt(n.value, 10);
      if (n.type === "ident" && this.consts.has(n.value)) return this.consts.get(n.value)!;
      throw unsupported("An array member whose size is not a number or a constant declared above it", n.line);
    };
    const arraySize = this.match("[") ? size() : null;
    const arraySize2 = arraySize !== null && this.match("[") ? size() : null;
    if (this.is("[")) throw unsupported("An array with more than two dimensions", id.line);
    const init = this.match("=") ? this.parseAssignment() : null;
    return { type, name: id.value, arraySize, arraySize2, init, line: id.line };
  }

  /** `void LinkedList::insert(int v) {...}` after the return type has been read. */
  private parseFunction(ret: TypeRef): FuncDef | null {
    const id = this.advance();
    if (this.match("::")) {
      const className = id.value;
      if (this.is("operator")) this.rejectKeyword(this.peek());
      const m = this.expectIdent("a method name");
      return this.parseFunctionRest(ret, m.value, className, "method", m.line);
    }
    return this.parseFunctionRest(ret, id.value, null, "function", id.line);
  }

  private parseOutOfClassSpecial(): FuncDef {
    const cls = this.advance(); // class name
    this.expect("::");
    const none: TypeRef = { base: "void", ptr: 0, ref: false };
    if (this.match("~")) {
      const id = this.expectIdent("the class name after ~");
      const f = this.parseFunctionRest(none, "~" + id.value, cls.value, "dtor", id.line);
      if (!f) throw parseError("a destructor defined outside the class needs a body.", id.line);
      return f;
    }
    const id = this.expectIdent("a constructor name");
    if (id.value !== cls.value) throw parseError(`"${cls.value}::${id.value}" needs a return type.`, id.line);
    const f = this.parseFunctionRest(none, id.value, cls.value, "ctor", id.line);
    if (!f) throw parseError("a constructor defined outside the class needs a body.", id.line);
    return f;
  }

  /** Parameters, optional initialiser list, body. Returns null for a prototype (`;`). */
  private parseFunctionRest(ret: TypeRef, name: string, className: string | null, kind: FuncDef["kind"], line: number): FuncDef | null {
    if (ret.base === "auto") throw unsupported("An auto return type", line, "Write the type the function returns.");
    this.expect("(");
    const params: Param[] = [];
    if (this.is("void") && this.is(")", 1)) this.advance();
    while (!this.is(")")) {
      const base = this.parseBaseType();
      const type = this.parseDeclType(base);
      if (base === "auto") throw unsupported("An auto parameter", this.peek().line, "Write the parameter's type.");
      const pname = this.isIdent() ? this.advance().value : `arg${params.length + 1}`;
      if (this.match("[")) { // `int arr[]` and `int g[][5]` are pointers
        if (!this.is("]")) this.parseExpr();
        this.expect("]");
        while (this.match("[")) { this.parseExpr(); this.expect("]"); }
        type.ptr++;
      }
      if (this.is("=")) throw unsupported("A default argument value", this.peek().line);
      params.push({ type, name: pname });
      if (!this.match(",")) break;
    }
    this.expect(")");
    this.match("const");

    const inits: MemberInit[] = [];
    if (kind === "ctor" && this.match(":")) {
      do {
        const field = this.expectIdent("a member name");
        this.expect("(");
        const args = this.parseArgs();
        inits.push({ field: field.value, args, line: field.line });
      } while (this.match(","));
    }
    if (this.match(";")) return null; // prototype: the definition comes later
    const body = this.parseBlock();
    const endLine = this.tokens[this.pos - 1].line;
    return { name, className, kind, ret, params, inits, body, line, endLine };
  }

  // ---- statements ----------------------------------------------------------

  private parseBlock(): Stmt[] {
    const open = this.expect("{");
    const body: Stmt[] = [];
    while (!this.is("}")) {
      if (this.peek().type === "eof") throw parseError(`this "{" is never closed.`, open.line);
      body.push(this.parseStatement());
    }
    this.advance();
    return body;
  }

  /** A block, or a single statement treated as a one-statement block. */
  private parseBody(): Stmt[] {
    return this.is("{") ? this.parseBlock() : [this.parseStatement()];
  }

  private parseStatement(): Stmt {
    const t = this.peek();
    const line = t.line;
    if (this.is("{")) return { k: "block", body: this.parseBlock(), line };
    if (this.match(";")) return { k: "block", body: [], line };

    if (t.type === "keyword") {
      switch (t.value) {
        case "if": return this.parseIf();
        case "while": {
          this.advance(); this.expect("(");
          const c = this.parseExpr(); this.expect(")");
          return { k: "while", c, body: this.parseBody(), line };
        }
        case "do": {
          this.advance();
          const body = this.parseBody();
          const condLine = this.expect("while").line;
          this.expect("(");
          const c = this.parseExpr(); this.expect(")"); this.expect(";");
          return { k: "doWhile", c, body, line, condLine };
        }
        case "for": return this.parseFor();
        case "switch": return this.parseSwitch();
        case "break": this.advance(); this.expect(";"); return { k: "break", line };
        case "continue": this.advance(); this.expect(";"); return { k: "continue", line };
        case "return": {
          this.advance();
          const e = this.is(";") ? null : this.parseExpr();
          this.expect(";");
          return { k: "return", e, line };
        }
        case "delete": {
          this.advance();
          let isArray = false;
          if (this.match("[")) { this.expect("]"); isArray = true; }
          const e = this.parseExpr();
          this.expect(";");
          return { k: "delete", isArray, e, line };
        }
        case "struct": case "class":
          if (!this.isTypeStart()) throw unsupported("Defining a struct or class inside a function", line, "Move it above the function.");
          break;
        default:
          if (UNSUPPORTED_KEYWORDS[t.value] && !(t.value === "auto" && this.stl)) this.rejectKeyword(t);
      }
    }

    this.skipStd();
    if (this.isIdent()) {
      const name = this.peek().value;
      if ((name === "cout" || name === "cerr") && this.is("<<", 1)) return this.parseCout();
      if (name === "cin" && this.is(">>", 1)) {
        this.advance();
        const targets: Expr[] = [];
        while (this.match(">>")) targets.push(this.parseUnary());
        this.expect(";");
        return { k: "cin", targets, wholeLine: false, line };
      }
      if (name === "cin" && this.is(".", 1)) {
        const method = this.peek(2).value;
        if (method !== "ignore" && method !== "clear" && method !== "sync") throw unsupported(`cin.${method}()`, line);
        while (!this.is(";") && this.peek().type !== "eof") this.advance();
        this.expect(";");
        return method === "ignore" ? { k: "cinIgnore", line } : { k: "block", body: [], line };
      }
      if (name === "getline" && this.is("(", 1)) {
        this.advance(); this.advance();
        this.skipStd();
        if (!(this.isIdent() && this.peek().value === "cin")) throw unsupported("getline from anything other than cin", line);
        this.advance();
        this.expect(",");
        const target = this.parseUnary();
        this.expect(")");
        this.expect(";");
        return { k: "cin", targets: [target], wholeLine: true, line };
      }
      if (name === "scanf" || name === "printf" || name === "gets") {
        throw unsupported(`${name}()`, line, name === "printf" ? "Use cout instead." : "Use cin instead.");
      }
    }
    if (this.isTypeStart()) return this.parseDeclaration();

    const e = this.parseExpr();
    this.expect(";");
    return { k: "expr", e, line };
  }

  private parseIf(): Stmt {
    const line = this.advance().line;
    this.expect("(");
    const c = this.parseExpr();
    this.expect(")");
    const then = this.parseBody();
    let els: Stmt[] | null = null;
    if (this.match("else")) els = this.is("if") ? [this.parseIf()] : this.parseBody();
    return { k: "if", c, then, else: els, line };
  }

  private parseFor(): Stmt {
    const line = this.advance().line;
    this.expect("(");
    if (this.stl && this.isTypeStart()) {
      // `for (int x : nums)`, `for (auto& x : nums)`
      const save = this.pos;
      const type = this.parseDeclType(this.parseBaseType());
      if (this.isIdent() && this.is(":", 1)) {
        const name = this.advance().value;
        this.advance(); // :
        const e = this.parseExpr();
        this.expect(")");
        return { k: "rangeFor", type, name, e, body: this.parseBody(), line };
      }
      this.pos = save;
    }
    let init: Stmt | null = null;
    if (!this.match(";")) {
      if (this.isTypeStart()) init = this.parseDeclaration();
      else { const e = this.parseExpr(); this.expect(";"); init = { k: "expr", e, line }; }
    }
    const c = this.is(";") ? null : this.parseExpr();
    this.expect(";");
    const update = this.is(")") ? null : this.parseExpr();
    this.expect(")");
    return { k: "for", init, c, update, body: this.parseBody(), line };
  }

  private parseSwitch(): Stmt {
    const line = this.advance().line;
    this.expect("(");
    const e = this.parseExpr();
    this.expect(")");
    this.expect("{");
    const cases: SwitchCase[] = [];
    while (!this.is("}")) {
      const t = this.peek();
      let value: Expr | null = null;
      if (this.match("case")) value = this.parseTernary();
      else if (!this.match("default")) throw parseError(`expected "case" or "default" inside the switch but found ${describeToken(t)}.`, t.line);
      this.expect(":");
      const body: Stmt[] = [];
      while (!this.is("case") && !this.is("default") && !this.is("}")) {
        if (this.peek().type === "eof") throw parseError("this switch is never closed.", line);
        body.push(this.parseStatement());
      }
      cases.push({ value, body, line: t.line });
    }
    this.advance();
    return { k: "switch", e, cases, line };
  }

  private parseCout(): Stmt {
    const line = this.advance().line; // cout
    const parts: Expr[] = [];
    while (this.match("<<")) {
      this.skipStd();
      if (this.isIdent() && this.peek().value === "endl") {
        const t = this.advance();
        parts.push({ k: "string", v: "\n", line: t.line });
        continue;
      }
      parts.push(this.parseTernary());
    }
    this.expect(";");
    return { k: "cout", parts, line };
  }

  /** `int x = 5, *p = nullptr;`, `Node n(5);`, `int a[3] = {1, 2, 3};`, `LinkedList list;` */
  private parseDeclaration(): Stmt {
    const line = this.peek().line;
    const base = this.parseBaseType();
    if (base === "void" && !this.is("*")) throw parseError("a variable cannot have the type void.", line);
    const items: Declarator[] = [];
    do {
      const type = this.parseDeclType(base);
      const id = this.expectIdent("a variable name");
      if (type.ref) throw unsupported("A reference variable", id.line, "Reference parameters (Node*& head) are supported; use a pointer here.");
      const d: Declarator = { name: id.value, type, arraySize: null, arraySize2: null, init: null, ctorArgs: null, initList: null, initRows: null, line: id.line };
      if (this.match("[")) {
        d.arraySize = this.is("]") ? null : this.parseExpr();
        this.expect("]");
        if (this.match("[")) {
          d.arraySize2 = this.parseExpr();
          this.expect("]");
          if (this.is("[")) throw unsupported("An array with more than two dimensions", id.line);
        }
        if (this.match("=")) {
          this.expect("{");
          if (d.arraySize2 && this.is("{")) {
            d.initRows = [];
            do {
              if (this.is("}")) break; // trailing comma
              this.expect("{");
              d.initRows.push(this.is("}") ? [] : this.parseArgList("}"));
              this.expect("}");
            } while (this.match(","));
          } else {
            d.initList = this.is("}") ? [] : this.parseArgList("}");
            if (d.arraySize2 && d.initList.length > 0) throw unsupported("Filling a two-dimensional array from a flat list", id.line, "Write one {...} per row.");
          }
          this.expect("}");
        }
        if (d.arraySize === null && d.initList === null && d.initRows === null) throw parseError(`the array "${d.name}" needs a size.`, id.line);
      } else if (this.match("=")) {
        if (this.is("{")) {
          if (!this.isListName(type)) throw unsupported("Brace initialisation of an object", id.line);
          this.advance();
          d.initList = this.parseArgList("}");
          this.expect("}");
        } else {
          d.init = this.parseAssignment();
        }
      } else if (this.is("(")) {
        this.advance();
        d.ctorArgs = this.parseArgs();
      } else if (this.is("{")) {
        if (!this.isListName(type)) throw unsupported("Brace initialisation", id.line, "Use = or ( ) instead.");
        this.advance();
        d.initList = this.parseArgList("}");
        this.expect("}");
      }
      if (type.base === "auto" && d.init === null && (d.ctorArgs?.length ?? 0) !== 1) {
        throw parseError(`"auto ${d.name}" needs a starting value, such as auto ${d.name} = nums.begin();`, id.line);
      }
      if (type.base === "auto" && (d.arraySize !== null || d.initList !== null)) throw parseError("an array cannot be declared auto.", id.line);
      items.push(d);
    } while (this.match(","));
    this.expect(";");
    return { k: "decl", items, line };
  }

  /** `list<int> nums` (not a pointer to one): may be filled with `= {1, 2, 3}`. */
  private isListName(type: TypeRef): boolean {
    return type.ptr === 0 && this.classes.get(type.base)?.builtin?.kind === "list";
  }

  // ---- expressions ---------------------------------------------------------

  private parseArgList(close: string): Expr[] {
    const args: Expr[] = [];
    if (this.is(close)) return args;
    do args.push(this.parseAssignment()); while (this.match(","));
    return args;
  }
  /** Arguments up to and including the closing parenthesis. */
  private parseArgs(): Expr[] {
    const args = this.parseArgList(")");
    this.expect(")");
    return args;
  }

  parseExpr(): Expr {
    const e = this.parseAssignment();
    if (this.is(",")) throw unsupported("The comma operator", this.peek().line, "Write two statements instead.");
    return e;
  }

  private parseAssignment(): Expr {
    const left = this.parseTernary();
    const t = this.peek();
    if (t.type === "punct" && ASSIGN_OPS.has(t.value)) {
      this.advance();
      const value = this.parseAssignment(); // right associative: head = tail = n
      return { k: "assign", op: t.value as AssignOp, target: left, value, line: t.line };
    }
    return left;
  }

  private parseTernary(): Expr {
    const c = this.parseBinary(0);
    if (this.is("?")) {
      const line = this.advance().line;
      const a = this.parseAssignment();
      this.expect(":");
      const b = this.parseAssignment();
      return { k: "ternary", c, a, b, line };
    }
    return c;
  }

  private static LEVELS: string[][] = [["||"], ["&&"], ["==", "!="], ["<", ">", "<=", ">="], ["+", "-"], ["*", "/", "%"]];

  private parseBinary(level: number): Expr {
    if (level >= Parser.LEVELS.length) return this.parseUnary();
    let left = this.parseBinary(level + 1);
    for (;;) {
      const t = this.peek();
      if (t.type !== "punct" || !Parser.LEVELS[level].includes(t.value)) break;
      this.advance();
      const right = this.parseBinary(level + 1);
      left = { k: "binary", op: t.value as BinaryOp, l: left, r: right, line: t.line };
    }
    if (level === 0) {
      const t = this.peek();
      if (t.type === "punct" && ["&", "|", "^", ">>"].includes(t.value)) throw unsupported(`The bitwise operator ${t.value}`, t.line);
    }
    return left;
  }

  private parseUnary(): Expr {
    const t = this.peek();
    const line = t.line;
    if (t.type === "punct") {
      switch (t.value) {
        case "!": this.advance(); return { k: "unary", op: "!", e: this.parseUnary(), line };
        case "-": this.advance(); return { k: "unary", op: "-", e: this.parseUnary(), line };
        case "+": this.advance(); return { k: "unary", op: "+", e: this.parseUnary(), line };
        case "*": this.advance(); return { k: "deref", e: this.parseUnary(), line };
        case "&": this.advance(); return { k: "addr", e: this.parseUnary(), line };
        case "++": this.advance(); return { k: "incdec", prefix: true, delta: 1, target: this.parseUnary(), line };
        case "--": this.advance(); return { k: "incdec", prefix: true, delta: -1, target: this.parseUnary(), line };
        case "~": throw unsupported("The bitwise operator ~", line);
      }
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let e = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      const line = t.line;
      if (this.is("->") || this.is(".")) {
        const arrow = this.advance().value === "->";
        const name = this.expectIdent("a member name").value;
        if (this.match("(")) e = { k: "mcall", obj: e, arrow, method: name, args: this.parseArgs(), line };
        else e = { k: "member", obj: e, field: name, arrow, line };
      } else if (this.match("[")) {
        const idx = this.parseExpr();
        this.expect("]");
        e = { k: "index", arr: e, idx, line };
      } else if (this.is("(") && e.k === "var") {
        this.advance();
        e = { k: "call", name: e.name, args: this.parseArgs(), line: e.line };
      } else if (this.match("++")) {
        e = { k: "incdec", prefix: false, delta: 1, target: e, line };
      } else if (this.match("--")) {
        e = { k: "incdec", prefix: false, delta: -1, target: e, line };
      } else break;
    }
    return e;
  }

  private parsePrimary(): Expr {
    this.skipStd();
    const t = this.peek();
    const line = t.line;
    switch (t.type) {
      case "int": this.advance(); return { k: "int", v: parseInt(t.value, 10), line };
      case "float": this.advance(); return { k: "float", v: parseFloat(t.value), line };
      case "char": this.advance(); return { k: "char", v: t.value, line };
      case "string": {
        this.advance();
        let v = t.value;
        while (this.peek().type === "string") v += this.advance().value; // "a" "b"
        return { k: "string", v, line };
      }
      case "ident":
        if (this.typeNames.has(t.value) && this.is("(", 1)) {
          throw unsupported(`Creating a temporary ${t.value}(...) object`, line, `Declare a variable or use new ${t.value}(...).`);
        }
        if (this.is("<", 1) && this.isTypeStart(2)) {
          throw unsupported(`"${t.value}<...>" (a template or a standard-library container)`, line,
            this.stl
              ? "Of the standard containers, HeapHop supports std::list. Other structures can be built with struct or class and pointers."
              : "HeapHop shows structures you build yourself with struct or class and pointers.");
        }
        this.advance();
        return { k: "var", name: t.value, line };
      case "keyword":
        switch (t.value) {
          case "nullptr": case "NULL": this.advance(); return { k: "null", line };
          case "true": this.advance(); return { k: "bool", v: true, line };
          case "false": this.advance(); return { k: "bool", v: false, line };
          case "this": this.advance(); return { k: "this", line };
          case "new": return this.parseNew();
        }
        if (UNSUPPORTED_KEYWORDS[t.value]) this.rejectKeyword(t);
        if (BUILTIN_TYPES.has(t.value)) throw unsupported(`A cast such as ${t.value}(...)`, line);
        break;
      case "punct":
        if (t.value === "(") {
          if (this.isTypeStart(1)) throw unsupported("A type cast", line);
          this.advance();
          const e = this.parseExpr();
          this.expect(")");
          return e;
        }
        break;
    }
    throw parseError(`did not expect ${describeToken(t)} here.`, line);
  }

  private parseNew(): Expr {
    const line = this.advance().line;
    const base = this.parseBaseType();
    let ptr = 0;
    while (this.match("*")) ptr++;
    if (this.match("[")) {
      const size = this.parseExpr();
      this.expect("]");
      return { k: "newArray", elem: { base, ptr, ref: false }, size, line };
    }
    if (ptr > 0) throw unsupported("new for a single pointer", line);
    if (this.match("(")) return { k: "new", type: base, args: this.parseArgs(), parens: true, line };
    if (this.is("{")) throw unsupported("Brace initialisation after new", line, "Use ( ) instead.");
    return { k: "new", type: base, args: [], parens: false, line };
  }
}

export function parse(tokens: Token[], options: ParseOptions = {}): Program {
  return new Parser(tokens, options).parseProgram();
}
