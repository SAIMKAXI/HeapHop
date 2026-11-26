// AST shapes produced by the parser and walked by the executor.
import type { Value } from "./values";

/** A C++ type as written: `Node*&` is { base: "Node", ptr: 1, ref: true }. */
export interface TypeRef {
  base: string;
  ptr: number;
  ref: boolean;
}

export function typeText(t: TypeRef): string {
  return t.base + "*".repeat(t.ptr) + (t.ref ? "&" : "");
}

export type AssignOp = "=" | "+=" | "-=" | "*=" | "/=" | "%=";
export type BinaryOp = "+" | "-" | "*" | "/" | "%" | "==" | "!=" | "<" | ">" | "<=" | ">=" | "&&" | "||";

export type Expr = { line: number } & (
  /** `text` keeps the literal as written when it has a suffix or is too big for an int (extended mode). */
  | { k: "int"; v: number; text?: string }
  | { k: "float"; v: number }
  | { k: "char"; v: string }
  | { k: "string"; v: string }
  | { k: "bool"; v: boolean }
  | { k: "null" }
  | { k: "var"; name: string }
  | { k: "this" }
  | { k: "unary"; op: "!" | "-" | "+"; e: Expr }
  | { k: "deref"; e: Expr }
  | { k: "addr"; e: Expr }
  | { k: "binary"; op: BinaryOp; l: Expr; r: Expr }
  | { k: "assign"; op: AssignOp; target: Expr; value: Expr }
  | { k: "incdec"; prefix: boolean; delta: 1 | -1; target: Expr }
  | { k: "ternary"; c: Expr; a: Expr; b: Expr }
  | { k: "member"; obj: Expr; field: string; arrow: boolean }
  | { k: "index"; arr: Expr; idx: Expr }
  /** `templateArgs`: `maxOf<int>(a, b)` (extended mode). */
  | { k: "call"; name: string; args: Expr[]; templateArgs?: TypeRef[] }
  | { k: "mcall"; obj: Expr; arrow: boolean; method: string; args: Expr[] }
  | { k: "new"; type: string; args: Expr[]; parens: boolean }
  | { k: "newArray"; elem: TypeRef; size: Expr }
  // ---- extended mode (the VS Code extension) only ----
  /** `(int)x`, `static_cast<double>(x)`, `int(x)`, `dynamic_cast<Dog*>(p)` */
  | { k: "cast"; type: TypeRef; e: Expr; how: "c" | "static" | "dynamic" | "reinterpret" | "const" | "functional" }
  /** `sizeof(int)`, `sizeof(arr)`, `sizeof x` */
  | { k: "sizeof"; type: TypeRef | null; e: Expr | null }
  /** `cin >> x` used as a value, as in `while (cin >> x)`: true when every read worked. */
  | { k: "cinRead"; targets: Expr[] }
  /** `numeric_limits<int>::max()` */
  | { k: "limit"; type: TypeRef; which: string }
  /** `{1, 2}` as a value: a pair, a struct, a vector... decided by where it goes. */
  | { k: "brace"; items: Expr[] }
  /** `[](int a, int b) { return a > b; }`: a lambda without captures. */
  | { k: "lambda"; fn: FuncDef }
  /** A value computed by the interpreter itself (arguments of a comparison it calls). */
  | { k: "value"; v: Value; at?: string }
  /** `Point(1, 2)`, `runtime_error("empty")`: a temporary object. */
  | { k: "temp"; type: string; args: Expr[]; brace?: boolean }
);

export interface Declarator {
  name: string;
  type: TypeRef;
  /** `int a[5]`: the size expression. */
  arraySize: Expr | null;
  /** `int g[3][4]`: the second size (columns). */
  arraySize2: Expr | null;
  /** `= expr` */
  init: Expr | null;
  /** `Node n(5);` */
  ctorArgs: Expr[] | null;
  /** `int a[3] = {1, 2, 3};` */
  initList: Expr[] | null;
  /** `int g[2][2] = {{1, 2}, {3, 4}};` */
  initRows: Expr[][] | null;
  /** `static int count = 0;` inside a function: one variable shared by every call. */
  isStatic?: boolean;
  /** `auto [a, b] = p;`: the names a structured binding gives the parts. */
  bindings?: string[];
  line: number;
}

export interface SwitchCase {
  /** null for `default:` */
  value: Expr | null;
  body: Stmt[];
  line: number;
}

