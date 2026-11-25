// Executor: walks the AST, changes Memory, and asks the Recorder for one step per
// statement. It knows nothing about how steps are stored or drawn.
import { MAX_STRING_CHARS, type RunLimits, type RuntimeErrorInfo, type StepKind, type TraceStatus } from "../types";
import {
  qualifiedName, typeText,
  type AssignOp, type ClassDef, type Declarator, type Expr, type FuncDef, type Program, type Stmt, type TypeRef,
} from "./ast";
import { fault, RuntimeFault, SourceError, StopSignal, unsupported } from "./errors";
import { InputReader } from "./input";
import { Memory, type Frame, type Slot } from "./memory";
import { formatDouble, Recorder } from "./recorder";
import { ListRuntime } from "./stl";
import { chr, copyValue, dbl, iter, kindOf, NULL_PTR, ptr, str, UNINIT, type Ptr, type Value } from "./values";

class BreakSignal {}
class ContinueSignal {}
class ReturnSignal {
  constructor(public value: Value) {}
}
const isControl = (e: unknown) => e instanceof BreakSignal || e instanceof ContinueSignal || e instanceof ReturnSignal;

const isObject = (v: Value): v is Exclude<Value, number | boolean> => typeof v === "object";
const isPtr = (v: Value): v is Ptr => isObject(v) && v.k === "ptr";
/** A std::list iterator (a pointer that knows its list). */
const isIter = (v: Value): v is Ptr => isPtr(v) && v.iter !== undefined;
const isK = <K extends string>(v: Value, k: K): v is Extract<Value, { k: K }> => isObject(v) && v.k === k;

const KIND_WORDS: Record<string, string> = {
  int: "a number", bool: "a bool", dbl: "a decimal number", chr: "a character", str: "a string",
  ptr: "a pointer", obj: "an object", arr: "an array", uninit: "an uninitialised value",
};

function compileError(message: string, line: number): SourceError {
  return new SourceError("parse", `Line ${line}: ${message}`, line);
}

/** Source-like text of an expression, for error messages. */
function exprText(e: Expr): string {
  switch (e.k) {
    case "var": return e.name;
    case "this": return "this";
    case "member": return `${exprText(e.obj)}${e.arrow ? "->" : "."}${e.field}`;
    case "deref": return `*${exprText(e.e)}`;
    case "index": return `${exprText(e.arr)}[...]`;
    case "call": return `${e.name}(...)`;
    case "mcall": return `${exprText(e.obj)}${e.arrow ? "->" : "."}${e.method}(...)`;
    default: return "this expression";
  }
}

export class Executor {
  readonly mem: Memory;
  readonly rec: Recorder;
  private classes: Map<string, ClassDef>;
  /** Line of the statement being executed, for error steps. */
  private line = 0;
  private hasGlobals = false;

  private stdin: InputReader;
  /** std::list operations. Only reachable when the program names a list type. */
  private lists: ListRuntime;

  constructor(
    private program: Program,
    private src: string[],
    private limits: RunLimits,
    input = ""
  ) {
    this.stdin = new InputReader(input);
    this.classes = program.classes;
    this.mem = new Memory(this.classes, limits);
    this.rec = new Recorder(this.mem, this.classes, limits);
    const element: Expr = { k: "var", name: "an element", line: 0 };
    this.lists = new ListRuntime({
      mem: this.mem,
      classes: this.classes,
      destroyValue: (v, addr) => this.destroyValue(v, addr),
      equal: (a, b) => this.equal(a, b),
      less: (a, b, line) => this.truthy(this.arith("<", this.use(a, element), this.use(b, element), element, element, line), element),
      copy: (v, line) => this.copyOwned(v, line),
    });
  }

  // ---- running the program -------------------------------------------------

  run(): { status: TraceStatus; notice?: string } {
    try {
      const main = this.program.functions.find((f) => f.name === "main");
      if (main) {
        if (this.program.globals.length > 0) {
          this.hasGlobals = true;
          this.mem.pushFrame("globals", null, null, 0);
          this.step("begin", 0, "Program starts. Global variables are created first.");
          for (const g of this.program.globals) this.exec(g);
          this.mem.pushFrame("main", null, null, 0);
          this.step("call", main.line, "main() starts");
        } else {
          this.mem.pushFrame("main", null, null, 0);
          this.step("begin", 0, "Program starts");
        }
        this.runBody(main.body);
      } else {
        this.mem.pushFrame("main", null, null, 0);
        this.step("begin", 0, "Program starts");
        this.runBody(this.program.topLevel);
      }
      // main ends, then the globals: each frame's objects are destroyed before it goes.
      while (this.mem.frames.length > 0) {
        const frame = this.mem.top();
        this.destroyScope(frame, frame.scopes[0]);
        this.mem.popFrame();
      }
      const left = this.mem.heap.size;
      const label = left === 0
        ? "Program finished. Every object created with new was deleted."
        : `Program finished. ${left} object${left === 1 ? "" : "s"} created with new ${left === 1 ? "was" : "were"} never deleted (a memory leak).`;
      this.rec.capture({ kind: "end", line: 0, label }, true);
      return { status: "completed" };
    } catch (e) {
      if (e instanceof RuntimeFault) {
        this.rec.capture({ kind: "error", line: this.line, label: e.info.message, error: e.info }, true);
        return { status: "error", notice: `The program stopped on line ${this.line}: ${e.info.message}` };
      }
      if (e instanceof StopSignal) return { status: e.status, notice: e.notice };
      throw e;
    }
  }

  private runBody(body: Stmt[]) {
    try {
      this.execBlock(body, false);
    } catch (e) {
      if (!(e instanceof ReturnSignal)) {
        if (e instanceof BreakSignal || e instanceof ContinueSignal) throw compileError("break or continue is used outside a loop.", this.line);
        throw e;
      }
    }
  }

  private step(kind: StepKind, line: number, label?: string, extra: { condition?: boolean; output?: string; input?: string; error?: RuntimeErrorInfo } = {}) {
    this.rec.capture({ kind, line, label: label ?? this.srcLine(line), ...extra });
  }

  private srcLine(line: number): string {
    return (this.src[line - 1] ?? "").trim();
  }

  // ---- statements ----------------------------------------------------------

  private execBlock(stmts: Stmt[], newScope = true) {
    const frame = this.mem.top();
    if (newScope) frame.scopes.push([]);
    try {
      for (const s of stmts) this.exec(s);
    } catch (e) {
      if (newScope && isControl(e)) this.closeScope(frame);
      throw e;
    }
    if (newScope) this.closeScope(frame);
  }

  /** Leave a block: run destructors of its objects, then forget its variables. */
  private closeScope(frame: Frame) {
    const scope = frame.scopes[frame.scopes.length - 1];
    this.destroyScope(frame, scope);
    frame.scopes.pop();
    if (scope.length > 0) {
      frame.version++;
      this.mem.deaths.push(`s${frame.serial}`);
    }
  }

  private destroyScope(frame: Frame, scope: Slot[]) {
    for (let i = scope.length - 1; i >= 0; i--) {
      const slot = scope[i];
      if (slot.ref) continue;
      this.destroyValue(slot.value, `s${frame.serial}.${slot.key}`);
    }
  }

