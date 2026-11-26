// Parser: tokens in, Program out. Recursive descent over the supported C++ subset.
// Anything outside the subset raises a SourceError that names the construct and
// its line (rule 7: a readable error, never a wrong picture).
import { describeToken, type Token } from "./tokens";
import { parseError, unsupported } from "./errors";
import { STD_TEMPLATES, templateName, TypeTable } from "./typetable";
import { tokenize } from "./tokenizer";
import { typeText } from "./ast";
import type {
  AssignOp, BinaryOp, ClassDef, Declarator, Expr, Field, FuncDef, MemberInit, Param, Program,
  Stmt, SwitchCase, TypeRef,
} from "./ast";

/** What the parser may accept beyond the core subset. */
export interface ParseOptions {
  /** The VS Code extension's larger C++ (std::list and the STL, templates, exceptions...). Off on the website. */
  extended?: boolean;
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

/** Keywords the extended mode understands, so they are not rejected there. */
const EXTENDED_KEYWORDS = new Set(["auto", "static", "sizeof", "enum", "try", "catch", "throw", "virtual", "template", "typename", "inline"]);

/** The standard exceptions, each with the class it derives from. */
export const STD_EXCEPTIONS: Record<string, string | null> = {
  exception: null,
  logic_error: "exception", runtime_error: "exception", bad_alloc: "exception",
  out_of_range: "logic_error", invalid_argument: "logic_error", length_error: "logic_error", domain_error: "logic_error",
  overflow_error: "runtime_error", underflow_error: "runtime_error", range_error: "runtime_error",
};

/** Integer type names from <cstdint> and <cstddef>, as the extended mode names them. */
const INT_ALIASES: Record<string, string> = {
  size_t: "size_t", ptrdiff_t: "long", int64_t: "long long", uint64_t: "unsigned long long",
  int32_t: "int", uint32_t: "unsigned int", int16_t: "short", uint16_t: "unsigned short",
};

/** `unsigned long long`, `long`, `short`... in the extended mode, where each keeps its own width. */
function integerTypeName(words: string[]): string {
  if (words.includes("double")) return "double";
  if (words.includes("float")) return "float";
  if (words.includes("bool")) return "bool";
  if (words.includes("void")) return "void";
  if (words.includes("char")) return "char";
  const unsigned = words.includes("unsigned");
  const longs = words.filter((w) => w === "long").length;
  if (words.includes("short")) return unsigned ? "unsigned short" : "short";
  if (longs >= 2) return unsigned ? "unsigned long long" : "long long";
  if (longs === 1) return unsigned ? "unsigned long" : "long";
  return unsigned ? "unsigned int" : "int";
}

class Parser {
  private pos = 0;
  /** Names that start a declaration: built-ins plus every struct / class in the file. */
  private typeNames = new Set<string>(["string"]);
  private classes = new Map<string, ClassDef>();
  /** File-level integer constants (`const int MAX = 100;`), usable as array sizes. */
  private consts = new Map<string, number>();
  /** std::list is switched on for this run. */
  private extended: boolean;
  /** `#include <list>` or `#include <bits/stdc++.h>` is present. */
  private listIncluded: boolean;
  /** `using namespace std;` or `using std::list;` is present, so plain `list` means std::list. */
  private listUnqualified: boolean;
  /** Name of the class whose body is being read (inside it, its own name is never ambiguous). */
  private currentClass: string | null = null;
  /** `typedef long long ll;`, `using ll = long long;`, `typedef Node* NodePtr;` (extended mode). */
  private aliases = new Map<string, TypeRef>();
  /** Alias definitions written with `using`, read the first time they are used. */
  private usingAliases = new Map<string, string>();
  /** Pointer stars an alias carries (`NodePtr` is `Node*`), added by the next parseDeclType. */
  private aliasPtr = 0;
  /** Enumerators and their values: `RED`, and also `Color::RED`. */
  private constants = new Map<string, number>();
  private enums = new Map<string, Map<number, string>>();
  /** Default argument values given in a prototype, for the definition that comes later. */
  private protoDefaults = new Map<string, (Expr | undefined)[]>();
  /** `virtual` and `static` written on a prototype in the class, for the definition outside it. */
  private protoFlags = new Map<string, { isVirtual: boolean; isStatic: boolean }>();
  /** File-level definitions of static members (`int Counter::count = 0;`). */
  private staticDefs: Stmt[] = [];
  /** Classes declared inside a class: `AVLTree` -> {`Node`}. Their full names are `AVLTree::Node`. */
  private nested = new Map<string, Set<string>>();
  /** Type parameters of the template being read (`T`), innermost last. */
  private tplParams: string[] = [];
  /** Names of function templates (`maxOf`), so `maxOf<int>(a, b)` is read as a call. */
  private templateFns = new Set<string>();
  /** Names of class templates (`Stack`). */
  private templateClasses = new Set<string>();

