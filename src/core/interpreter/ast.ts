// AST shapes produced by the parser and walked by the executor.

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
  | { k: "int"; v: number }
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
  | { k: "call"; name: string; args: Expr[] }
  | { k: "mcall"; obj: Expr; arrow: boolean; method: string; args: Expr[] }
  | { k: "new"; type: string; args: Expr[]; parens: boolean }
  | { k: "newArray"; elem: TypeRef; size: Expr }
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
  /** `for (int x : nums) ...` (std::list support only). `type.ref` for `int& x`. */
  | { k: "rangeFor"; type: TypeRef; name: string; e: Expr; body: Stmt[] }
);

export interface Param {
  type: TypeRef;
  name: string;
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
  | { kind: "listNode"; list: string };

export interface ClassDef {
  name: string;
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
}

/** Display name of a function as it appears on a stack frame. */
export function qualifiedName(f: FuncDef): string {
  return f.className ? `${f.className}::${f.name}` : f.name;
}