  /** Run the destructor of an object (or of each object in an array), if its class has one. */
  private destroyValue(v: Value, addr: string) {
    if (isK(v, "obj")) {
      if (this.lists.info(v.type)) {
        this.lists.destroy(addr, this.line);
        return;
      }
      const dtor = this.classes.get(v.type)?.dtor;
      if (dtor) this.invoke(dtor, [], addr, this.line);
      // Member lists go when their object goes, after its destructor body has run.
      if (this.hasLists(v)) this.destroyLists(this.mem.read(addr), addr);
    } else if (isK(v, "arr")) {
      for (let i = v.e.length - 1; i >= 0; i--) this.destroyValue(v.e[i], `${addr}.${i}`);
    }
  }

  /** Delete the nodes of every std::list inside a value (its members, its array elements). */
  private destroyLists(v: Value, addr: string) {
    if (isK(v, "obj")) {
      if (this.lists.info(v.type)) { this.lists.destroy(addr, this.line); return; }
      for (const key of Object.keys(v.f)) this.destroyLists(v.f[key], `${addr}.${key}`);
    } else if (isK(v, "arr")) {
      v.e.forEach((el, i) => this.destroyLists(el, `${addr}.${i}`));
    }
  }

  /** Does this value contain a std::list anywhere? */
  private hasLists(v: Value): boolean {
    if (isK(v, "obj")) return this.lists.info(v.type) !== null || Object.keys(v.f).some((k) => this.hasLists(v.f[k]));
    if (isK(v, "arr")) return v.e.some((el) => this.hasLists(el));
    return false;
  }

  /** A copy that owns its lists: every std::list inside is copied node by node, as C++ copies do. */
  private copyOwned(v: Value, line: number): Value {
    if (!this.hasLists(v)) return copyValue(v);
    if (isK(v, "obj")) {
      if (this.lists.info(v.type)) return this.lists.copyOf(v, line);
      const f: Record<string, Value> = Object.create(null);
      for (const key of Object.keys(v.f)) f[key] = this.copyOwned(v.f[key], line);
      return { k: "obj", type: v.type, f };
    }
    if (isK(v, "arr")) return { k: "arr", e: v.e.map((el) => this.copyOwned(el, line)) };
    return v;
  }

  /**
   * The value an expression gives, ready to be stored somewhere new. A function's result is a
   * temporary the new place can simply take over; anything else is copied.
   */
  private owned(e: Expr, v: Value, line: number): Value {
    return (e.k === "call" || e.k === "mcall") && this.hasLists(v) ? v : this.copyOwned(v, line);
  }

  private loopGuard(count: number, line: number) {
    if (count > this.limits.maxLoopIterations) {
      throw new StopSignal("truncated",
        `The loop on line ${line} ran more than ${this.limits.maxLoopIterations} times, so the trace stops here. If that is unexpected, its condition may never become false.`);
    }
  }

  private condition(c: Expr, line: number): boolean {
    const result = this.truthy(this.value(c), c);
    this.step("condition", line, `${this.srcLine(line)}  →  ${result ? "true" : "false"}`, { condition: result });
    return result;
  }

  /** Runs a loop body. Returns true when the loop must stop (break). */
  private loopBody(body: Stmt[]): boolean {
    try {
      this.execBlock(body);
    } catch (e) {
      if (e instanceof BreakSignal) return true;
      if (!(e instanceof ContinueSignal)) throw e;
    }
    return false;
  }

  private exec(s: Stmt) {
    this.line = s.line;
    switch (s.k) {
      case "decl":
        for (const d of s.items) this.declare(d);
        this.step("statement", s.line);
        return;
      case "expr":
        this.value(s.e);
        this.line = s.line;
        this.step("statement", s.line);
        return;
      case "if":
        if (this.condition(s.c, s.line)) this.execBlock(s.then);
        else if (s.else) this.execBlock(s.else);
        return;
      case "while":
        for (let n = 1; ; n++) {
          this.line = s.line;
          if (!this.condition(s.c, s.line)) break;
          this.loopGuard(n, s.line);
          if (this.loopBody(s.body)) break;
        }
        return;
      case "doWhile":
        for (let n = 1; ; n++) {
          this.loopGuard(n, s.line);
          if (this.loopBody(s.body)) break;
          this.line = s.condLine;
          if (!this.condition(s.c, s.condLine)) break;
        }
        return;
      case "for": {
        const frame = this.mem.top();
        frame.scopes.push([]); // the loop variable lives only as long as the loop
        try {
          if (s.init) this.exec(s.init);
          for (let n = 1; ; n++) {
            this.line = s.line;
            if (s.c && !this.condition(s.c, s.line)) break;
            this.loopGuard(n, s.line);
            if (this.loopBody(s.body)) break;
            this.line = s.line;
            if (s.update) this.value(s.update); // shown by the next condition step
          }
        } catch (e) {
          if (isControl(e)) this.closeScope(frame);
          throw e;
        }
        this.closeScope(frame);
        return;
      }
      case "switch": {
        const v = this.use(this.value(s.e), s.e);
        this.step("statement", s.line, `${this.srcLine(s.line)}  →  ${this.printed(v)}`);
        let start = s.cases.findIndex((c) => c.value !== null && this.equal(v, this.value(c.value)));
        if (start < 0) start = s.cases.findIndex((c) => c.value === null);
        if (start < 0) return;
        try {
          this.execBlock(s.cases.slice(start).flatMap((c) => c.body)); // falls through until a break
        } catch (e) {
          if (!(e instanceof BreakSignal)) throw e;
        }
        return;
      }
      case "break":
        this.step("statement", s.line);
        throw new BreakSignal();
      case "continue":
        this.step("statement", s.line);
        throw new ContinueSignal();
      case "return": {
        const v = s.e ? this.owned(s.e, this.value(s.e), s.line) : UNINIT;
        this.line = s.line;
        this.step("return", s.line);
        throw new ReturnSignal(v);
      }
      case "delete":
        this.execDelete(s.e, s.line);
        return;
      case "block":
        this.execBlock(s.body);
        return;
      case "cin": {
        const consumed: string[] = [];
        for (const target of s.targets) consumed.push(this.readInput(target, s.wholeLine, s.line));
        this.line = s.line;
        const shown = consumed.join(s.wholeLine ? "" : " ");
        this.step("input", s.line, `${this.srcLine(s.line)}  ←  ${shown === "" ? "(empty line)" : shown}`, { input: shown });
        return;
      }
      case "cinIgnore":
        this.stdin.skipChar();
        this.step("statement", s.line);
        return;
      case "rangeFor":
        this.rangeFor(s);
        return;
      case "cout": {
        // Each part is printed as soon as it is evaluated: in `cout << "a" << f()`, "a"
        // appears before anything f() prints.
        for (const p of s.parts) this.rec.print(this.printed(this.use(this.value(p), p)));
        this.line = s.line;
        this.step("output", s.line);
        return;
      }
    }
  }