  constructor(private tokens: Token[], options: ParseOptions = {}) {
    this.extended = options.extended === true;
    const includes = options.includes ?? [];
    const usings = options.usings ?? [];
    this.listIncluded = includes.includes("<list>") || includes.includes("<bits/stdc++.h>");
    this.listUnqualified = usings.includes("using namespace std") || usings.includes("using std::list");
    if (this.extended) {
      this.classes = new TypeTable();
      // template <typename T> class Stack: Stack is a template wherever it is used
      for (let i = 0; i + 1 < tokens.length; i++) {
        if (tokens[i].value !== "template" || tokens[i + 1].value !== "<") continue;
        let depth = 0;
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].value === "<") depth++;
          else if (tokens[j].value === ">") depth--;
          else if (tokens[j].value === ">>") depth -= 2;
          if (depth <= 0) {
            if ((tokens[j + 1]?.value === "class" || tokens[j + 1]?.value === "struct") && tokens[j + 2]?.type === "ident") this.templateClasses.add(tokens[j + 2].value);
            break;
          }
        }
      }
      for (const name of Object.keys(INT_ALIASES)) this.typeNames.add(name);
      for (const [name, base] of Object.entries(STD_EXCEPTIONS)) {
        this.typeNames.add(name);
        this.classes.set(name, {
          name, fields: [{ type: { base: "string", ptr: 0, ref: false }, name: "message", arraySize: null, arraySize2: null, init: null, line: 0 }],
          ctors: [], dtor: null, methods: [], line: 0, builtin: { kind: "exception" }, ...(base ? { bases: [base] } : {}),
        });
      }
      for (const u of usings) {
        const m = /^using (\w+) = (.+)$/.exec(u);
        if (m) { this.usingAliases.set(m[1], m[2]); this.typeNames.add(m[1]); }
      }
      // typedef long long ll;  typedef Node* NodePtr;  (the name is the last word before ";")
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== "keyword" || tokens[i].value !== "typedef") continue;
        let depth = 0;
        for (let j = i + 1; j < tokens.length; j++) {
          const v = tokens[j].value;
          if (v === "{") depth++;
          else if (v === "}") depth--;
          else if (v === ";" && depth === 0) { if (tokens[j - 1].type === "ident") this.typeNames.add(tokens[j - 1].value); break; }
        }
      }
      for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i].type === "keyword" && tokens[i].value === "enum") {
          const n = tokens[i + 1].type === "ident" ? tokens[i + 1] : tokens[i + 2];
          if (n?.type === "ident" && n.value !== "class" && n.value !== "struct") this.typeNames.add(n.value);
        }
      }
    }
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
    if (this.isIdent() && this.peek().value === "std" && this.is("::", 1) && !(this.extended && this.isListAt(0))) this.pos += 2;
  }

  // ---- types ---------------------------------------------------------------

  private isTypeStart(offset = 0): boolean {
    const t = this.peek(offset);
    if (this.extended && this.isListAt(offset)) return true;
    if (this.extended && t.type === "ident" && t.value === "constexpr") return true;
    if (this.extended && t.type === "keyword" && t.value === "typename") return true;
    if (this.extended && this.isTemplateAt(offset)) return true;
    if (t.type === "keyword") {
      if (BUILTIN_TYPES.has(t.value) || t.value === "const") return true;
      if (t.value === "auto" && this.extended) return true;
      if (t.value === "struct" || t.value === "class") return this.isIdent(offset + 1) && !this.is("{", offset + 2) && !this.is(":", offset + 2);
      return false;
    }
    if (t.type === "ident") {
      if (t.value === "std" && this.is("::", offset + 1)) return this.typeNames.has(this.peek(offset + 2).value);
      if (this.extended && this.is("::", offset + 1) && this.nestedType(t.value, this.peek(offset + 2).value)) return true;
      if (this.extended && this.is("::", offset + 1)) return false; // Shape::describe(), Counter::count
      return this.typeNames.has(t.value);
    }
    return false;
  }

  /** `Inner` declared inside the class `outer`: its full name, or null. */
  private nestedType(outer: string, inner: string): string | null {
    return this.nested.get(outer)?.has(inner) ? `${outer}::${inner}` : null;
  }

  /**
   * The full name a type name stands for here. Inside `AVLTree` (its body and its methods),
   * `Node` means `AVLTree::Node`; elsewhere a class's own name stands for itself.
   */
  private resolveType(name: string, line: number): string {
    for (let scope = this.currentClass; scope; ) {
      const full = this.nestedType(scope, name);
      if (full) return full;
      const cut = scope.lastIndexOf("::");
      scope = cut < 0 ? null : scope.slice(0, cut);
    }
    if (!this.classes.has(name) && !this.enums.has(name) && this.extended) {
      const owners = [...this.nested].filter(([, inner]) => inner.has(name)).map(([outer]) => outer);
      if (owners.length > 0 && !this.typeNames.has(`::${name}`)) {
        throw parseError(`"${name}" is declared inside ${owners[0]}, so outside it write ${owners[0]}::${name}.`, line);
      }
    }
    return name;
  }

  /** `vector<`, `std::map<`, `Stack<` (a class template of the program) starts at this offset. */
  private isTemplateAt(offset: number): boolean {
    let t = this.peek(offset);
    if (t.type === "ident" && t.value === "std" && this.is("::", offset + 1)) { offset += 2; t = this.peek(offset); }
    if (t.type !== "ident" || !this.is("<", offset + 1)) return false;
    if (this.templateClasses.has(t.value)) return true;
    return Object.hasOwn(STD_TEMPLATES, t.value) && !this.typeNames.has(t.value);
  }

  /**
   * `vector<int>`, `map<string, int>`, `priority_queue<int, vector<int>, greater<int>>`,
   * `Stack<T>`. `vector<int>::iterator` is a pointer to an element (the alias-pointer count
   * carries the star).
   */
  private parseTemplateType(): string {
    if (this.peek().value === "std") this.pos += 2;
    const id = this.advance();
    this.expect("<");
    const args: TypeRef[] = [];
    while (!this.is(">") && !this.is(">>")) {
      if (this.peek().type === "int") throw unsupported("A template argument that is a number", id.line);
      const base = this.parseBaseType();
      let ptr = this.takeAliasPtr();
      while (this.match("*")) ptr++;
      args.push({ base, ptr, ref: false });
      if (!this.match(",")) break;
    }
    this.expectClose();
    const known = STD_TEMPLATES[id.value];
    if (known && !this.templateClasses.has(id.value)) {
      const [min, max] = known;
      if (args.length < min || args.length > max) throw parseError(`${id.value}<...> needs ${min === max ? min : `${min} to ${max}`} type argument${max === 1 ? "" : "s"}.`, id.line);
    }
    // greater<> (no type) compares like greater<T> for the element type
    const name = args.length === 0 ? `${id.value}<>` : templateName(id.value, args);
    if (this.match("::")) {
      const member = this.expectIdent("a member type such as iterator");
      const kind = id.value;
      if (member.value === "iterator" || member.value === "const_iterator") {
        if (!["vector", "deque", "map", "set"].includes(kind)) throw unsupported(`${kind}<...>::${member.value}`, member.line);
        const elem = kind === "map" ? { base: templateName("pair", args.slice(0, 2)), ptr: 0, ref: false } : args[0];
        this.aliasPtr += elem.ptr + 1;
        return elem.base;
      }
      if (this.nested.get(name)?.has(member.value)) return `${name}::${member.value}`; // AVLTree<T>::Node
      if (member.value === "size_type") return "unsigned long";
      if (member.value === "value_type") { this.aliasPtr += args[0].ptr; return args[0].base; }
      throw unsupported(`${kind}<...>::${member.value}`, member.line);
    }
    return name;
  }

  /** `template <typename T, class U>`: the parameter names, now in scope as types. */
  private parseTemplateHeader(): string[] {
    const line = this.advance().line; // template
    this.expect("<");
    const params: string[] = [];
    while (!this.is(">")) {
      if (!(this.match("typename") || this.match("class"))) throw unsupported("A template parameter that is not a type (template <int N>)", line, "Use template <typename T>.");
      const id = this.expectIdent("a template parameter name");
      if (this.is("=")) throw unsupported("A default template argument", line);
      params.push(id.value);
      if (!this.match(",")) break;
    }
    this.expect(">");
    if (params.length === 0) throw unsupported("A template specialisation (template <>)", line);
    return params;
  }

  /** Read `read` with the template parameters in scope as type names. */
  private withParams<T>(params: string[], read: () => T): T {
    const added = params.filter((p) => !this.typeNames.has(p));
    for (const p of added) this.typeNames.add(p);
    this.tplParams.push(...params);
    try { return read(); } finally {
      this.tplParams.splice(this.tplParams.length - params.length, params.length);
      for (const p of added) this.typeNames.delete(p);
    }
  }

  /**
   * After `template <...>` at file level: a class template, a function template, or a
   * method of a class template defined outside it (`void Stack<T>::push(T x)`).
   */
  private parseTemplate(functions: FuncDef[]) {
    const line = this.peek().line;
    const params = this.parseTemplateHeader();
    this.withParams(params, () => {
      if ((this.is("struct") || this.is("class")) && this.isIdent(1)) {
        const name = this.peek(1).value;
        this.templateClasses.add(name);
        this.parseClass(false, params);
        return;
      }
      // Stack<T>::Stack(...), Stack<T>::~Stack()
      if (this.isIdent() && this.templateClasses.has(this.peek().value) && this.is("<", 1)) {
        const save = this.pos;
        const owner = this.advance().value;
        this.skipAngles();
        if (this.match("::")) {
          const none: TypeRef = { base: "void", ptr: 0, ref: false };
          const outer = this.currentClass;
          this.currentClass = `${owner}<${params.join(", ")}>`;
          try {
            if (this.match("~")) {
              const id = this.expectIdent("the class name after ~");
              const f = this.parseFunctionRest(none, "~" + id.value, owner, "dtor", id.line);
              if (f) functions.push(f);
              return;
            }
            if (this.isIdent() && this.peek().value === owner && this.is("(", 1)) {
              const id = this.advance();
              const f = this.parseFunctionRest(none, owner, owner, "ctor", id.line);
              if (f) functions.push(f);
              return;
            }
          } finally { this.currentClass = outer; }
        }
        this.pos = save;
      }
      this.skipQualifiers();
      while (this.is("static") || this.is("inline")) this.advance();
      const base = this.parseBaseType();
      const type = this.parseDeclType(base);
      if (this.isIdent() && this.templateClasses.has(this.peek().value) && this.is("<", 1)) {
        // void Stack<T>::push(T x)
        const owner = this.advance().value;
        this.skipAngles();
        this.expect("::");
        const m = this.expectIdent("a method name");
        const outer = this.currentClass;
        this.currentClass = `${owner}<${params.join(", ")}>`;
        try {
          const f = this.parseFunctionRest(type, m.value, owner, "method", m.line);
          if (f) functions.push(f);
        } finally { this.currentClass = outer; }
        return;
      }
      if (!(this.isIdent() && this.is("(", 1))) throw unsupported("This kind of template", line, "Templates of classes and of functions are supported.");
      const id = this.advance();
      this.templateFns.add(id.value);
      const f = this.parseFunctionRest(type, id.value, null, "function", id.line);
      if (f) { f.typeParams = params; functions.push(f); }
    });
  }

  /** Is the class template `name` the one being read (its body or one of its methods)? */
  private insideTemplate(name: string): boolean {
    return this.tplParams.length > 0 && !!this.currentClass && (this.currentClass === name || this.currentClass.startsWith(`${name}<`));
  }

  /** Skip a `<...>` written after a template's name where only the name matters. */
  private skipAngles() {
    this.expect("<");
    let depth = 1;
    while (depth > 0) {
      const t = this.advance();
      if (t.type === "eof") throw parseError("this < is never closed with >.", t.line);
      if (t.value === "<") depth++;
      else if (t.value === ">") depth--;
      else if (t.value === ">>") depth -= 2;
    }
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
    const elemName = t.type === "ident" && t.value === "std" && this.is("::", 1) ? this.peek(2) : t;
    if (elemName.type === "ident" && !this.typeNames.has(elemName.value) && this.is("<", elemName === t ? 1 : 3)) {
      throw unsupported(`A list of ${elemName.value}<...>`, t.line, elemName.value === "pair" ? "Use a struct with two fields instead, for example struct Edge { int u; int v; };" : "Use a list of a struct or class of your own.");
    }
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

  /** Run `read` over other tokens (an alias written with `using`), then come back. */
  private withTokens<T>(tokens: Token[], read: () => T): T {
    const [savedTokens, savedPos] = [this.tokens, this.pos];
    this.tokens = tokens;
    this.pos = 0;
    try { return read(); } finally { this.tokens = savedTokens; this.pos = savedPos; }
  }

  /** `const` and, in the extended mode, `constexpr`, `static`, `inline`, `mutable` and `volatile` before a type. */
  private skipQualifiers() {
    for (;;) {
      if (this.match("const")) continue;
      if (this.extended && this.isIdent() && ["constexpr", "mutable", "volatile"].includes(this.peek().value)) { this.advance(); continue; }
      if (this.extended && this.is("inline")) { this.advance(); continue; }
      break;
    }
  }

  /** Stars an alias brought along (`NodePtr` = `Node*`); read once by whoever counts the stars. */
  private takeAliasPtr(): number {
    const n = this.aliasPtr;
    this.aliasPtr = 0;
    return n;
  }

  /** Base type without pointer stars: `const unsigned int`, `struct Node`, `std::string`. */
  private parseBaseType(): string {
    this.skipQualifiers();
    const t = this.peek();
    let base: string;
    if (this.extended) this.match("typename");
    if (this.extended && this.isListAt(0)) {
      base = this.parseListType();
    } else if (this.extended && this.isTemplateAt(0)) {
      base = this.parseTemplateType();
    } else if (this.extended && this.isIdent() && this.templateClasses.has(t.value) && this.insideTemplate(t.value) && !this.is("<", 1)) {
      // Inside template <typename T> class Stack, plain `Stack` means Stack<T>.
      this.advance();
      base = `${t.value}<${this.tplParams.join(", ")}>`;
    } else if (this.extended && t.type === "keyword" && t.value === "auto") {
      this.advance();
      base = "auto";
    } else if (t.type === "keyword" && (t.value === "struct" || t.value === "class")) {
      this.advance();
      base = this.expectIdent("a type name").value;
    } else if (t.type === "keyword" && BUILTIN_TYPES.has(t.value)) {
      const words: string[] = [];
      while (this.peek().type === "keyword" && BUILTIN_TYPES.has(this.peek().value)) words.push(this.advance().value);
      if (this.extended) base = integerTypeName(words);
      else {
        const core = words.filter((w) => !["unsigned", "signed", "long", "short"].includes(w));
        base = core[0] ?? "int"; // `unsigned`, `long long` ... are shown as int
      }
    } else if (this.extended && this.isIdent() && Object.hasOwn(INT_ALIASES, t.value)) {
      this.advance();
      base = INT_ALIASES[t.value];
    } else if (this.extended && this.isIdent() && (this.aliases.has(t.value) || this.usingAliases.has(t.value))) {
      this.advance();
      const alias = this.aliasFor(t.value, t.line);
      base = alias.base;
      this.aliasPtr += alias.ptr;
    } else if (this.extended && this.isIdent() && this.is("::", 1) && this.nestedType(t.value, this.peek(2).value)) {
      // AVLTree::Node
      this.advance(); this.advance();
      let full = `${t.value}::${this.advance().value}`;
      while (this.is("::") && this.isIdent(1) && this.nested.get(full)?.has(this.peek(1).value)) { this.advance(); full += `::${this.advance().value}`; }
      base = full;
    } else {
      const qualified = this.isIdent() && this.peek().value === "std" && this.is("::", 1);
      this.skipStd();
      const id = this.expectIdent("a type name");
      if (!this.typeNames.has(id.value)) throw parseError(`"${id.value}" is not a type HeapHop knows.`, id.line);
      if (id.value === "list" && !qualified && this.extended && this.listIncluded && this.listUnqualified && this.currentClass !== "list") {
        throw parseError(`"list" is ambiguous: this file defines its own list, and using namespace std; also brings in std::list. Rename your class (for example to List).`, id.line);
      }
      base = this.extended ? this.resolveType(id.value, id.line) : id.value;
      if (this.is("<")) throw unsupported("A template type such as " + base + "<...>", id.line);
    }
    while (this.match("const")) { /* e.g. `int const` */ }
    return base;
  }

  /** The type an alias stands for; a `using` alias is read the first time it is needed. */
  private aliasFor(name: string, line: number): TypeRef {
    const known = this.aliases.get(name);
    if (known) return known;
    const text = this.usingAliases.get(name)!;
    this.usingAliases.delete(name); // a self-referring alias cannot loop
    const type = this.withTokens(tokenize(`${text};`, undefined, true), () => {
      const base = this.parseBaseType();
      let ptr = this.takeAliasPtr();
      while (this.match("*")) ptr++;
      return { base, ptr, ref: false };
    });
    if (!type) throw parseError(`the alias "${name}" could not be read.`, line);
    this.aliases.set(name, type);
    return type;
  }

  /** Pointer stars and a reference mark that belong to one declarator: the `*&` of `Node*& head`. */
  private parseDeclType(base: string): TypeRef {
    let ptr = this.takeAliasPtr();
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
      if (this.extended && this.is("enum")) { this.parseEnum(); continue; }
      if (this.extended && (this.is("inline") || this.is("static"))) { this.advance(); continue; }
      if (t.type === "keyword" && UNSUPPORTED_KEYWORDS[t.value] && t.value !== "sizeof" && !(this.extended && EXTENDED_KEYWORDS.has(t.value))) this.rejectKeyword(t);

      if (this.is("typedef")) { this.parseTypedef(); continue; }
      if (this.extended && this.is("template")) { this.parseTemplate(functions); continue; }
      if ((this.is("struct") || this.is("class")) && this.isIdent(1) && (this.is("{", 2) || this.is(":", 2) || this.is(";", 2))) {
        this.parseClass(false);
        continue;
      }
      // Out-of-class constructor / destructor: `LinkedList::LinkedList() {...}`, `LinkedList::~LinkedList()`
      if (this.isIdent() && this.classes.has(t.value) && this.is("::", 1) && !(this.extended && this.nestedType(t.value, this.peek(2).value))) {
        functions.push(this.parseOutOfClassSpecial());
        continue;
      }
      if (this.isTypeStart()) {
        const save = this.pos;
        const base = this.parseBaseType();
        const type = this.parseDeclType(base);
        // `int f(int x)` / `int f()` is a function; `Node n(5);` is a variable with constructor arguments.
        if (this.extended && this.is("operator")) {
          // bool operator<(const Edge& a, const Edge& b)
          const op = this.parseOperatorName();
          const f = this.parseFunctionRest(type, op.name, null, "function", op.line);
          if (f) functions.push(f);
          continue;
        }
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
      const tpl = this.classes instanceof TypeTable ? this.classes.templates.get(f.className) : undefined;
      const cls = tpl ?? this.classes.get(f.className);
      if (!cls) throw parseError(`"${f.className}" is not a class in this file.`, f.line);
      if (f.kind === "ctor") cls.ctors.push(f);
      else if (f.kind === "dtor") cls.dtor = f;
      else cls.methods.push(f);
    }

    if (this.classes instanceof TypeTable) {
      // A class template used before all its methods were read is made again when first used.
      for (const name of [...this.classes.keys()]) {
        const cut = name.indexOf("<");
        if (cut > 0 && this.classes.templates.has(name.slice(0, cut))) this.classes.delete(name);
      }
    }
    const hasMain = free.some((f) => f.name === "main");
    if (hasMain && loose.length > 0) {
      throw parseError("this statement is outside any function. Move it inside main().", loose[0].line);
    }
    globals.push(...this.staticDefs);
    globals.sort((a, b) => a.line - b.line);
    const program: Program = {
      classes: this.classes,
      functions: free,
      globals: hasMain ? globals : [],
      // Snippet style (no main): file-level declarations and statements run top to bottom.
      topLevel: hasMain ? [] : [...globals, ...loose].sort((a, b) => a.line - b.line),
    };
    if (this.extended) {
      program.constants = this.constants;
      program.enums = this.enums;
    }
    return program;
  }

  private parseTypedef() {
    const start = this.advance(); // typedef
    if (this.extended && !(this.is("struct") || this.is("class"))) {
      // typedef long long ll;   typedef Node* NodePtr;   typedef vector<int> VI;
      const base = this.parseBaseType();
      let ptr = this.takeAliasPtr();
      while (this.match("*")) ptr++;
      const name = this.expectIdent("the new type name");
      this.expect(";");
      this.aliases.set(name.value, { base, ptr, ref: false });
      this.typeNames.add(name.value);
      return;
    }
    if (!(this.is("struct") || this.is("class"))) {
      throw unsupported("This kind of typedef", start.line, "Only `typedef struct { ... } Name;` is supported.");
    }
    this.parseClass(true);
  }

  /** `enum Color { RED, GREEN = 5, BLUE };` and `enum class Dir { Up, Down };` (extended mode). */
  private parseEnum(scope: string | null = null) {
    const kw = this.advance(); // enum
    const scoped = this.match("class") || this.match("struct");
    const name = this.isIdent() ? this.advance().value : null;
    if (this.match(":")) this.parseBaseType(); // enum Color : int
    if (this.match(";")) return; // declared only
    this.expect("{");
    const byValue = new Map<number, string>();
    let next = 0;
    while (!this.is("}")) {
      const id = this.expectIdent("an enumerator name");
      if (this.match("=")) next = this.constantValue(this.parseTernary(), id.line);
      const qualified = name ? `${scope ? `${scope}::` : ""}${name}::${id.value}` : null;
      if (!scoped) this.constants.set(scope ? `${scope}::${id.value}` : id.value, next);
      if (!scoped && scope) this.constants.set(id.value, next);
      if (qualified) this.constants.set(qualified, next);
      if (!byValue.has(next)) byValue.set(next, id.value);
      next++;
      if (!this.match(",")) break;
    }
    this.expect("}");
    if (name) {
      const full = scope ? `${scope}::${name}` : name;
      this.enums.set(full, byValue);
      this.typeNames.add(name);
      if (scope) this.enums.set(name, byValue);
    } else if (this.isIdent()) {
      throw unsupported("Declaring a variable right after an enum", kw.line, "Declare it on its own line.");
    }
    this.expect(";");
  }

  /** The value of an enumerator or array size written as a constant expression. */
  private constantValue(e: Expr, line: number): number {
    switch (e.k) {
      case "int": return parseInt(String(e.v), 10);
      case "char": return e.v.charCodeAt(0);
      case "var": {
        const v = this.constants.get(e.name) ?? this.consts.get(e.name);
        if (v === undefined) throw parseError(`"${e.name}" is not a constant known at this point.`, line);
        return v;
      }
      case "unary": return e.op === "-" ? -this.constantValue(e.e, line) : this.constantValue(e.e, line);
      case "binary": {
        const [a, b] = [this.constantValue(e.l, line), this.constantValue(e.r, line)];
        switch (e.op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": if (b !== 0) return Math.trunc(a / b); break;
          case "%": if (b !== 0) return a % b; break;
        }
      }
    }
    throw parseError("this needs a whole-number constant.", line);
  }

  /** `struct Node { ... };`, `class LinkedList { ... };`, and the typedef form. */
  private parseClass(typedefForm: boolean, typeParams?: string[]) {
    const kw = this.advance(); // struct | class
    let name = this.isIdent() ? this.advance().value : "";
    const outerClass = this.currentClass;
    if (outerClass && name) {
      // A class inside a class: AVLTree::Node
      if (!this.nested.has(outerClass)) this.nested.set(outerClass, new Set());
      this.nested.get(outerClass)!.add(name);
      name = `${outerClass}::${name}`;
    } else if (name && this.extended) {
      this.typeNames.add(`::${name}`); // marks a class declared at file level
    }
    if (this.match(";")) return; // forward declaration
    let bases: string[] | undefined;
    if (this.is(":")) {
      if (!this.extended) throw unsupported("Inheritance", kw.line);
      this.advance();
      bases = [];
      do {
        while (this.is("public") || this.is("private") || this.is("protected") || this.is("virtual")) this.advance();
        const id = this.expectIdent("the name of the class it inherits from");
        const baseName = this.resolveType(id.value, id.line);
        if (!this.classes.has(baseName)) throw parseError(`"${id.value}" must be defined before a class can inherit from it.`, id.line);
        bases.push(baseName);
      } while (this.match(","));
      if (bases.length > 1) throw unsupported("Inheriting from more than one class", kw.line, "Inherit from one class only.");
    }
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
    if (outerClass) cls.shortName = name.slice(outerClass.length + 2);
    if (bases) {
      cls.bases = bases;
      // A Dog holds everything an Animal holds, first, then its own members.
      cls.fields.push(...this.classes.get(bases[0])!.fields);
    }
    this.classes.set(name, cls);
    this.expect("{");
    const outer = this.currentClass;
    // Inside template <typename T> class Stack, its nested classes are Stack<T>::Node.
    this.currentClass = typeParams ? `${name}<${typeParams.join(", ")}>` : name;
    const shortName = cls.shortName ?? name;

    while (!this.is("}")) {
      const t = this.peek();
      if (t.type === "eof") throw parseError(`"${name}" is missing its closing "}".`, kw.line);
      if (this.match(";")) continue;
      if (this.is("public") || this.is("private") || this.is("protected")) {
        this.advance();
        this.expect(":");
        continue;
      }
      if (this.extended) {
        if ((this.is("struct") || this.is("class")) && this.isIdent(1) && (this.is("{", 2) || this.is(":", 2) || this.is(";", 2))) {
          this.parseClass(false); // a class inside this class
          continue;
        }
        if (this.is("enum")) { this.parseEnum(name); continue; }
        if (this.is("friend")) this.rejectKeyword(t);
        if (this.is("typedef")) { this.parseTypedef(); continue; }
      }
      let isStatic = false;
      let isVirtual = false;
      while (this.extended && (this.is("static") || this.is("virtual") || this.is("inline") || (this.isIdent() && ["explicit", "constexpr", "mutable"].includes(this.peek().value)))) {
        const w = this.advance().value;
        if (w === "static") isStatic = true;
        if (w === "virtual") isVirtual = true;
      }
      const k = this.peek();
      if (k.type === "keyword" && UNSUPPORTED_KEYWORDS[k.value] && !(this.extended && EXTENDED_KEYWORDS.has(k.value))) this.rejectKeyword(k);

      if (this.is("~")) {
        this.advance();
        const id = this.expectIdent("the class name after ~");
        const f = this.parseFunctionRest({ base: "void", ptr: 0, ref: false }, "~" + id.value, name, "dtor", id.line);
        if (f) { cls.dtor = f; if (isVirtual) f.isVirtual = true; }
        continue;
      }
      if (this.isIdent() && this.peek().value === shortName && this.is("(", 1)) {
        const c = this.advance();
        const f = this.parseFunctionRest({ base: "void", ptr: 0, ref: false }, shortName, name, "ctor", c.line);
        if (f) cls.ctors.push(f);
        continue;
      }

      if (this.extended && this.is("template")) throw unsupported("A template method inside a class", t.line, "Make the whole class a template instead.");
      const base = this.parseBaseType();
      const first = this.parseDeclType(base);
      if (this.extended && this.is("operator")) {
        const op = this.parseOperatorName();
        const f = this.parseFunctionRest(first, op.name, name, "method", op.line, { isStatic, isVirtual });
        if (f) cls.methods.push(f);
        continue;
      }
      const id = this.expectIdent("a member name");
      if (this.is("(")) {
        const f = this.parseFunctionRest(first, id.value, name, "method", id.line, { isStatic, isVirtual });
        if (f) cls.methods.push(f);
        continue;
      }
      // One or more fields: `Node *head, *tail;`
      let type = first;
      let fieldName = id;
      for (;;) {
        const field = this.parseFieldRest(type, fieldName);
        if (isStatic) {
          (cls.statics ??= []).push(field);
          if (field.init?.k === "int") this.consts.set(field.name, field.init.v);
        } else {
          cls.fields.push(field);
        }
        if (!this.match(",")) break;
        type = this.parseDeclType(base);
        fieldName = this.expectIdent("a member name");
      }
      this.expect(";");
    }
    this.expect("}");
    this.currentClass = outer;
    if (this.classes instanceof TypeTable && (typeParams || (this.tplParams.length > 0 && name.includes("<")))) {
      // A template, or a class inside one: made for each set of types when it is used
      cls.typeParams = typeParams ?? [...this.tplParams];
      this.classes.delete(name);
      this.classes.templates.set(name, cls);
    }
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

  /** `operator<`, `operator()`, `operator==`... as a method name. */
  private parseOperatorName(): { name: string; line: number } {
    const kw = this.advance(); // operator
    if (this.match("(")) { this.expect(")"); return { name: "operator()", line: kw.line }; }
    const t = this.peek();
    const ops = ["<", ">", "<=", ">=", "==", "!=", "+", "-", "*", "/", "%", "<<", "+=", "-="];
    if (t.type === "punct" && ops.includes(t.value)) { this.advance(); return { name: `operator${t.value}`, line: kw.line }; }
    throw unsupported(`operator${t.value}`, kw.line, "Overloading < > <= >= == != + - * / % += -= () and << is supported.");
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
      let className = this.extended ? this.resolveType(id.value, id.line) : id.value;
      // AVLTree::Node::print(): a method of a nested class
      while (this.extended && this.isIdent() && this.is("::", 1) && this.nested.get(className)?.has(this.peek().value)) {
        className = `${className}::${this.advance().value}`;
        this.advance();
      }
      if (this.is("operator")) this.rejectKeyword(this.peek());
      const m = this.expectIdent("a method name");
      if (this.extended && !this.is("(")) {
        // `int Counter::count = 0;`: the definition of a static member
        this.pos -= 1;
        const line = m.line;
        const d: Declarator = { name: `${className}::${m.value}`, type: ret, arraySize: null, arraySize2: null, init: null, ctorArgs: null, initList: null, initRows: null, line };
        this.advance();
        if (this.match("[")) { if (!this.is("]")) d.arraySize = this.parseExpr(); this.expect("]"); }
        if (this.match("=")) d.init = this.parseAssignment();
        this.expect(";");
        this.staticDefs.push({ k: "decl", items: [d], line });
        return null;
      }
      const outer = this.currentClass;
      this.currentClass = className; // the class's own names (Node) are in scope in its methods
      try {
        return this.parseFunctionRest(ret, m.value, className, "method", m.line);
      } finally {
        this.currentClass = outer;
      }
    }
    return this.parseFunctionRest(ret, id.value, null, "function", id.line);
  }

  private parseOutOfClassSpecial(): FuncDef {
    const cls = this.advance(); // class name
    this.expect("::");
    if (this.extended) {
      const outer = this.currentClass;
      this.currentClass = cls.value;
      try { return this.parseOutOfClassSpecialRest(cls); } finally { this.currentClass = outer; }
    }
    return this.parseOutOfClassSpecialRest(cls);
  }

  private parseOutOfClassSpecialRest(cls: Token): FuncDef {
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
  private parseFunctionRest(
    ret: TypeRef, name: string, className: string | null, kind: FuncDef["kind"], line: number,
    flags: { isStatic?: boolean; isVirtual?: boolean } = {},
  ): FuncDef | null {
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
      let def: Expr | undefined;
      if (this.is("=")) {
        if (!this.extended) throw unsupported("A default argument value", this.peek().line);
        this.advance();
        def = this.parseAssignment();
      }
      params.push(def ? { type, name: pname, def } : { type, name: pname });
      if (!this.match(",")) break;
    }
    this.expect(")");
    this.match("const");
    let isPure = false;
    if (this.extended) {
      while (this.isIdent() && ["override", "final", "noexcept"].includes(this.peek().value)) this.advance();
      if (this.is("=") && this.peek(1).type === "int" && this.peek(1).value === "0") { this.advance(); this.advance(); isPure = true; }
      else if (this.is("=") && this.isIdent(1) && (this.peek(1).value === "default" || this.peek(1).value === "delete")) { this.advance(); this.advance(); }
      else if (this.is("=") && (this.is("default", 1) || this.is("delete", 1))) { this.advance(); this.advance(); }
    }

    // Defaults and `virtual` written on a prototype carry over to the definition.
    const key = `${className ?? ""}::${name}::${params.length}`;
    const proto = this.protoDefaults.get(key);
    if (proto) proto.forEach((d, i) => { if (d && !params[i].def) params[i] = { ...params[i], def: d }; });
    const protoFlags = this.protoFlags.get(key);
    const isVirtual = flags.isVirtual || protoFlags?.isVirtual || false;
    const isStatic = flags.isStatic || protoFlags?.isStatic || false;

    const inits: MemberInit[] = [];
    if (kind === "ctor" && this.match(":")) {
      do {
        const field = this.expectIdent("a member name");
        this.expect("(");
        const args = this.parseArgs();
        inits.push({ field: field.value, args, line: field.line });
      } while (this.match(","));
    }
    if (this.match(";")) {
      // prototype: the definition comes later
      if (params.some((p) => p.def)) this.protoDefaults.set(key, params.map((p) => p.def));
      if (isVirtual || isStatic) this.protoFlags.set(key, { isVirtual, isStatic });
      if (isPure) {
        // virtual void speak() = 0;  a method each derived class must provide
        return { name, className, kind, ret, params, inits, body: [], line, endLine: line, isVirtual: true, isPure: true };
      }
      return null;
    }
    const body = this.parseBlock();
    const endLine = this.tokens[this.pos - 1].line;
    const f: FuncDef = { name, className, kind, ret, params, inits, body, line, endLine };
    if (isVirtual) f.isVirtual = true;
    if (isStatic) f.isStatic = true;
    return f;
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
        case "static":
          if (this.extended) {
            this.advance();
            const decl = this.parseDeclaration();
            if (decl.k === "decl") for (const d of decl.items) d.isStatic = true;
            return decl;
          }
          break;
        case "try":
          if (this.extended) return this.parseTry();
          break;
        case "throw":
          if (this.extended) {
            this.advance();
            const e = this.is(";") ? null : this.parseExpr();
            this.expect(";");
            return { k: "throw", e, line };
          }
          break;
        case "enum":
          if (this.extended) { this.parseEnum(); return { k: "block", body: [], line }; }
          break;
      }
      if (UNSUPPORTED_KEYWORDS[t.value] && !(this.extended && EXTENDED_KEYWORDS.has(t.value))) {
        this.rejectKeyword(t);
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
        if (method === "clear" && this.extended) return { k: "expr", e: { k: "call", name: "cin.clear", args: [], line }, line };
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

  /** `try { ... } catch (const exception& e) { ... } catch (...) { ... }` */
  private parseTry(): Stmt {
    const line = this.advance().line; // try
    const body = this.parseBlock();
    const catches: Extract<Stmt, { k: "try" }>["catches"] = [];
    while (this.is("catch")) {
      const at = this.advance().line;
      this.expect("(");
      let type: TypeRef | null = null;
      let name: string | null = null;
      if (this.match("...")) {
        // catch (...) catches anything
      } else {
        type = this.parseDeclType(this.parseBaseType());
        if (this.isIdent()) name = this.advance().value;
      }
      this.expect(")");
      catches.push({ type, name, body: this.parseBlock(), line: at });
    }
    if (catches.length === 0) throw parseError("a try block needs at least one catch after it.", line);
    return { k: "try", body, catches, line };
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
    if (this.extended && this.isTypeStart()) {
      // `for (int x : nums)`, `for (auto& x : nums)`
      const save = this.pos;
      const type = this.parseDeclType(this.parseBaseType());
      if (type.base === "auto" && this.is("[")) {
        // for (auto& [key, value] : m)
        this.advance();
        const names: string[] = [];
        do names.push(this.expectIdent("a name").value); while (this.match(","));
        this.expect("]");
        this.expect(":");
        const e = this.parseExpr();
        this.expect(")");
        return { k: "rangeFor", type, name: `[${names.join(", ")}]`, e, body: this.parseBody(), line, bindings: names };
      }
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
      if (this.extended && base === "auto" && this.is("[")) {
        // auto [a, b] = p;
        const at = this.advance().line;
        const names: string[] = [];
        do names.push(this.expectIdent("a name").value); while (this.match(","));
        this.expect("]");
        const d: Declarator = { name: `[${names.join(", ")}]`, type, arraySize: null, arraySize2: null, init: null, ctorArgs: null, initList: null, initRows: null, line: at, bindings: names };
        if (this.match("=")) d.init = this.parseAssignment();
        else if (this.match("(")) { d.init = this.parseExpr(); this.expect(")"); }
        else throw parseError("a structured binding needs = and a value.", at);
        items.push(d);
        continue;
      }
      const id = this.expectIdent("a variable name");
      if (type.ref && !this.extended) throw unsupported("A reference variable", id.line, "Reference parameters (Node*& head) are supported; use a pointer here.");
      const d: Declarator = { name: id.value, type, arraySize: null, arraySize2: null, init: null, ctorArgs: null, initList: null, initRows: null, line: id.line };
      if (this.match("[")) {
        d.arraySize = this.is("]") ? null : this.parseExpr();
        this.expect("]");
        if (this.match("[")) {
          d.arraySize2 = this.parseExpr();
          this.expect("]");
          if (this.is("[")) throw unsupported("An array with more than two dimensions", id.line);
        }
        if (this.extended && this.is("=") && this.peek(1).type === "string") {
          // char word[] = "hello";  the characters and a '\0' at the end
          this.advance();
          const text = this.advance();
          let v = text.value;
          while (this.peek().type === "string") v += this.advance().value;
          d.initList = [...v, "\0"].map((c) => ({ k: "char" as const, v: c, line: text.line }));
        } else if (this.match("=")) {
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
        if (this.is("{") && this.extended && !this.isListName(type)) {
          d.init = this.parseBrace();
        } else if (this.is("{")) {
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
      } else if (this.is("{") && this.extended && !this.isListName(type)) {
        d.init = this.parseBrace();
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
      if (type.ref && d.init === null) throw parseError(`the reference "${d.name}" must be given a variable to refer to, such as int& ${d.name} = x;`, id.line);
      items.push(d);
    } while (this.match(","));
    this.expect(";");
    return { k: "decl", items, line };
  }

  /** `{1, 2, 3}` or `{{1, 2}, {3, 4}}` as a value whose type comes from where it goes. */
  private parseBrace(): Expr {
    const line = this.expect("{").line;
    const items = this.is("}") ? [] : this.parseArgList("}");
    this.match(","); // trailing comma
    this.expect("}");
    return { k: "brace", items, line };
  }

  /** `[](int a, int b) { return a > b; }`, `[&](int v) { ... }` */
  private parseLambda(): Expr {
    const line = this.advance().line; // [
    let depth = 1;
    while (depth > 0) {
      const t = this.advance();
      if (t.type === "eof") throw parseError("this [ is never closed.", line);
      if (t.value === "[") depth++;
      else if (t.value === "]") depth--;
    }
    const params: Param[] = [];
    if (this.match("(")) {
      while (!this.is(")")) {
        const type = this.parseDeclType(this.parseBaseType());
        const name = this.isIdent() ? this.advance().value : `arg${params.length + 1}`;
        params.push({ type, name });
        if (!this.match(",")) break;
      }
      this.expect(")");
    }
    while (this.isIdent() && ["mutable", "noexcept"].includes(this.peek().value)) this.advance();
    let ret: TypeRef = { base: "auto", ptr: 0, ref: false };
    if (this.match("->")) ret = this.parseDeclType(this.parseBaseType());
    const body = this.parseBlock();
    const endLine = this.tokens[this.pos - 1].line;
    return { k: "lambda", fn: { name: "lambda", className: null, kind: "function", ret, params, inits: [], body, line, endLine }, line };
  }

  /** A class declared anywhere in the file (it may not be parsed yet). */
  private isClassName(name: string): boolean {
    return this.typeNames.has(name) && !this.aliases.has(name) && !this.enums.has(name) && !Object.hasOwn(INT_ALIASES, name) && name !== "string";
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
      case "int": {
        this.advance();
        const v = parseInt(t.value, 10);
        return this.extended && (/[lLuU]/.test(t.value) || v > 2147483647) ? { k: "int", v, text: t.value, line } : { k: "int", v, line };
      }
      case "float": this.advance(); return { k: "float", v: parseFloat(t.value), line };
      case "char": this.advance(); return { k: "char", v: t.value, line };
      case "string": {
        this.advance();
        let v = t.value;
        while (this.peek().type === "string") v += this.advance().value; // "a" "b"
        return { k: "string", v, line };
      }
      case "ident":
        if (this.extended) {
          const special = this.parseExtendedPrimary(t);
          if (special) return special;
          if (this.templateFns.has(t.value) && this.is("<", 1)) {
            // maxOf<int>(a, b)
            const save = this.pos;
            this.advance(); this.advance();
            const targs: TypeRef[] = [];
            try {
              while (!this.is(">")) {
                const base = this.parseBaseType();
                let p = this.takeAliasPtr();
                while (this.match("*")) p++;
                targs.push({ base, ptr: p, ref: false });
                if (!this.match(",")) break;
              }
              this.expectClose();
            } catch { this.pos = save; }
            if (this.pos !== save && this.match("(")) return { k: "call", name: t.value, args: this.parseArgs(), templateArgs: targs, line };
            this.pos = save;
          }
          if (this.isTemplateAt(0)) {
            // vector<int>(5, 0), pair<int, int>(1, 2), greater<int>(), vector<int>{1, 2}
            const type = this.parseBaseType();
            if (this.takeAliasPtr() > 0) throw parseError("expected a value here, not an iterator type.", line);
            if (this.match("(")) return { k: "temp", type, args: this.parseArgs(), line };
            if (this.is("{")) { const b = this.parseBrace(); return { k: "temp", type, args: b.k === "brace" ? b.items : [], brace: true, line }; }
            throw parseError(`expected ( or { after ${type}.`, line);
          }
        }
        if (this.typeNames.has(t.value) && this.is("(", 1)) {
          if (this.extended && (this.classes.has(t.value) || this.isClassName(t.value))) {
            // Point(1, 2), runtime_error("stack is empty"): a temporary object
            const type = this.resolveType(t.value, line);
            this.advance(); this.advance();
            return { k: "temp", type, args: this.parseArgs(), line };
          }
          if (this.extended && !this.isClassName(t.value) || this.extended && (this.aliases.has(t.value) || this.usingAliases.has(t.value) || Object.hasOwn(INT_ALIASES, t.value))) {
            // string("abc"), ll(5), size_t(n): a conversion written like a call
            const base = this.parseBaseType();
            const ptrs = this.takeAliasPtr();
            this.expect("(");
            const e: Expr = this.is(")") ? (base === "string" ? { k: "string", v: "", line } : { k: "int", v: 0, line }) : this.parseExpr();
            this.expect(")");
            return { k: "cast", type: { base, ptr: ptrs, ref: false }, e, how: "functional", line };
          }
          if (this.extended && this.templateClasses.has(t.value) && this.insideTemplate(t.value)) {
            this.advance(); this.advance();
            return { k: "temp", type: `${t.value}<${this.tplParams.join(", ")}>`, args: this.parseArgs(), line };
          }
          throw unsupported(`Creating a temporary ${t.value}(...) object`, line, `Declare a variable or use new ${t.value}(...).`);
        }
        if (this.extended && this.typeNames.has(t.value) && this.is("{", 1) && this.classes.has(this.resolveType(t.value, line))) {
          // Point{1, 2}
          const type = this.resolveType(t.value, line);
          this.advance();
          const b = this.parseBrace();
          return { k: "temp", type, args: b.k === "brace" ? b.items : [], brace: true, line };
        }
        if (this.is("<", 1) && this.isTypeStart(2)) {
          throw unsupported(`"${t.value}<...>" (a template or a standard-library container)`, line,
            this.extended
              ? "Of the standard containers, HeapHop supports vector, list, deque, stack, queue, priority_queue, pair, map and set (use map instead of unordered_map, set instead of unordered_set)."
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
        if (this.extended && t.value === "sizeof") return this.parseSizeof();
        if (this.extended && BUILTIN_TYPES.has(t.value) && this.is("(", 1)) {
          // int(x), double(x): a cast written like a function call
          const base = this.parseBaseType();
          this.expect("(");
          const e = this.parseExpr();
          this.expect(")");
          return { k: "cast", type: { base, ptr: 0, ref: false }, e, how: "functional", line };
        }
        if (UNSUPPORTED_KEYWORDS[t.value] && !(this.extended && EXTENDED_KEYWORDS.has(t.value))) this.rejectKeyword(t);
        if (BUILTIN_TYPES.has(t.value)) throw unsupported(`A cast such as ${t.value}(...)`, line);
        break;
      case "punct":
        if (this.extended && t.value === "{") return this.parseBrace();
        if (this.extended && t.value === "[") return this.parseLambda();
        if (t.value === "(") {
          if (this.extended && this.isTypeStart(1)) {
            // (int)x, (double)sum / n, (Node*)p
            this.advance();
            const type = this.parseDeclType(this.parseBaseType());
            this.expect(")");
            return { k: "cast", type: { ...type, ref: false }, e: this.parseUnary(), how: "c", line };
          }
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

  /** sizeof(int), sizeof(arr), sizeof x */
  private parseSizeof(): Expr {
    const line = this.advance().line; // sizeof
    if (this.is("(") && this.isTypeStart(1)) {
      const save = this.pos;
      this.advance();
      const type = this.parseDeclType(this.parseBaseType());
      if (this.match(")")) return { k: "sizeof", type: { ...type, ref: false }, e: null, line };
      this.pos = save; // sizeof(Node::size) or similar: an expression after all
    }
    return { k: "sizeof", type: null, e: this.parseUnary(), line };
  }

  /**
   * Primary expressions only the extended mode has, starting with an identifier:
   * casts, numeric_limits, `cin >> x` as a value, and `Name::member`.
   */
  private parseExtendedPrimary(t: Token): Expr | null {
    const line = t.line;
    if (["static_cast", "dynamic_cast", "reinterpret_cast", "const_cast"].includes(t.value) && this.is("<", 1)) {
      this.advance(); this.advance();
      const type = this.parseDeclType(this.parseBaseType());
      this.expectClose();
      this.expect("(");
      const e = this.parseExpr();
      this.expect(")");
      const how = t.value.replace("_cast", "") as "static" | "dynamic" | "reinterpret" | "const";
      return { k: "cast", type: { ...type, ref: false }, e, how, line };
    }
    if (t.value === "numeric_limits" && this.is("<", 1)) {
      this.advance(); this.advance();
      const type = this.parseDeclType(this.parseBaseType());
      this.expectClose();
      this.expect("::");
      const which = this.expectIdent("max, min or lowest").value;
      this.expect("(");
      this.expect(")");
      return { k: "limit", type, which, line };
    }
    if (t.value === "cin" && this.is(">>", 1)) {
      this.advance();
      const targets: Expr[] = [];
      while (this.match(">>")) targets.push(this.parseUnary());
      return { k: "cinRead", targets, line };
    }
    if (this.is("::", 1) && this.isIdent(2) && !this.nestedType(t.value, this.peek(2).value)) {
      // Color::RED, Counter::count, Counter::create(), string::npos
      this.advance();
      let name = t.value;
      while (this.is("::") && this.isIdent(1)) { this.advance(); name += `::${this.advance().value}`; }
      return { k: "var", name, line };
    }
    return null;
  }

  /** The `>` closing a template argument list; a `>>` is split into two. */
  private expectClose() {
    if (this.is(">>")) {
      const t = this.peek();
      this.tokens.splice(this.pos, 1, { ...t, value: ">" }, { ...t, value: ">" });
    }
    this.expect(">");
  }

  private parseNew(): Expr {
    const line = this.advance().line;
    const base = this.parseBaseType();
    let ptr = this.takeAliasPtr();
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