export type Stmt = { line: number } & (
  | { k: "decl"; items: Declarator[] }
  | { k: "expr"; e: Expr }
  | { k: "if"; c: Expr; then: Stmt[]; else: Stmt[] | null }
  | { k: "while"; c: Expr; body: Stmt[] }
  | { k: "doWhile"; c: Expr; body: Stmt[]; condLine: number }
  | { k: "for"; init: Stmt | null; c: Expr | null; update: Expr | null; body: Stmt[] }
  | { k: "switch"; e: Expr; cases: SwitchCase[] }
  | { k: "break" }
  | { k: "continue" }
  | { k: "return"; e: Expr | null }
  | { k: "delete"; isArray: boolean; e: Expr }
  | { k: "block"; body: Stmt[] }
  | { k: "cout"; parts: Expr[] }
  /** `cin >> a >> b;` or, with wholeLine, `getline(cin, s);` */
  | { k: "cin"; targets: Expr[]; wholeLine: boolean }
  /** `cin.ignore();` */
  | { k: "cinIgnore" }
  /** `for (int x : nums) ...` (extended mode). `type.ref` for `int& x`; `bindings` for `auto [k, v]`. */
  | { k: "rangeFor"; type: TypeRef; name: string; e: Expr; body: Stmt[]; bindings?: string[] }
  /** `try { ... } catch (int e) { ... } catch (...) { ... }` (extended mode). */
  | { k: "try"; body: Stmt[]; catches: CatchClause[] }
  /** `throw value;` or, inside a catch, `throw;` (extended mode). */
  | { k: "throw"; e: Expr | null }
);

export interface CatchClause {
  /** null for `catch (...)`. */
  type: TypeRef | null;
  name: string | null;
  body: Stmt[];
  line: number;
}

export interface Param {
  type: TypeRef;
  name: string;
  /** `int pos = 0`: used when a call leaves the argument out. */
  def?: Expr;
}

export interface MemberInit {
  field: string;
  args: Expr[];
  line: number;
}

export interface FuncDef {
  name: string;
  /** Owning class for methods, constructors and destructors. */
  className: string | null;
  kind: "function" | "method" | "ctor" | "dtor";
  ret: TypeRef;
  params: Param[];
  /** Constructor initialiser list: `: data(d), next(nullptr)`. */
  inits: MemberInit[];
  body: Stmt[];
  /** Line of the function header. */
  line: number;
  /** Line of the closing brace. */
  endLine: number;
  /** `static` member function: called without an object. */
  isStatic?: boolean;
  /** `virtual`: a call through a pointer or reference runs the object's own version. */
  isVirtual?: boolean;
  /** `virtual void f() = 0;` */
  isPure?: boolean;
  /** `template <typename T>` function: its type parameters, filled in per call. */
  typeParams?: string[];
}

export interface Field {
  type: TypeRef;
  name: string;
  arraySize: number | null;
  /** `int adj[5][5];`: the second size. */
  arraySize2: number | null;
  /** Default member initialiser: `int size = 0;` */
  init: Expr | null;
  line: number;
}

/** What a class made by HeapHop itself (not by the program) stands for. */
export type BuiltinClass =
  /** std::list<elem>: fields head, tail, size; nodes are the `node` class. */
  | { kind: "list"; elem: TypeRef; node: string }
  /** One element of a std::list: fields prev, value, next. */
  | { kind: "listNode"; list: string }
  /** std::exception and the standard exceptions derived from it: one field, message. */
  | { kind: "exception" }
  /** vector, deque, stack, queue, set: the value is a row of elements (an array value). */
  | { kind: "vector" | "deque" | "stack" | "queue" | "set"; elem: TypeRef }
  /** priority_queue: its elements in heap order. `cmp` is the comparator type, null for less. */
  | { kind: "pq"; elem: TypeRef; cmp: string | null }
  /** map: its entries, pair<key, value>, sorted by key. */
  | { kind: "map"; key: TypeRef; value: TypeRef; elem: TypeRef }
  /** pair<A, B>: fields first, second. */
  | { kind: "pair" }
  /** greater<T>, less<T> */
  | { kind: "functor"; op: "<" | ">" };

export interface ClassDef {
  name: string;
  /** `class Dog : public Animal`: the classes it inherits from (extended mode). */
  bases?: string[];
  /** `static int count;`: members that belong to the class, not to each object. */
  statics?: Field[];
  /** The short name it is shown with: `Node` for `AVLTree::Node`. */
  shortName?: string;
  /** `template <typename T> class Stack`: its type parameters (a template is not a class until it is given types). */
  typeParams?: string[];
  /** Set for the classes HeapHop provides (std::list and its node); absent for the program's own. */
  builtin?: BuiltinClass;
  fields: Field[];
  ctors: FuncDef[];
  dtor: FuncDef | null;
  methods: FuncDef[];
  line: number;
}

export interface Program {
  classes: Map<string, ClassDef>;
  functions: FuncDef[];
  /** File-level declarations when the program has a main(). They run before main. */
  globals: Stmt[];
  /** Statements written outside any function when there is NO main(): they are the program. */
  topLevel: Stmt[];
  /** Named constants: enumerators (`RED`, `Color::RED`). Extended mode. */
  constants?: Map<string, number>;
  /** Enum type names, with each one's enumerators by value, for showing `RED` instead of 0. */
  enums?: Map<string, Map<number, string>>;
}

/** Display name of a function as it appears on a stack frame. */
export function qualifiedName(f: FuncDef): string {
  return f.className ? `${f.className}::${f.name}` : f.name;
}