  /** Read one value from the program input into an lvalue. Returns the text that was consumed. */
  private readInput(target: Expr, wholeLine: boolean, line: number): string {
    const addr = this.ref(target);
    const t = this.mem.typeAt(addr);
    const out = (what: string) => new StopSignal("truncated",
      `Line ${line} waits for input (${exprText(target)}), but ${what}. Put the values the program should read in the "Program input" box, in order, and run again.`);
    if (!t || t.isArray) throw compileError(`cin cannot read into ${exprText(target)}.`, line);
    const base = t.type.ptr > 0 ? "pointer" : t.type.base;

    if (wholeLine) {
      if (base !== "string") throw compileError("getline needs a string variable.", line);
      const text = this.stdin.line();
      if (text === null) throw out("the input box has no more lines");
      this.mem.write(addr, str(text));
      return text;
    }
    if (base === "char") {
      const c = this.stdin.char();
      if (c === null) throw out("the input box has no more values");
      this.mem.write(addr, chr(c));
      return c;
    }
    const token = this.stdin.token();
    if (token === null) throw out("the input box has no more values");
    switch (base) {
      case "string":
        this.mem.write(addr, str(token));
        return token;
      case "int": case "bool": {
        if (!/^[+-]?\d+$/.test(token)) throw out(`the next input is "${token}", which is not a whole number`);
        const n = parseInt(token, 10);
        this.mem.write(addr, base === "bool" ? n !== 0 : n | 0);
        return token;
      }
      case "double": case "float": {
        if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(token)) throw out(`the next input is "${token}", which is not a number`);
        this.mem.write(addr, dbl(parseFloat(token)));
        return token;
      }
      default:
        throw compileError(`cin cannot read a ${typeText({ ...t.type, ref: false })}.`, line);
    }
  }

  private execDelete(e: Expr, line: number) {
    const v = this.value(e);
    if (isK(v, "uninit")) {
      throw fault("uninitialised_pointer", `${exprText(e)} was never given a value, so delete would free an unpredictable address.`);
    }
    if (!isPtr(v)) throw compileError("delete needs a pointer.", line);
    if (v.a === null) { // deleting nullptr is allowed and does nothing
      this.step("statement", line);
      return;
    }
    const cell = this.mem.heap.get(v.a);
    if (!cell) {
      const dead = this.mem.freed.get(v.a);
      if (dead) {
        throw fault("double_free", `${exprText(e)} points at a ${dead.type} that was already deleted on line ${dead.line}. Deleting the same memory twice is an error.`);
      }
      throw fault("invalid_free", `${exprText(e)} does not point at the start of memory created with new, so it cannot be deleted.`);
    }
    this.destroyValue(cell.value, v.a);
    this.line = line;
    this.mem.free(v.a, line);
    this.step("statement", line);
  }

  private declare(d: Declarator) {
    if (d.type.base === "auto") return this.declareAuto(d);
    const t = d.type;
    // Globals have static storage, so C++ fills them with zeros; locals start unknown.
    const global = this.hasGlobals && this.mem.frames.length === 1;
    const blank = (ty: TypeRef) => (global ? this.zero(ty) : this.fresh(ty));
    const cls = t.ptr === 0 ? this.classes.get(t.base) : undefined;

    if (cls && this.lists.info(cls.name) && d.arraySize === null && d.arraySize2 === null) {
      let v: Value;
      if (d.initList) v = this.listFrom(cls.name, d.initList, d.line);
      else if (d.init) v = this.owned(d.init, this.coerce(t, this.value(d.init), d.line), d.line);
      else v = this.listCtor(cls.name, d.ctorArgs ?? [], d.line);
      this.mem.declare(d.name, t, false, v);
      return;
    }

    if (d.arraySize2 !== null) {
      if (cls) throw unsupported("A two-dimensional array of objects", d.line);
      const rows = d.arraySize ? this.int(this.value(d.arraySize), d.arraySize) : d.initRows!.length;
      const cols = this.int(this.value(d.arraySize2), d.arraySize2);
      if (rows < 0 || cols < 0 || rows * cols > 1000) throw compileError(`the array "${d.name}" has an unsupported size (${rows} by ${cols}).`, d.line);
      if (d.initRows && d.initRows.length > rows) throw compileError(`too many rows for the array "${d.name}".`, d.line);
      const filled = d.initRows !== null || d.initList !== null;
      const grid: Value[] = Array.from({ length: rows }, (_, r) => {
        const init = d.initRows?.[r];
        if (init && init.length > cols) throw compileError(`row ${r} of "${d.name}" has too many values.`, d.line);
        return { k: "arr", e: Array.from({ length: cols }, (_, c) => (init && c < init.length ? this.coerce(t, this.value(init[c]), d.line) : filled ? this.zero(t) : blank(t))) };
      });
      this.mem.declare(d.name, t, true, { k: "arr", e: grid });
      return;
    }

    if (d.arraySize !== null || d.initList !== null) {
      const n = d.arraySize ? this.int(this.value(d.arraySize), d.arraySize) : d.initList!.length;
      if (n < 0 || n > 1000) throw compileError(`the array "${d.name}" has an unsupported size (${n}).`, d.line);
      const init = d.initList;
      if (init && init.length > n) throw compileError(`too many values for the array "${d.name}".`, d.line);
      const e: Value[] = [];
      for (let i = 0; i < n; i++) {
        if (init && i < init.length) e.push(this.coerce(t, this.value(init[i]), d.line));
        else if (cls) e.push(this.makeObject(cls, global, d.line));
        else e.push(init ? this.zero(t) : blank(t));
      }
      const slot = this.mem.declare(d.name, t, true, { k: "arr", e });
      if (cls && cls.ctors.length > 0) {
        const base = this.mem.slotAddr(this.mem.top(), slot);
        for (let i = 0; i < n; i++) this.construct(cls, `${base}.${i}`, [], d.line);
      }
      return;
    }

    if (cls) {
      if (d.init) {
        const v = this.value(d.init);
        if (!isK(v, "obj") || v.type !== cls.name) throw compileError(`"${d.name}" is a ${cls.name}, but it is given ${KIND_WORDS[kindOf(v)]}.`, d.line);
        this.mem.declare(d.name, t, false, this.owned(d.init, v, d.line));
        return;
      }
      const slot = this.mem.declare(d.name, t, false, this.makeObject(cls, global, d.line));
      this.construct(cls, this.mem.slotAddr(this.mem.top(), slot), d.ctorArgs ?? [], d.line);
      this.line = d.line;
      return;
    }

    const initExpr = d.init ?? (d.ctorArgs?.length === 1 ? d.ctorArgs[0] : null); // `int x(5);`
    const v = initExpr ? this.coerce(t, this.valueFor(t, initExpr), d.line) : blank(t);
    this.mem.declare(d.name, t, false, copyValue(v));
  }

  // ---- objects -------------------------------------------------------------

  /** Value of a variable that was declared without an initialiser. */
  private fresh(t: TypeRef): Value {
    return t.ptr === 0 && t.base === "string" ? str("") : UNINIT;
  }

  private zero(t: TypeRef): Value {
    if (t.ptr > 0) return NULL_PTR;
    switch (t.base) {
      case "double": case "float": return dbl(0);
      case "bool": return false;
      case "char": return chr("\0");
      case "string": return str("");
      default: return 0;
    }
  }

  private makeObject(cls: ClassDef, zeroed: boolean, line: number): Value {
    if (this.lists.info(cls.name)) return this.lists.empty(cls.name); // a std::list starts empty
    // No prototype: a C++ member may be called __proto__ or constructor.
    const f: Record<string, Value> = Object.create(null);
    for (const field of cls.fields) {
      const nested = field.type.ptr === 0 ? this.classes.get(field.type.base) : undefined;
      if (nested && nested.ctors.length > 0) {
        throw unsupported(`A member object with its own constructor (${cls.name}::${field.name})`, field.line, "Use a pointer member instead.");
      }
      const one = (): Value =>
        nested ? this.makeObject(nested, zeroed, line)
        : field.init ? this.coerce(field.type, this.value(field.init), field.line)
        : zeroed ? this.zero(field.type)
        : this.fresh(field.type);
      const row = (): Value => (field.arraySize2 !== null ? { k: "arr", e: Array.from({ length: field.arraySize2 }, one) } : one());
      f[field.name] = field.arraySize !== null ? { k: "arr", e: Array.from({ length: field.arraySize }, row) } : one();
    }
    return { k: "obj", type: cls.name, f };
  }

  /** Run the matching constructor on the object at `addr`. */
  private construct(cls: ClassDef, addr: string, args: Expr[], line: number) {
    if (cls.ctors.length === 0) {
      if (args.length > cls.fields.length) throw compileError(`${cls.name} has only ${cls.fields.length} members, but ${args.length} values are given.`, line);
      args.forEach((a, i) => {
        const field = cls.fields[i];
        this.mem.write(`${addr}.${field.name}`, this.coerce(field.type, this.value(a), line));
      });
      return;
    }
    const ctor = cls.ctors.find((c) => c.params.length === args.length);
    if (!ctor) {
      throw compileError(`${cls.name} has no constructor that takes ${args.length} argument${args.length === 1 ? "" : "s"}.`, line);
    }
    this.invoke(ctor, args, addr, line);
  }

  private newObject(e: Extract<Expr, { k: "new" }>): Value {
    const cls = this.classes.get(e.type);
    const type: TypeRef = { base: e.type, ptr: 0, ref: false };
    if (cls && this.lists.info(cls.name)) return ptr(this.mem.alloc(type, false, this.listCtor(cls.name, e.args, e.line), e.line));
    if (cls) {
      const zeroed = e.parens && cls.ctors.length === 0 && e.args.length === 0; // `new Node()` zero-fills a plain struct
      const addr = this.mem.alloc(type, false, this.makeObject(cls, zeroed, e.line), e.line);
      this.construct(cls, addr, e.args, e.line);
      return ptr(addr);
    }
    if (e.args.length > 1) throw compileError(`new ${e.type}(...) takes one value.`, e.line);
    const v = e.args.length === 1 ? this.coerce(type, this.value(e.args[0]), e.line) : e.parens ? this.zero(type) : this.fresh(type);
    return ptr(this.mem.alloc(type, false, v, e.line));
  }

  private newArray(e: Extract<Expr, { k: "newArray" }>): Value {
    const n = this.int(this.value(e.size), e.size);
    if (n < 0 || n > 1000) throw fault("other", `new[] was asked for ${n} elements, which HeapHop does not allow (0 to 1000).`);
    const cls = e.elem.ptr === 0 ? this.classes.get(e.elem.base) : undefined;
    const elems: Value[] = Array.from({ length: n }, () => (cls ? this.makeObject(cls, false, e.line) : this.fresh(e.elem)));
    const addr = this.mem.alloc(e.elem, true, { k: "arr", e: elems }, e.line);
    if (cls && cls.ctors.length > 0) for (let i = 0; i < n; i++) this.construct(cls, `${addr}.${i}`, [], e.line);
    return ptr(addr);
  }

  // ---- std::list -----------------------------------------------------------

  /** `auto it = nums.begin();`, `auto n = nums.size();`: the type comes from the value. */
  private declareAuto(d: Declarator) {
    const init = d.init ?? d.ctorArgs![0];
    const v = this.use(this.value(init), init);
    let type: TypeRef;
    if (isPtr(v) && v.iter !== undefined) type = { base: `${v.iter}::iterator`, ptr: 0, ref: false };
    else if (typeof v === "number") type = { base: "int", ptr: 0, ref: false };
    else if (typeof v === "boolean") type = { base: "bool", ptr: 0, ref: false };
    else {
      switch (v.k) {
        case "dbl": type = { base: "double", ptr: 0, ref: false }; break;
        case "chr": type = { base: "char", ptr: 0, ref: false }; break;
        case "str": type = { base: "string", ptr: 0, ref: false }; break;
        case "obj": type = { base: v.type, ptr: 0, ref: false }; break;
        case "ptr": {
          const target = v.a === null ? null : this.mem.typeAt(v.a);
          if (!target) throw compileError(`auto cannot tell what "${d.name}" should point at. Write its type, for example Node* ${d.name} = ...;`, d.line);
          type = { base: target.type.base, ptr: target.type.ptr + 1, ref: false };
          break;
        }
        default: throw compileError(`auto cannot be used for ${KIND_WORDS[kindOf(v)]}. Write the type of "${d.name}".`, d.line);
      }
    }
    this.mem.declare(d.name, type, false, isK(v, "obj") ? this.owned(init, v, d.line) : copyValue(v));
  }

  /** One element for a list: converted to the element type and copied. */
  private listElement(elem: TypeRef, e: Expr, line: number): Value {
    return this.copyOwned(this.coerce(elem, this.use(this.valueFor(elem, e), e), line), line);
  }

  /** `list<int> nums = {1, 2, 3};` */
  private listFrom(type: string, items: Expr[], line: number): Value {
    const { elem } = this.lists.info(type)!;
    return this.lists.build(type, items.map((x) => this.listElement(elem, x, line)), line);
  }

  /** `list<int> a;`, `list<int> b(a);`, `list<int> c(3);`, `list<int> d(3, 7);` */
  private listCtor(type: string, args: Expr[], line: number): Value {
    const { elem } = this.lists.info(type)!;
    if (args.length === 0) return this.lists.empty(type);
    if (args.length > 2) throw compileError(`${type} has no constructor that takes ${args.length} arguments.`, line);
    const first = this.use(this.value(args[0]), args[0]);
    if (args.length === 1 && this.lists.typeOf(first) === type) return this.owned(args[0], first, line);
    const n = this.int(first, args[0]);
    if (n < 0 || n > 1000) throw fault("other", `A list of ${n} elements was asked for, which HeapHop does not allow (0 to 1000).`);
    if (elem.ptr === 0 && this.classes.has(elem.base)) {
      throw unsupported(`Making a list of ${n} ${elem.base} objects at once`, line, "Add them one at a time with push_back.");
    }
    const value = args.length === 2 ? this.listElement(elem, args[1], line) : this.zero(elem);
    return this.lists.build(type, Array.from({ length: n }, () => copyValue(value)), line);
  }

  private listMethod(e: Extract<Expr, { k: "mcall" }>, la: string, type: string): Value {
    const { elem } = this.lists.info(type)!;
    const what = exprText(e.obj);
    const m = e.method;
    const argc = (n: number) => {
      if (e.args.length !== n) throw compileError(`${what}.${m}() takes ${n === 0 ? "no arguments" : n === 1 ? "one argument" : `${n} arguments`}, but ${e.args.length} ${e.args.length === 1 ? "is" : "are"} given.`, e.line);
    };
    const position = (x: Expr): Ptr => {
      const v = this.use(this.value(x), x);
      if (!isIter(v) || v.iter !== type) throw compileError(`${exprText(x)} is not an iterator of a ${type}, so it cannot be a position in ${what}.`, e.line);
      this.lists.owns(la, v, exprText(x), m);
      return v;
    };
    switch (m) {
      case "push_back": case "emplace_back": case "push_front": case "emplace_front": {
        if (m.startsWith("emplace") && e.args.length > 1) throw unsupported(`${m}() with several constructor arguments`, e.line, "Make the object first, then push_back it.");
        argc(1);
        const v = this.listElement(elem, e.args[0], e.line);
        if (m.endsWith("back")) this.lists.insertBefore(la, type, null, v, e.line);
        else this.lists.pushFront(la, type, v, e.line);
        return UNINIT;
      }
      case "pop_back": case "pop_front":
        argc(0);
        this.lists.pop(la, m === "pop_back" ? "tail" : "head", m, what, e.line);
        return UNINIT;
      case "front": case "back":
        argc(0);
        return this.copyOwned(this.mem.read(this.lists.endRef(la, m === "front" ? "head" : "tail", m, what)), e.line);
      case "size":
        argc(0);
        return this.lists.size(la);
      case "empty":
        argc(0);
        return this.lists.size(la) === 0;
      case "clear":
        argc(0);
        this.lists.clear(la, e.line);
        return UNINIT;
      case "begin": case "cbegin":
        argc(0);
        return this.lists.begin(la, type);
      case "end": case "cend":
        argc(0);
        return this.lists.end(la, type);
      case "insert": {
        if (e.args.length === 3) throw unsupported("insert() with a count or a range", e.line, "Insert one value at a time: nums.insert(it, value);");
        argc(2);
        const pos = position(e.args[0]);
        const before = this.lists.node(pos, exprText(e.args[0]));
        const id = this.lists.insertBefore(la, type, before, this.listElement(elem, e.args[1], e.line), e.line);
        return iter(type, la, id);
      }
      case "erase": {
        if (e.args.length === 2) throw unsupported("erase() with a range of elements", e.line, "Erase one element at a time: it = nums.erase(it);");
        argc(1);
        const pos = position(e.args[0]);
        const id = this.lists.node(pos, exprText(e.args[0]));
        if (id === null) throw fault("out_of_bounds", `${exprText(e.args[0])} is end(), which is not an element, so there is nothing to erase.`);
        return iter(type, la, this.lists.unlink(la, id, e.line));
      }
      case "remove":
        argc(1);
        this.lists.remove(la, this.coerce(elem, this.use(this.valueFor(elem, e.args[0]), e.args[0]), e.line), e.line);
        return UNINIT;
      case "reverse":
        argc(0);
        this.lists.reverse(la);
        return UNINIT;
      case "sort": case "unique":
        if (e.args.length > 0) throw unsupported(`${m}() with a comparison function`, e.line, `${m}() with no arguments uses == and <.`);
        if (m === "sort") this.lists.sort(la, e.line);
        else this.lists.unique(la, e.line);
        return UNINIT;
      case "rbegin": case "rend": case "crbegin": case "crend":
        throw unsupported(`${m}() (reverse iterators)`, e.line, "Walk the list backwards with --it, starting from end().");
      case "splice": case "merge": case "resize": case "assign": case "swap": case "emplace": case "remove_if": case "max_size":
        throw unsupported(`The list method ${m}()`, e.line);
      default:
        throw compileError(`${type} has no member function named ${m}().`, e.line);
    }
  }

  /** `for (int x : nums)`, `for (auto& x : nums)`, and the same over an array. */
  private rangeFor(s: Extract<Stmt, { k: "rangeFor" }>) {
    const frame = this.mem.top();
    const where = this.ref(s.e);
    const container = this.mem.read(where);
    const listType = this.lists.typeOf(container);
    let elemType: TypeRef;
    let next: () => string | null;
    let after = () => {};
    if (listType) {
      elemType = this.lists.info(listType)!.elem;
      let it = this.lists.begin(where, listType);
      let current: string | null = null;
      next = () => (current = it.a) === null ? null : `${current}.value`;
      after = () => {
        if (current && !this.mem.heap.has(current)) {
          const dead = this.mem.freed.get(current);
          throw fault("use_after_free", `The element this range-for loop was standing on was erased${dead ? ` on line ${dead.line}` : ""}, so the loop cannot move on. To erase while walking a list, use an iterator loop: it = ${exprText(s.e)}.erase(it);`);
        }
        it = this.lists.step(it, 1, "the loop's iterator");
      };
    } else if (isK(container, "arr")) {
      const placed = this.mem.typeAt(where);
      const first = container.e[0];
      if (!placed || isK(first, "arr")) throw unsupported("A range-for loop over a two-dimensional array", s.line, "Use two ordinary for loops.");
      elemType = placed.type;
      let i = 0;
      next = () => (i < container.e.length ? `${where}.${i++}` : null);
    } else {
      throw compileError(`a range-for loop needs a list or an array, but ${exprText(s.e)} is ${KIND_WORDS[kindOf(container)]}.`, s.line);
    }
    const declared: TypeRef = s.type.base === "auto" ? { ...elemType, ref: s.type.ref } : s.type;

    for (let n = 1; ; n++) {
      this.line = s.line;
      const a = next();
      if (a === null) {
        this.step("condition", s.line, `${this.srcLine(s.line)}  →  no more elements`, { condition: false });
        return;
      }
      this.loopGuard(n, s.line);
      frame.scopes.push([]);
      let stop: boolean;
      try {
        if (declared.ref) this.mem.declare(s.name, declared, false, UNINIT, a);
        else this.mem.declare(s.name, declared, false, this.copyOwned(this.coerce(declared, this.mem.read(a), s.line), s.line));
        this.step("condition", s.line, `${this.srcLine(s.line)}  →  ${s.name} = ${this.brief(this.mem.read(a))}`, { condition: true });
        stop = this.loopBody(s.body);
      } catch (e) {
        if (isControl(e)) this.closeScope(frame);
        throw e;
      }
      this.closeScope(frame);
      if (stop) return;
      this.line = s.line;
      after();
    }
  }

  /** std::next, std::prev, std::advance, std::distance and std::find on list iterators. */
  private iteratorLibrary(e: Extract<Expr, { k: "call" }>): Value | undefined {
    const first = e.args[0] ? this.value(e.args[0]) : UNINIT;
    if (!isIter(first)) return undefined;
    const what = exprText(e.args[0]);
    const count = (x: Expr | undefined) => (x ? this.int(this.value(x), x) : 1);
    const move = (it: Ptr, n: number): Ptr => {
      if (Math.abs(n) > 1000) throw fault("other", `Moving an iterator ${n} places is more than HeapHop allows.`);
      for (let i = 0; i < Math.abs(n); i++) it = this.lists.step(it, n > 0 ? 1 : -1, what);
      return it;
    };
    const arity = (min: number, max: number) => {
      if (e.args.length < min || e.args.length > max) throw compileError(`${e.name}() is called with ${e.args.length} argument${e.args.length === 1 ? "" : "s"}.`, e.line);
    };
    switch (e.name) {
      case "next": arity(1, 2); return move(first, count(e.args[1]));
      case "prev": arity(1, 2); return move(first, -count(e.args[1]));
      case "advance": {
        arity(2, 2);
        const addr = this.ref(e.args[0]);
        this.mem.write(addr, move(first, count(e.args[1])));
        return UNINIT;
      }
      case "distance": case "find": {
        arity(e.name === "find" ? 3 : 2, e.name === "find" ? 3 : 2);
        const last = this.use(this.value(e.args[1]), e.args[1]);
        if (!isIter(last) || last.iter !== first.iter) throw compileError(`${exprText(e.args[1])} is not an iterator of the same list type as ${what}.`, e.line);
        const wanted = e.name === "find" ? this.use(this.value(e.args[2]), e.args[2]) : UNINIT;
        let it = first;
        for (let n = 0; ; n++) {
          if (it.a === last.a) return e.name === "find" ? last : n;
          if (it.a === null) throw fault("other", `${exprText(e.args[1])} cannot be reached by moving forward from ${what}.`);
          if (e.name === "find" && this.equal(this.mem.read(this.lists.elem(it, what)), wanted)) return it;
          it = this.lists.step(it, 1, what);
        }
      }
    }
    return undefined;
  }

  // ---- calls ---------------------------------------------------------------

  private findMethod(cls: ClassDef | undefined, name: string, argc: number): FuncDef | null {
    const named = cls?.methods.filter((m) => m.name === name) ?? [];
    return named.find((m) => m.params.length === argc) ?? null;
  }

  private call(e: Extract<Expr, { k: "call" }>): Value {
    const frame = this.mem.top();
    if (frame.className) {
      const m = this.findMethod(this.classes.get(frame.className), e.name, e.args.length);
      if (m) return this.invoke(m, e.args, frame.thisAddr, e.line);
    }
    const named = this.program.functions.filter((f) => f.name === e.name);
    if (named.length === 0) {
      const result = this.library(e);
      if (result === undefined) throw compileError(`"${e.name}" is not a function in this program.`, e.line);
      return result;
    }
    const fn = named.find((f) => f.params.length === e.args.length);
    if (!fn) throw compileError(`${e.name}() is called with ${e.args.length} argument${e.args.length === 1 ? "" : "s"}, but it expects ${named[0].params.length}.`, e.line);
    return this.invoke(fn, e.args, null, e.line);
  }

  /** The standard functions lab code uses (std::max in the AVL lab, swap in sorting). A program's own function of the same name wins. */
  private library(e: Extract<Expr, { k: "call" }>): Value | undefined {
    if (["next", "prev", "advance", "distance", "find"].includes(e.name)) {
      const result = this.iteratorLibrary(e);
      if (result !== undefined) return result;
    }
    const LIBRARY: Record<string, number> = { max: 2, min: 2, abs: 1, swap: 2 };
    const arity = Object.hasOwn(LIBRARY, e.name) ? LIBRARY[e.name] : undefined;
    if (arity === undefined) return undefined;
    if (e.args.length !== arity) throw compileError(`${e.name}() takes ${arity} argument${arity === 1 ? "" : "s"}.`, e.line);
    const [a, b] = e.args;
    if (e.name === "swap") {
      const [ra, rb] = [this.ref(a), this.ref(b)];
      const [va, vb] = [this.mem.read(ra), this.mem.read(rb)];
      this.mem.write(ra, copyValue(vb));
      this.mem.write(rb, copyValue(va));
      return UNINIT;
    }
    const x = this.use(this.value(a), a);
    if (e.name === "abs") return isK(x, "dbl") ? dbl(Math.abs(x.v)) : Math.abs(this.num(x, a)) | 0;
    const y = this.use(this.value(b), b);
    // Like std::max and std::min: on a tie the first argument is returned.
    const [nx, ny] = [this.num(x, a), this.num(y, b)];
    return (e.name === "max" ? ny > nx : ny < nx) ? y : x;
  }

  private methodCall(e: Extract<Expr, { k: "mcall" }>): Value {
    if (!e.arrow) {
      // string methods work on values, including temporaries
      const probe = e.obj.k === "string" ? this.value(e.obj) : null;
      const sv = probe ?? this.mem.read(this.ref(e.obj));
      if (isK(sv, "str")) {
        if (e.method === "length" || e.method === "size") return sv.s.length;
        if (e.method === "empty") return sv.s.length === 0;
        throw unsupported(`The string method ${e.method}()`, e.line);
      }
    }
    const addr = e.arrow ? this.pointee(e.obj) : this.ref(e.obj);
    const target = this.mem.read(addr);
    if (!isK(target, "obj")) throw compileError(`${exprText(e.obj)} is not an object, so it has no method ${e.method}().`, e.line);
    if (this.lists.info(target.type)) return this.listMethod(e, addr, target.type);
    const cls = this.classes.get(target.type);
    const m = this.findMethod(cls, e.method, e.args.length);
    if (!m) throw compileError(`${target.type} has no method ${e.method}() that takes ${e.args.length} argument${e.args.length === 1 ? "" : "s"}.`, e.line);
    return this.invoke(m, e.args, addr, e.line);
  }

  /** Call a function, method, constructor or destructor. One stack frame per call. */
  private invoke(fn: FuncDef, args: Expr[], thisAddr: string | null, callLine: number): Value {
    if (this.mem.frames.length >= this.limits.maxCallDepth) {
      throw new StopSignal("truncated",
        `More than ${this.limits.maxCallDepth} function calls are waiting at once, so the trace stops here. A recursive function may be missing its base case.`);
    }
    // Arguments are evaluated in the caller, before the new frame exists.
    const bound = fn.params.map((p, i) =>
      p.type.ref
        ? { ref: this.ref(args[i]), value: UNINIT as Value }
        : { ref: null, value: this.owned(args[i], this.coerce(p.type, this.valueFor(p.type, args[i]), callLine), callLine) }
    );
    const frame = this.mem.pushFrame(qualifiedName(fn), fn.className, thisAddr, callLine);
    fn.params.forEach((p, i) => this.mem.declare(p.name, p.type, false, bound[i].value, bound[i].ref));

    if (fn.kind === "ctor" && thisAddr) {
      const cls = this.classes.get(fn.className!)!;
      for (const init of fn.inits) {
        const field = cls.fields.find((f) => f.name === init.field);
        if (!field) throw compileError(`${cls.name} has no member named "${init.field}".`, init.line);
        if (init.args.length > 1) throw unsupported("A member initialiser with several values", init.line);
        const v = init.args.length === 1 ? this.coerce(field.type, this.value(init.args[0]), init.line) : this.zero(field.type);
        this.mem.write(`${thisAddr}.${init.field}`, this.copyOwned(v, init.line));
      }
    }

    const shown = fn.params.map((p, i) => `${p.name}=${bound[i].ref ? "&" : this.brief(bound[i].value)}`).join(", ");
    this.line = fn.line;
    this.step("call", fn.line, `Enter ${frame.name}(${shown})`);

    let result: Value = UNINIT;
    try {
      this.execBlock(fn.body, false);
    } catch (e) {
      if (e instanceof ReturnSignal) result = e.value;
      else if (e instanceof BreakSignal || e instanceof ContinueSignal) throw compileError("break or continue is used outside a loop.", this.line);
      else throw e;
    }
    this.destroyScope(frame, frame.scopes[0]);
    this.mem.popFrame();
    this.line = callLine;
    if (fn.ret.base === "void" && fn.ret.ptr === 0) return UNINIT;
    return this.coerce(fn.ret, result, fn.line);
  }

  // ---- lvalues -------------------------------------------------------------

  private varAddr(name: string, line: number): string {
    const frame = this.mem.top();
    const slot = this.mem.findSlot(frame, name);
    if (slot) return this.mem.slotAddr(frame, slot);
    if (frame.thisAddr && frame.className && this.classes.get(frame.className)?.fields.some((f) => f.name === name)) {
      return `${frame.thisAddr}.${name}`; // a member used by its bare name inside a method
    }
    if (this.hasGlobals && frame !== this.mem.frames[0]) {
      const g = this.mem.findSlot(this.mem.frames[0], name);
      if (g) return this.mem.slotAddr(this.mem.frames[0], g);
    }
    throw compileError(`"${name}" is not declared here.`, line);
  }

  private checkPointer(v: Value, e: Expr): string {
    if (isK(v, "uninit")) {
      throw fault("uninitialised_pointer", `${exprText(e)} was never given a value, so it does not point at a real object. Following it is an error.`);
    }
    if (!isPtr(v)) throw compileError(`${exprText(e)} is not a pointer, so -> and * cannot be used on it.`, e.line);
    if (v.a === null) {
      throw fault("null_dereference", `${exprText(e)} is nullptr, so there is no object to reach through it.`);
    }
    return v.a;
  }

  /** Address of the object a pointer expression points at. */
  private pointee(e: Expr): string {
    return this.pointeeOf(this.value(e), e);
  }

  /** Same, for a value already computed. For a list iterator: the element it stands on. */
  private pointeeOf(v: Value, e: Expr): string {
    if (isIter(v)) return this.lists.elem(v, exprText(e));
    const a = this.checkPointer(v, e);
    const target = this.mem.read(a); // faults if the memory is gone
    return isK(target, "arr") ? `${a}.0` : a; // p->x on a heap array means element 0
  }

  /** Address of an lvalue expression. */
  private ref(e: Expr): string {
    switch (e.k) {
      case "var": return this.varAddr(e.name, e.line);
      case "member": return `${e.arrow ? this.pointee(e.obj) : this.ref(e.obj)}.${e.field}`;
      case "deref": return this.pointee(e.e);
      case "mcall": {
        // nums.front() = 5;  nums.back() += 1;
        const la = e.arrow ? this.pointee(e.obj) : this.ref(e.obj);
        const target = this.mem.read(la);
        if (isK(target, "obj") && this.lists.info(target.type) && (e.method === "front" || e.method === "back") && e.args.length === 0) {
          return this.lists.endRef(la, e.method === "front" ? "head" : "tail", e.method, exprText(e.obj));
        }
        throw compileError("this expression cannot be assigned to or have its address taken.", e.line);
      }
      case "index": {
        const base = this.value(e.arr);
        const i = this.int(this.value(e.idx), e.idx);
        if (isK(base, "arr") || isK(base, "str")) return `${this.ref(e.arr)}.${i}`;
        const a = this.checkPointer(base, e.arr);
        if (isK(this.mem.read(a), "arr")) return `${a}.${i}`;
        if (i === 0) return a;
        throw fault("out_of_bounds", `${exprText(e.arr)} points at a single object, not an array, so index ${i} is outside it.`);
      }
      default:
        throw compileError("this expression cannot be assigned to or have its address taken.", e.line);
    }
  }

  // ---- values --------------------------------------------------------------

  /** An array used where a pointer is expected becomes a pointer to that array, as in C++ (`int* p = arr;`, `sort(arr, n)`). */
  private decay(t: TypeRef, v: Value, e: Expr): Value {
    return t.ptr > 0 && isK(v, "arr") ? ptr(this.ref(e)) : v;
  }

  private valueFor(t: TypeRef, e: Expr): Value {
    return this.decay(t, this.value(e), e);
  }

  /** Reject a value that was never initialised when the program tries to USE it. */
  private use(v: Value, e: Expr): Value {
    if (isK(v, "uninit")) {
      throw fault("uninitialised_read", `${exprText(e)} is used here before it was given a value. In real C++ it would hold an unpredictable value.`);
    }
    return v;
  }

  private num(v: Value, e: Expr): number {
    this.use(v, e);
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (isK(v, "dbl")) return v.v;
    if (isK(v, "chr")) return v.c.charCodeAt(0);
    throw compileError(`${exprText(e)} is ${KIND_WORDS[kindOf(v)]}, but a number is needed here.`, e.line);
  }

  private int(v: Value, e: Expr): number {
    return Math.trunc(this.num(v, e));
  }

  private truthy(v: Value, e: Expr): boolean {
    this.use(v, e);
    if (isIter(v)) throw compileError(`${exprText(e)} is an iterator, so it cannot be used as a condition. Compare it with end(), for example it != nums.end().`, e.line);
    if (isPtr(v)) return v.a !== null;
    if (isK(v, "str") || isK(v, "obj") || isK(v, "arr")) throw compileError(`${exprText(e)} cannot be used as a condition.`, e.line);
    return this.num(v, e) !== 0;
  }

  private equal(l: Value, r: Value): boolean {
    if (isPtr(l) || isPtr(r)) {
      const a = isPtr(l) ? l.a : l === 0 ? null : undefined;
      const b = isPtr(r) ? r.a : r === 0 ? null : undefined;
      return a !== undefined && a === b;
    }
    if (isK(l, "str") && isK(r, "str")) return l.s === r.s;
    const n = (v: Value) => (typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : isK(v, "dbl") ? v.v : isK(v, "chr") ? v.c.charCodeAt(0) : NaN);
    return n(l) === n(r);
  }

  /** Text that `cout << v` prints. */
  private printed(v: Value): string {
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "1" : "0";
    switch (v.k) {
      case "dbl": return formatDouble(v.v);
      case "chr": return v.c;
      case "str": return v.s;
      case "ptr": {
        if (v.iter) throw compileError("cout cannot print an iterator. Print the element it stands on with *it.", this.line);
        if (v.a === null) return "0";
        const n = Number(v.a.split(".")[0].slice(1));
        return `0x${(n * 0x100).toString(16)}`;
      }
      default: throw compileError("cout cannot print a whole object or array. Print its members one at a time.", this.line);
    }
  }

  /** Short text for a value in a "call" label. */
  private brief(v: Value): string {
    if (isIter(v) && v.a === null) return "end()";
    if (isPtr(v)) return v.a === null ? "nullptr" : `→${v.a.replace(/\./g, "_")}`;
    if (isK(v, "uninit")) return "?";
    if (isK(v, "obj")) return v.type;
    if (isK(v, "arr")) return "array";
    if (isK(v, "str")) return JSON.stringify(v.s);
    if (isK(v, "chr")) return `'${v.c}'`;
    if (typeof v === "boolean") return String(v);
    return this.printed(v);
  }

  /** Convert a value to the declared type of the place it is stored in. */
  private coerce(t: TypeRef, v: Value, line: number): Value {
    if (isK(v, "uninit")) return v;
    const bad = () => compileError(`a ${typeText({ ...t, ref: false })} cannot hold ${isIter(v) ? `a ${v.iter}::iterator` : KIND_WORDS[kindOf(v)]}.`, line);
    const iterOf = this.lists.iteratorOf(t);
    if (iterOf) {
      if (isIter(v) && v.iter === iterOf) return v;
      throw bad();
    }
    if (isIter(v)) throw bad();
    if (t.ptr > 0) {
      if (isPtr(v)) return v;
      if (v === 0) return NULL_PTR;
      throw bad();
    }
    const numeric = typeof v === "number" || typeof v === "boolean" || isK(v, "dbl") || isK(v, "chr");
    const n = typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : isK(v, "dbl") ? v.v : isK(v, "chr") ? v.c.charCodeAt(0) : 0;
    switch (t.base) {
      case "int": if (!numeric) throw bad(); return Math.trunc(n) | 0;
      case "double": case "float": if (!numeric) throw bad(); return dbl(n);
      case "bool": if (isPtr(v)) return v.a !== null; if (!numeric) throw bad(); return n !== 0;
      case "char": if (!numeric) throw bad(); return isK(v, "chr") ? v : chr(String.fromCharCode(n & 0xff));
      case "string": if (isK(v, "str")) return v; if (isK(v, "chr")) return str(v.c); throw bad();
      case "void": throw bad();
      default:
        if (isK(v, "obj") && v.type === t.base) return v;
        throw bad();
    }
  }

  private arith(op: string, l: Value, r: Value, le: Expr, re: Expr, line: number): Value {
    if (isK(l, "str") || isK(r, "str")) {
      const text = (v: Value, e: Expr) => {
        if (isK(v, "str")) return v.s;
        if (isK(v, "chr")) return v.c;
        throw compileError(`${exprText(e)} cannot be joined to a string with ${op}.`, line);
      };
      if (op === "+") {
        const [a, b] = [text(l, le), text(r, re)];
        if (a.length + b.length > MAX_STRING_CHARS) {
          throw new StopSignal("truncated", `The string grew past ${MAX_STRING_CHARS} characters, so the trace stops here.`);
        }
        return str(a + b);
      }
      if (isK(l, "str") && isK(r, "str")) {
        switch (op) {
          case "<": return l.s < r.s;
          case ">": return l.s > r.s;
          case "<=": return l.s <= r.s;
          case ">=": return l.s >= r.s;
        }
      }
      throw compileError(`the operator ${op} does not work on strings.`, line);
    }
    if (isIter(l) || isIter(r)) throw compileError(`a list iterator cannot be used with ${op}. Move it one element at a time with ++it or --it, or use std::next(it).`, line);
    if (isPtr(l) || isPtr(r)) throw unsupported("Pointer arithmetic and ordering comparisons between pointers", line, "Use an index (p[i]) or walk the list with ->next.");
    const a = this.num(l, le);
    const b = this.num(r, re);
    const real = isK(l, "dbl") || isK(r, "dbl");
    switch (op) {
      case "+": return real ? dbl(a + b) : (a + b) | 0;
      case "-": return real ? dbl(a - b) : (a - b) | 0;
      case "*": return real ? dbl(a * b) : Math.imul(a, b);
      case "/":
        if (real) return dbl(a / b);
        if (b === 0) throw fault("division_by_zero", "This divides by zero.");
        return Math.trunc(a / b);
      case "%":
        if (real) throw compileError("% needs whole numbers on both sides.", line);
        if (b === 0) throw fault("division_by_zero", "This takes a remainder of division by zero.");
        return a % b;
      case "<": return a < b;
      case ">": return a > b;
      case "<=": return a <= b;
      case ">=": return a >= b;
    }
    throw compileError(`unknown operator ${op}.`, line);
  }

  private assign(e: Extract<Expr, { k: "assign" }>): Value {
    if (e.target.k === "index" && isK(this.value(e.target.arr), "str")) {
      throw unsupported("Changing one character of a string (s[i] = ...)", e.line, "Build a new string instead, for example with +.");
    }
    let v = this.value(e.value);
    const addr = this.ref(e.target);
    const placed = this.mem.typeAt(addr);
    if (e.op === "=" && placed && !placed.isArray) v = this.decay(placed.type, v, e.value);
    if (e.op !== "=") {
      const op = (e.op as AssignOp)[0];
      v = this.arith(op, this.use(this.mem.read(addr), e.target), this.use(v, e.value), e.target, e.value, e.line);
    }
    const t = placed;
    if (t && !t.isArray) v = this.coerce(t.type, v, e.line);
    else if (t?.isArray) throw compileError("a whole array cannot be assigned. Copy its elements one at a time.", e.line);
    if (this.hasLists(v)) {
      // b = a; copies a's nodes, and b's old nodes are deleted.
      const fresh = this.owned(e.value, v, e.line);
      const old = this.mem.read(addr);
      if (this.lists.typeOf(old)) this.lists.replace(addr, fresh, e.line);
      else { this.destroyLists(old, addr); this.mem.write(addr, fresh); }
      return fresh;
    }
    this.mem.write(addr, copyValue(v));
    return v;
  }

  private value(e: Expr): Value {
    switch (e.k) {
      case "int": return e.v;
      case "float": return dbl(e.v);
      case "char": return chr(e.v);
      case "string": return str(e.v);
      case "bool": return e.v;
      case "null": return NULL_PTR;
      case "this": {
        const a = this.mem.top().thisAddr;
        if (!a) throw compileError("`this` can only be used inside a member function.", e.line);
        return ptr(a);
      }
      case "var": case "member": case "index": case "deref":
        return this.mem.read(this.ref(e));
      case "addr": return ptr(this.ref(e.e));
      case "unary": {
        const v = this.value(e.e);
        if (e.op === "!") return !this.truthy(v, e.e);
        const n = this.num(v, e.e);
        if (e.op === "+") return v;
        return isK(v, "dbl") ? dbl(-n) : -n | 0;
      }
      case "binary": {
        if (e.op === "&&") return this.truthy(this.value(e.l), e.l) && this.truthy(this.value(e.r), e.r);
        if (e.op === "||") return this.truthy(this.value(e.l), e.l) || this.truthy(this.value(e.r), e.r);
        const l = this.use(this.value(e.l), e.l);
        const r = this.use(this.value(e.r), e.r);
        if (e.op === "==") return this.equal(l, r);
        if (e.op === "!=") return !this.equal(l, r);
        return this.arith(e.op, l, r, e.l, e.r, e.line);
      }
      case "assign": return this.assign(e);
      case "incdec": {
        if (e.target.k === "mcall" || e.target.k === "call") {
          // --nums.end(): an iterator that a call gave back can be moved where it stands.
          const temp = this.value(e.target);
          if (isIter(temp)) {
            const moved = this.lists.step(temp, e.delta, exprText(e.target));
            return e.prefix ? moved : temp;
          }
        }
        const addr = this.ref(e.target);
        const cur = this.use(this.mem.read(addr), e.target);
        if (isIter(cur)) {
          const moved = this.lists.step(cur, e.delta, exprText(e.target));
          this.mem.write(addr, moved);
          return e.prefix ? moved : cur;
        }
        if (isPtr(cur)) throw unsupported("++ or -- on a pointer (pointer arithmetic)", e.line, "Walk a list with p = p->next.");
        const n = this.num(cur, e.target) + e.delta;
        const next: Value = isK(cur, "dbl") ? dbl(n) : isK(cur, "chr") ? chr(String.fromCharCode(n & 0xff)) : n | 0;
        this.mem.write(addr, next);
        return e.prefix ? next : cur;
      }
      case "ternary":
        return this.truthy(this.value(e.c), e.c) ? this.value(e.a) : this.value(e.b);
      case "call": return this.call(e);
      case "mcall": return this.methodCall(e);
      case "new": return this.newObject(e);
      case "newArray": return this.newArray(e);
    }
  }
}
