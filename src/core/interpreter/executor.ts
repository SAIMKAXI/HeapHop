// Executor: walks the AST, changes Memory, and asks the Recorder for one step per
// statement. It knows nothing about how steps are stored or drawn.
import { MAX_STRING_CHARS, type RunLimits, type RuntimeErrorInfo, type StepKind, type TraceStatus } from "../types";
import {
  qualifiedName, typeText,
  type AssignOp, type BuiltinClass, type ClassDef, type Declarator, type Expr, type FuncDef, type Program, type Stmt, type TypeRef,
} from "./ast";
import { fault, RuntimeFault, SourceError, StopSignal, unsupported } from "./errors";
import { InputReader } from "./input";
import { Memory, type Frame, type Slot } from "./memory";
import { formatDouble, Recorder } from "./recorder";
import { ListRuntime } from "./stl";
import { introsort, lowerBound, makeHeap, nextPermutation, popHeap, pushHeap, reverse, sortHeap, stableSort, upperBound, type Less } from "./algorithms";
import { SEQUENCES, splitTemplate, substitute, typeFromText } from "./typetable";
import {
  GlibcRandom, intKind, LIMIT_CONSTANTS, numericLimit, scalarLayout, SHORT_TYPES, toBig, toWide, WIDE_TYPES, wideArith, type WideOp,
} from "./numbers";
import { chr, copyValue, dbl, iter, kindOf, NULL_PTR, ptr, str, UNINIT, wide, type Ptr, type Value } from "./values";

/** A standard container's description (vector, stack, map...). */
type Seq = Extract<BuiltinClass, { kind: "vector" | "deque" | "stack" | "queue" | "set" | "pq" | "map" }>;

class BreakSignal {}
class ContinueSignal {}
class ReturnSignal {
  constructor(public value: Value) {}
}
/** exit(n): the program ends at once. */
class ExitSignal {
  constructor(public code: number) {}
}
/** `throw x;`: an exception on its way up to the nearest catch that takes its type. */
class ThrowSignal {
  constructor(public value: Value, public type: TypeRef, public line: number) {}
}
const isControl = (e: unknown) => e instanceof BreakSignal || e instanceof ContinueSignal || e instanceof ReturnSignal || e instanceof ThrowSignal;

const isObject = (v: Value): v is Exclude<Value, number | boolean> => typeof v === "object";
const isPtr = (v: Value): v is Ptr => isObject(v) && v.k === "ptr";
/** A std::list iterator (a pointer that knows its list). */
const isIter = (v: Value): v is Ptr => isPtr(v) && v.iter !== undefined;
const isK = <K extends string>(v: Value, k: K): v is Extract<Value, { k: K }> => isObject(v) && v.k === k;

const KIND_WORDS: Record<string, string> = {
  int: "a number", bool: "a bool", dbl: "a decimal number", chr: "a character", str: "a string",
  ptr: "a pointer", obj: "an object", arr: "an array", uninit: "an uninitialised value", wide: "a whole number",
};

/** glibc's ctype classes, so isdigit('5') gives 2048 as it does with g++ on Linux. */
const CTYPE: Record<string, [number, (c: string) => boolean]> = {
  isupper: [256, (c) => c >= "A" && c <= "Z"],
  islower: [512, (c) => c >= "a" && c <= "z"],
  isalpha: [1024, (c) => /[A-Za-z]/.test(c)],
  isdigit: [2048, (c) => c >= "0" && c <= "9"],
  isxdigit: [4096, (c) => /[0-9A-Fa-f]/.test(c)],
  isspace: [8192, (c) => /[ \t\n\v\f\r]/.test(c)],
  isprint: [16384, (c) => c >= " " && c <= "~"],
  isgraph: [32768, (c) => c > " " && c <= "~"],
  isblank: [1, (c) => c === " " || c === "\t"],
  iscntrl: [2, (c) => c < " " || c === "\x7f"],
  ispunct: [4, (c) => /[!-\/:-@[-`{-~]/.test(c)],
  isalnum: [8, (c) => /[A-Za-z0-9]/.test(c)],
};

/** <cmath> functions that take and give doubles. */
const MATH: Record<string, (...x: number[]) => number> = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, pow: Math.pow, exp: Math.exp, log: Math.log, log2: Math.log2, log10: Math.log10,
  floor: Math.floor, ceil: Math.ceil, round: (x) => (x < 0 ? -Math.round(-x) : Math.round(x)), trunc: Math.trunc,
  fabs: Math.abs, fmod: (a, b) => a % b, hypot: Math.hypot, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  atan: Math.atan, atan2: Math.atan2, fmax: Math.max, fmin: Math.min,
};

/**
 * round(|v| * 10^k) exactly, ties to even, as glibc's printf rounds: from the double's exact
 * binary value, so 91.25 with one decimal gives 91.2 (JS's toFixed would give 91.3).
 */
function exactScaled(v: number, k: number): bigint {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(v));
  const hi = view.getUint32(0), lo = view.getUint32(4);
  const expBits = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << BigInt(32)) | BigInt(lo);
  let e: number;
  if (expBits === 0) e = -1074;
  else { mant |= BigInt(1) << BigInt(52); e = expBits - 1075; }
  const ten = BigInt(10);
  let num = mant * (k >= 0 ? ten ** BigInt(k) : BigInt(1));
  let den = k < 0 ? ten ** BigInt(-k) : BigInt(1);
  if (e >= 0) num <<= BigInt(e); else den <<= BigInt(-e);
  let q = num / den;
  const twice = (num % den) * BigInt(2);
  if (twice > den || (twice === den && q % BigInt(2) === BigInt(1))) q += BigInt(1);
  return q;
}

const signOf = (v: number) => (v < 0 || Object.is(v, -0) ? "-" : "");

/** printf("%.*f"): a double with `p` digits after the point. */
function fixedText(v: number, p: number): string {
  if (!Number.isFinite(v)) return formatDouble(v);
  const places = Math.min(Math.max(p, 0), 60);
  let digits = exactScaled(v, places).toString();
  if (places > 0) {
    digits = digits.padStart(places + 1, "0");
    digits = `${digits.slice(0, -places)}.${digits.slice(-places)}`;
  }
  return signOf(v) + digits;
}

/** printf("%.*g"), which cout uses for doubles by default: `p` significant digits, no trailing zeros. */
function generalText(v: number, p: number): string {
  if (!Number.isFinite(v)) return formatDouble(v);
  const digits = Math.min(Math.max(p === 0 ? 1 : p, 1), 60);
  if (v === 0) return `${signOf(v)}0`;
  let exp = Math.floor(Math.log10(Math.abs(v)));
  let q = exactScaled(v, digits - 1 - exp);
  const ten = BigInt(10);
  if (q >= ten ** BigInt(digits)) { exp++; q = exactScaled(v, digits - 1 - exp); }
  else if (q < ten ** BigInt(digits - 1)) { exp--; q = exactScaled(v, digits - 1 - exp); }
  const d = q.toString();
  const trim = (t: string) => (t.includes(".") ? t.replace(/\.?0+$/, "") : t);
  if (exp < -4 || exp >= digits) {
    const m = trim(d.length > 1 ? `${d[0]}.${d.slice(1)}` : d);
    return `${signOf(v)}${m}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
  }
  const places = digits - 1 - exp;
  const padded = d.padStart(places + 1, "0");
  return signOf(v) + trim(places > 0 ? `${padded.slice(0, -places)}.${padded.slice(-places)}` : padded);
}

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
  /** The VS Code extension's larger C++ is switched on. */
  private extended: boolean;
  /** A `cin >> x` used as a condition failed; reads fail until cin.clear(). */
  private cinFailed = false;
  private random = new GlibcRandom();
  /**
   * Static variables, by name: `countCalls::count` (a static local) or `Counter::total`
   * (a static member). They all live in the globals frame.
   */
  private staticSlots = new Map<string, string>();
  /** Exceptions being handled (inside their catch blocks), innermost last: what `throw;` rethrows. */
  private caught: ThrowSignal[] = [];
  private constructCache = new Map<string, boolean>();
  /** cout's settings from <iomanip> (extended mode). */
  private io = { fixed: false, precision: 6, width: 0, fill: " ", left: false, boolalpha: false };
  /** Lambdas made so far, by the id their value carries, with the frame they were written in. */
  private closures = new Map<number, { fn: FuncDef; frame: Frame }>();
  /** Function templates given types: `maxOf<int>`. */
  private instances = new Map<string, FuncDef>();

  constructor(
    private program: Program,
    private src: string[],
    private limits: RunLimits,
    input = ""
  ) {
    this.stdin = new InputReader(input);
    this.classes = program.classes;
    this.extended = program.constants !== undefined;
    this.mem = new Memory(this.classes, limits);
    this.rec = new Recorder(this.mem, this.classes, limits, program.enums);
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
        if (this.program.globals.length > 0 || this.needsStatics()) {
          this.hasGlobals = true;
          this.mem.pushFrame("globals", null, null, 0);
          this.createClassStatics();
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
      if (e instanceof ThrowSignal) {
        const what = this.describeException(e);
        const message = `${what} was thrown on line ${e.line} and no catch block took it, so the program stops (std::terminate is called).`;
        this.rec.capture({ kind: "error", line: e.line, label: message, error: { code: "other", message } }, true);
        return { status: "error", notice: `The program stopped on line ${e.line}: ${message}` };
      }
      if (e instanceof ExitSignal) {
        const left = this.mem.heap.size;
        const leak = left === 0 ? "" : ` ${left} object${left === 1 ? "" : "s"} created with new ${left === 1 ? "was" : "were"} never deleted.`;
        this.rec.capture({ kind: "end", line: this.line, label: `exit(${e.code}) ends the program here.${leak}` }, true);
        return { status: "completed" };
      }
      throw e;
    }
  }

  /** Does the program have static variables (they need the globals frame)? */
  private needsStatics(): boolean {
    if (!this.extended) return false;
    if ([...this.classes.values()].some((c) => (c.statics?.length ?? 0) > 0)) return true;
    const hasStatic = (body: Stmt[]): boolean => body.some((s) => {
      switch (s.k) {
        case "decl": return s.items.some((d) => d.isStatic);
        case "if": return hasStatic(s.then) || (s.else !== null && hasStatic(s.else));
        case "while": case "doWhile": case "rangeFor": case "block": return hasStatic(s.body);
        case "for": return hasStatic(s.body);
        case "switch": return s.cases.some((c) => hasStatic(c.body));
        case "try": return hasStatic(s.body) || s.catches.some((c) => hasStatic(c.body));
        default: return false;
      }
    });
    const all = [...this.program.functions, ...[...this.classes.values()].flatMap((c) => [...c.methods, ...c.ctors, ...(c.dtor ? [c.dtor] : [])])];
    return all.some((f) => hasStatic(f.body));
  }

  /** `static int count;` members: created once, zero-filled, before main starts. */
  private createClassStatics() {
    const globals = this.mem.frames[0];
    for (const cls of new Set(this.classes.values())) {
      for (const f of cls.statics ?? []) {
        const key = `${cls.name}::${f.name}`;
        if (this.staticSlots.has(key)) continue;
        const v = f.init ? this.coerce(f.type, this.value(f.init), f.line) : f.arraySize !== null
          ? { k: "arr" as const, e: Array.from({ length: f.arraySize }, () => this.zero(f.type)) }
          : this.zero(f.type);
        const slot = this.mem.declareIn(globals, key, f.type, f.arraySize !== null, v);
        this.staticSlots.set(key, this.mem.slotAddr(globals, slot));
      }
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
      const cls = this.classes.get(v.type);
      if (this.extended && cls) { this.destroyObject(cls, addr); return; }
      const dtor = cls?.dtor;
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
      case "throw":
        this.throwStatement(s);
        return;
      case "try":
        this.tryStatement(s);
        return;
      case "cout": {
        // Each part is printed as soon as it is evaluated: in `cout << "a" << f()`, "a"
        // appears before anything f() prints.
        for (const p of s.parts) {
          if (this.extended && this.manipulator(p)) continue;
          const text = this.extended ? this.formatted(this.use(this.value(p), p)) : this.printed(this.use(this.value(p), p));
          this.rec.print(text);
        }
        this.line = s.line;
        this.step("output", s.line);
        return;
      }
    }
  }

  // ---- exceptions (extended mode) ------------------------------------------

  private throwStatement(s: Extract<Stmt, { k: "throw" }>) {
    if (!s.e) {
      // throw;  inside a catch: the same exception goes on up
      const current = this.caught[this.caught.length - 1];
      if (!current) {
        const message = "throw; is used with no exception being handled, so the program stops (std::terminate is called).";
        throw fault("other", message);
      }
      this.step("statement", s.line, `${this.srcLine(s.line)}  →  ${this.describeException(current)} goes on up`);
      throw new ThrowSignal(current.value, current.type, s.line);
    }
    const v = this.copyOwned(this.use(this.value(s.e), s.e), s.line);
    const signal = new ThrowSignal(v, this.thrownType(s.e, v), s.line);
    this.line = s.line;
    this.step("statement", s.line, `${this.srcLine(s.line)}  →  ${this.describeException(signal)} is thrown`);
    throw signal;
  }

  private tryStatement(s: Extract<Stmt, { k: "try" }>) {
    try {
      this.execBlock(s.body);
    } catch (e) {
      if (!(e instanceof ThrowSignal)) throw e;
      const clause = s.catches.find((c) => this.catchTakes(c.type, e));
      if (!clause) throw e;
      const frame = this.mem.top();
      frame.scopes.push([]);
      this.caught.push(e);
      try {
        this.line = clause.line;
        if (clause.type && clause.name) {
          const t = { ...clause.type, ref: false };
          const cls = t.ptr === 0 ? this.classes.get(t.base) : undefined;
          // By value, an object is copied as the catch's class (sliced); by reference it stays whole.
          const v = cls && !clause.type.ref && isK(e.value, "obj") ? this.slice(e.value, cls.name) : copyValue(e.value);
          this.mem.declare(clause.name, t, false, v);
        }
        this.step("statement", clause.line, `${this.srcLine(clause.line)}  ←  catches ${this.describeException(e)}`);
        this.execBlock(clause.body);
      } catch (inner) {
        this.caught.pop();
        if (isControl(inner)) this.closeScope(frame);
        throw inner;
      }
      this.caught.pop();
      this.closeScope(frame);
    }
  }

  /** Does `catch (type)` take this exception? Only exact types, or a base class of a thrown object. */
  private catchTakes(type: TypeRef | null, e: ThrowSignal): boolean {
    if (!type) return true; // catch (...)
    if (type.ptr !== e.type.ptr) return false;
    if (type.base === e.type.base) return true;
    return this.classes.has(type.base) && this.isA(e.type.base, type.base);
  }

  /** The type of a thrown value: `throw "empty"` is a const char*, `throw 5` an int. */
  private thrownType(e: Expr, v: Value): TypeRef {
    const t = (base: string, p = 0): TypeRef => ({ base, ptr: p, ref: false });
    if (e.k === "string") return t("char", 1);
    if (isK(v, "obj")) return t(v.type);
    const known = this.staticType(e);
    if (known) return { ...known, ref: false };
    if (typeof v === "number") return t("int");
    if (typeof v === "boolean") return t("bool");
    switch (v.k) {
      case "dbl": return t("double");
      case "chr": return t("char");
      case "str": return t("string");
      case "wide": return t(v.bits === 64 ? (v.u ? "unsigned long long" : "long long") : v.u ? "unsigned int" : "int");
      default: return t("int");
    }
  }

  /** "a std::runtime_error ("Stack is empty")", "the int 5", "the const char* "oops"". */
  private describeException(e: ThrowSignal): string {
    const v = e.value;
    if (isK(v, "obj")) {
      const std = this.isStdException(v.type);
      const message = this.exceptionMessage(v);
      return `a ${std ? `std::${v.type}` : v.type}${message !== null ? ` ("${message}")` : ""}`;
    }
    const name = e.type.ptr === 1 && e.type.base === "char" ? "const char*" : typeText(e.type);
    return `the ${name} ${isK(v, "str") ? JSON.stringify(v.s) : this.brief(v)}`;
  }

  private isStdException(type: string): boolean {
    return this.classes.get(type)?.builtin?.kind === "exception";
  }

  /** what() of an exception object, when it comes from a standard exception. */
  private exceptionMessage(v: Value): string | null {
    if (!isK(v, "obj")) return null;
    const m = v.f.message;
    if (!this.isA(v.type, "exception") || !m || !isK(m, "str")) return null;
    const own = this.findMethod(this.classes.get(v.type), "what", 0);
    return own ? null : m.s;
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
      case "long": case "long long": case "unsigned int": case "unsigned long": case "unsigned long long": case "size_t":
      case "short": case "unsigned short": {
        if (!this.extended) break;
        if (!/^[+-]?\d+$/.test(token)) throw out(`the next input is "${token}", which is not a whole number`);
        this.mem.write(addr, this.coerce(t.type, wide(BigInt(token), 64, false), line));
        return token;
      }
      case "double": case "float": {
        if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(token)) throw out(`the next input is "${token}", which is not a number`);
        this.mem.write(addr, dbl(parseFloat(token)));
        return token;
      }
    }
    throw compileError(`cin cannot read a ${typeText({ ...t.type, ref: false })}.`, line);
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
    let cell = this.mem.heap.get(v.a);
    if (!cell && this.extended && /^h\d+\.0$/.test(v.a) && this.mem.heap.get(v.a.slice(0, -2))?.isArray) {
      cell = this.mem.heap.get(v.a.slice(0, -2));
      v.a = v.a.slice(0, -2);
    }
    if (!cell) {
      const dead = this.mem.freed.get(v.a);
      if (dead) {
        throw fault("double_free", `${exprText(e)} points at a ${dead.type} that was already deleted on line ${dead.line}. Deleting the same memory twice is an error.`);
      }
      throw fault("invalid_free", `${exprText(e)} does not point at the start of memory created with new, so it cannot be deleted.`);
    }
    const declared = this.extended ? this.staticType(e) : null;
    const staticCls = declared && declared.ptr === 1 ? this.classes.get(declared.base) : undefined;
    const value = cell.value;
    if (staticCls && isK(value, "obj") && value.type !== staticCls.name && this.isA(value.type, staticCls.name) && !this.virtualDtor(staticCls)) {
      // delete through a base-class pointer without a virtual destructor: only the base part's destructor runs
      this.destroyObject(staticCls, v.a);
    } else {
      this.destroyValue(value, v.a);
    }
    this.line = line;
    this.mem.free(v.a, line);
    this.step("statement", line);
  }

  private virtualDtor(cls: ClassDef): boolean {
    for (let c: ClassDef | undefined = cls; c; c = c.bases ? this.classes.get(c.bases[0]) : undefined) if (c.dtor?.isVirtual) return true;
    return false;
  }

  private declare(d: Declarator) {
    if (d.isStatic && this.extended) return this.declareStatic(d);
    if (d.name.includes("::") && this.extended) {
      // int Counter::count = 0;  the definition of a static member, made before main starts
      const addr = this.staticSlots.get(d.name);
      if (!addr) throw compileError(`"${d.name}" is not a static member declared in its class.`, d.line);
      if (d.init) this.mem.write(addr, this.coerce(d.type, this.value(d.init), d.line));
      return;
    }
    if (this.extended && d.bindings) return this.declareBindings(d);
    if (this.extended && d.type.ref && d.init) {
      // int& x = v[i];  a second name for a variable that exists
      let target: string | null = null;
      try { target = this.ref(d.init); } catch { target = null; }
      if (target) {
        const placed = this.mem.typeAt(target);
        const type = d.type.base === "auto" ? { ...(placed?.type ?? { base: "int", ptr: 0, ref: false }), ref: true } : d.type;
        this.mem.declare(d.name, type, placed?.isArray ?? false, UNINIT, target);
        return;
      }
      // const int& x = 5;  a reference to a temporary: it holds the value
      d = { ...d, type: { ...d.type, ref: false } };
    }
    if (d.type.base === "auto") return this.declareAuto(d);
    const t = d.type;
    // Globals have static storage, so C++ fills them with zeros; locals start unknown.
    const global = this.hasGlobals && this.mem.frames.length === 1;
    const blank = (ty: TypeRef) => (global ? this.zero(ty) : this.fresh(ty));
    const cls = t.ptr === 0 ? this.classes.get(t.base) : undefined;

    if (this.extended && cls?.builtin && cls.builtin.kind !== "exception" && !this.lists.info(cls.name) && d.arraySize === null && d.initList === null) {
      // vector<int> v(5, 0);  map<string, int> m;  pair<int, int> p = {1, 2};
      const v = d.init ? this.owned(d.init, this.coerce(t, this.use(this.valueFor(t, d.init), d.init), d.line), d.line)
        : this.stlConstruct(cls, d.ctorArgs ?? [], d.line);
      this.mem.declare(d.name, t, false, v);
      return;
    }

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
      if (cls && this.needsConstruct(cls)) {
        const base = this.mem.slotAddr(this.mem.top(), slot);
        for (let i = 0; i < n; i++) this.construct(cls, `${base}.${i}`, [], d.line);
      }
      return;
    }

    if (cls) {
      if (this.extended) this.checkConcrete(cls, d.line);
      if (d.init) {
        let v = this.valueFor(t, d.init);
        if (this.extended && isK(v, "obj") && v.type !== cls.name && this.isA(v.type, cls.name)) v = this.slice(v, cls.name);
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

  /**
   * `static int count = 0;` in a function: made (and initialised) the first time the line
   * runs, then kept in the globals frame and shared by every later call.
   */
  private declareStatic(d: Declarator) {
    const frame = this.mem.top();
    const key = `${frame.name}::${d.name}`;
    if (this.staticSlots.has(key)) return;
    const globals = this.mem.frames[0];
    const v = d.init ? copyValue(this.coerce(d.type, this.valueFor(d.type, d.init), d.line))
      : d.arraySize ? { k: "arr" as const, e: Array.from({ length: this.int(this.value(d.arraySize), d.arraySize) }, () => this.zero(d.type)) }
      : this.zero(d.type);
    const slot = this.mem.declareIn(globals, key, d.type, d.arraySize !== null, v);
    this.staticSlots.set(key, this.mem.slotAddr(globals, slot));
  }

  // ---- objects -------------------------------------------------------------

  /** Value of a variable that was declared without an initialiser. */
  private fresh(t: TypeRef): Value {
    return t.ptr === 0 && t.base === "string" ? str("") : UNINIT;
  }

  private zero(t: TypeRef): Value {
    if (t.ptr > 0) return NULL_PTR;
    if (this.extended && Object.hasOwn(WIDE_TYPES, t.base)) return toWide(0, t.base);
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
    if (this.extended && cls.builtin) {
      if (SEQUENCES.has(cls.builtin.kind)) return { k: "arr", e: [], cap: 0 };
      if (cls.builtin.kind === "functor") return { k: "obj", type: cls.name, f: Object.create(null) };
      if (cls.builtin.kind === "pair") {
        const f: Record<string, Value> = Object.create(null);
        for (const field of cls.fields) f[field.name] = this.defaultValue(field.type, line);
        return { k: "obj", type: cls.name, f };
      }
    }
    // No prototype: a C++ member may be called __proto__ or constructor.
    const f: Record<string, Value> = Object.create(null);
    for (const field of cls.fields) {
      const nested = field.type.ptr === 0 ? this.classes.get(field.type.base) : undefined;
      if (nested && nested.ctors.length > 0 && !this.extended) {
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
    if (this.extended && "message" in f && this.isA(cls.name, "exception")) {
      // what() of a plain std::exception is "std::exception"; the others get their message from a constructor
      let std: ClassDef | undefined = cls;
      while (std && !std.builtin) std = std.bases ? this.classes.get(std.bases[0]) : undefined;
      f.message = str(std?.name === "exception" ? "std::exception" : "");
    }
    return { k: "obj", type: cls.name, f };
  }

  /**
   * Before a constructor's own member initialisers (extended mode): the base class part is
   * built first, then member objects that have constructors. Returns the initialisers used.
   */
  private constructParts(cls: ClassDef, addr: string, inits: { field: string; args: Expr[] }[], line: number): Set<string> {
    const used = new Set<string>();
    const base = cls.bases ? this.classes.get(cls.bases[0]) : undefined;
    if (base) {
      const init = inits.find((i) => i.field === base.name || i.field === (base.shortName ?? base.name) || i.field === base.name.replace(/^std::/, ""));
      if (init) used.add(init.field);
      if (base.builtin?.kind === "exception") {
        if (init?.args.length) this.mem.write(`${addr}.message`, this.coerce({ base: "string", ptr: 0, ref: false }, this.text(init.args[0]), line));
      } else {
        this.construct(base, addr, init?.args ?? [], line);
      }
    }
    const own = cls.fields.slice(base ? base.fields.length : 0);
    for (const field of own) {
      if (field.type.ptr > 0 || field.arraySize !== null) continue;
      const fc = this.classes.get(field.type.base);
      if (!fc || this.lists.info(fc.name) || fc.builtin) continue;
      const init = inits.find((i) => i.field === field.name);
      if (!init && !this.needsConstruct(fc)) continue;
      if (init) used.add(field.name);
      this.construct(fc, `${addr}.${field.name}`, init?.args ?? [], line);
    }
    return used;
  }

  /** A string from a string or a C string (both are text here). */
  private text(e: Expr): Value {
    const v = this.use(this.value(e), e);
    return isK(v, "chr") ? str(v.c) : v;
  }

  /** Must objects of this class be constructed (a constructor of its own, of its base or of a member)? */
  private needsConstruct(cls: ClassDef): boolean {
    if (!this.extended) return cls.ctors.length > 0;
    const known = this.constructCache.get(cls.name);
    if (known !== undefined) return known;
    this.constructCache.set(cls.name, false); // a class that contains itself by value cannot loop
    const base = cls.bases ? this.classes.get(cls.bases[0]) : undefined;
    const result = cls.ctors.length > 0 || (!!base && !base.builtin && this.needsConstruct(base)) || cls.fields.some((f) => {
      const fc = f.type.ptr === 0 && f.arraySize === null ? this.classes.get(f.type.base) : undefined;
      return !!fc && fc !== cls && !fc.builtin && this.needsConstruct(fc);
    });
    this.constructCache.set(cls.name, result);
    return result;
  }

  /** An abstract class (a pure virtual method nobody overrides): the method's name, else null. */
  private pureMethod(cls: ClassDef): string | null {
    const seen = new Set<string>();
    for (let c: ClassDef | undefined = cls; c; c = c.bases ? this.classes.get(c.bases[0]) : undefined) {
      for (const m of c.methods) {
        if (seen.has(m.name)) continue;
        seen.add(m.name);
        if (m.isPure) return m.name;
      }
    }
    return null;
  }

  private checkConcrete(cls: ClassDef, line: number) {
    if (!this.extended) return;
    const pure = this.pureMethod(cls);
    if (pure) throw compileError(`${cls.shortName ?? cls.name} is an abstract class: ${pure}() is pure virtual (= 0) and ${cls.shortName ?? cls.name} does not override it, so objects of it cannot be created.`, line);
  }

  /** An object copied as one of its base classes keeps only that class's members. */
  private slice(v: Value, type: string): Value {
    if (!isK(v, "obj") || v.type === type) return copyValue(v);
    const cls = this.classes.get(type)!;
    const f: Record<string, Value> = Object.create(null);
    for (const field of cls.fields) f[field.name] = copyValue(v.f[field.name]);
    return { k: "obj", type, f };
  }

  /**
   * The type an expression was declared with (not the type of the object it holds): what
   * C++ uses to choose a non-virtual method. Null when it cannot be told.
   */
  private staticType(e: Expr): TypeRef | null {
    switch (e.k) {
      case "var": {
        const frame = this.mem.top();
        const slot = this.mem.findSlot(frame, e.name);
        if (slot) return slot.type;
        const addr = this.tryVarAddr(e.name);
        return addr ? this.mem.typeAt(addr)?.type ?? null : null;
      }
      case "this": {
        const cn = this.mem.top().className;
        return cn ? { base: cn, ptr: 1, ref: false } : null;
      }
      case "member": {
        const ot = this.staticType(e.obj);
        if (!ot) return null;
        const cls = this.classes.get(ot.base);
        return cls?.fields.find((f) => f.name === e.field)?.type ?? null;
      }
      case "deref": {
        const t = this.staticType(e.e);
        return t && t.ptr > 0 ? { ...t, ptr: t.ptr - 1, ref: false } : null;
      }
      case "index": {
        const t = this.staticType(e.arr);
        if (!t) return null;
        if (t.ptr > 0) return { ...t, ptr: t.ptr - 1, ref: false };
        return t;
      }
      default: return null;
    }
  }

  /** Is `name` virtual in `cls`: declared virtual there or in a class it inherits from? */
  private isVirtual(cls: ClassDef, name: string): boolean {
    for (let c: ClassDef | undefined = cls; c; c = c.bases ? this.classes.get(c.bases[0]) : undefined) {
      if (c.methods.some((m) => m.name === name && m.isVirtual)) return true;
    }
    return false;
  }

  /**
   * The method a call runs: chosen by the declared class, then, for a virtual method,
   * by the class of the object itself.
   */
  private dispatch(staticCls: ClassDef | undefined, dynamic: string, name: string, argc: number): FuncDef | null {
    const dyn = this.classes.get(dynamic);
    if (!this.extended || !staticCls || staticCls === dyn) return this.findMethod(dyn ?? staticCls, name, argc);
    const chosen = this.findMethod(staticCls, name, argc);
    if (!chosen) return this.findMethod(dyn, name, argc);
    if (this.isVirtual(staticCls, name)) return this.findMethod(dyn, name, argc) ?? chosen;
    return chosen;
  }

  /** Destroy an object: its destructor, its own members (last first), then its base part. */
  private destroyObject(cls: ClassDef, addr: string) {
    if (cls.dtor) this.invoke(cls.dtor, [], addr, this.line);
    const base = cls.bases ? this.classes.get(cls.bases[0]) : undefined;
    const own = cls.fields.slice(base ? base.fields.length : 0);
    for (let i = own.length - 1; i >= 0; i--) {
      const v = this.mem.read(`${addr}.${own[i].name}`);
      if (isK(v, "obj") || isK(v, "arr")) this.destroyValue(v, `${addr}.${own[i].name}`);
    }
    if (base && !base.builtin) this.destroyObject(base, addr);
  }

  /** Run the matching constructor on the object at `addr`. */
  private construct(cls: ClassDef, addr: string, args: Expr[], line: number) {
    if (this.extended && cls.ctors.length === 0 && args.length === 0) {
      this.constructParts(cls, addr, [], line);
      return;
    }
    if (cls.builtin?.kind === "exception") {
      if (args.length > 1) throw compileError(`${cls.name} takes one message.`, line);
      if (args.length === 1) this.mem.write(`${addr}.message`, this.coerce({ base: "string", ptr: 0, ref: false }, this.text(args[0]), line));
      return;
    }
    if (cls.ctors.length === 0) {
      if (args.length > cls.fields.length) throw compileError(`${cls.name} has only ${cls.fields.length} members, but ${args.length} values are given.`, line);
      args.forEach((a, i) => {
        const field = cls.fields[i];
        this.mem.write(`${addr}.${field.name}`, this.copyOwned(this.coerce(field.type, this.valueFor(field.type, a), line), line));
      });
      return;
    }
    const ctor = this.pick(cls.ctors, args.length);
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
      this.checkConcrete(cls, e.line);
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
    if (cls) this.checkConcrete(cls, e.line);
    if (cls && this.needsConstruct(cls)) for (let i = 0; i < n; i++) this.construct(cls, `${addr}.${i}`, [], e.line);
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
        case "wide": type = { base: v.bits === 64 ? (v.u ? "unsigned long" : "long long") : v.u ? "unsigned int" : "int", ptr: 0, ref: false }; break;
        case "arr": {
          const known = this.exprType(init);
          if (!known || !this.container(known)) throw compileError(`auto cannot be used for an array. Write the type of "${d.name}".`, d.line);
          type = known;
          break;
        }
        case "ptr": {
          const target = v.a === null ? null : this.mem.typeAt(v.a);
          if (!target) throw compileError(`auto cannot tell what "${d.name}" should point at. Write its type, for example Node* ${d.name} = ...;`, d.line);
          type = { base: target.type.base, ptr: target.type.ptr + 1, ref: false };
          break;
        }
        default: throw compileError(`auto cannot be used for ${KIND_WORDS[kindOf(v)]}. Write the type of "${d.name}".`, d.line);
      }
    }
    this.mem.declare(d.name, type, false, isK(v, "obj") || isK(v, "arr") ? this.owned(init, v, d.line) : copyValue(v));
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
    if (isIter(first)) {
      // list<int> b(a.begin(), a.end()): a copy of the elements from first up to (not including) last.
      const last = args.length === 2 ? this.use(this.value(args[1]), args[1]) : UNINIT;
      if (!isIter(last) || last.iter !== first.iter) throw compileError(`${type}(first, last) needs two iterators of the same list.`, line);
      if (first.iter !== type) throw unsupported(`Making a ${type} from a ${first.iter}`, line);
      const values: Value[] = [];
      for (let it = first; it.a !== last.a; it = this.lists.step(it, 1, exprText(args[0]))) {
        if (it.a === null) throw fault("other", `${exprText(args[1])} cannot be reached by moving forward from ${exprText(args[0])}.`);
        values.push(this.copyOwned(this.mem.read(this.lists.elem(it, exprText(args[0]))), line));
      }
      return this.lists.build(type, values, line);
    }
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
        if (id === null) throw fault("out_of_bounds", `The iterator ${exprText(e.args[0])} is end(), which is not an element, so there is nothing to erase.`);
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
  private rangeFor(s: Extract<Stmt, { k: "rangeFor" }>): void {
    const frame = this.mem.top();
    if (this.extended && s.e.k === "brace") {
      // for (int x : {5, 1, 9}): the values are kept in a hidden array while the loop runs
      const items = s.e.items;
      if (items.length === 0) throw compileError("a range-for loop over {} has nothing to walk.", s.line);
      const first = this.use(this.value(items[0]), items[0]);
      const type = { ...(this.exprType(items[0]) ?? this.typeOfValue(first)), ref: false };
      if (type.ptr === 1 && type.base === "char" && items[0].k === "string") { type.ptr = 0; type.base = "string"; }
      const values = items.map((x, i) => (i === 0 ? this.coerce(type, first, s.line) : this.element(type, x, s.line)));
      const slot = this.mem.declare("(initializer list)", type, true, { k: "arr", e: values });
      return this.rangeFor({ ...s, e: { k: "value", v: UNINIT, at: this.mem.slotAddr(frame, slot), line: s.line } });
    }
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
      if (!placed || (isK(first, "arr") && !this.extended)) throw unsupported("A range-for loop over a two-dimensional array", s.line, "Use two ordinary for loops.");
      const box = placed.isArray ? null : this.container(placed.type);
      if (box && (box.kind === "stack" || box.kind === "queue" || box.kind === "pq")) throw compileError(`a ${this.kindWord(box)} cannot be walked with a range-for loop; take elements off with top()/front() and pop().`, s.line);
      elemType = box ? (box.kind === "map" ? (box as Extract<Seq, { kind: "map" }>).elem : box.elem) : placed.type;
      let i = 0;
      next = () => (i < container.e.length ? `${where}.${i++}` : null);
    } else if (this.extended && isK(container, "str")) {
      // for (char c : s)
      elemType = { base: "char", ptr: 0, ref: false };
      let i = 0;
      next = () => (i < (this.mem.read(where) as Extract<Value, { k: "str" }>).s.length ? `${where}.${i++}` : null);
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
        if (s.bindings) this.bindParts(s.bindings, this.mem.read(a), a, declared.ref, s.line);
        else if (declared.ref) this.mem.declare(s.name, declared, false, UNINIT, a);
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

  /** Does a call with `argc` arguments fit this function (counting default arguments)? */
  private fits(f: FuncDef, argc: number): boolean {
    if (argc > f.params.length) return false;
    for (let i = argc; i < f.params.length; i++) if (!f.params[i].def) return false;
    return true;
  }

  /** Of several functions with one name, the one a call fits: an exact count first. */
  private pick(named: FuncDef[], argc: number): FuncDef | null {
    return named.find((f) => f.params.length === argc) ?? named.find((f) => this.fits(f, argc)) ?? null;
  }

  /** A method by name: the class's own first, then what it inherits. */
  private findMethod(cls: ClassDef | undefined, name: string, argc: number): FuncDef | null {
    for (let c = cls; c; c = c.bases ? this.classes.get(c.bases[0]) : undefined) {
      const m = this.pick(c.methods.filter((x) => x.name === name), argc);
      if (m) return m;
    }
    return null;
  }

  private call(e: Extract<Expr, { k: "call" }>): Value {
    const frame = this.mem.top();
    if (frame.className) {
      const own = this.classes.get(frame.className);
      let m = this.findMethod(own, e.name, e.args.length);
      if (m && this.extended && frame.thisAddr && !m.isStatic) {
        const obj = this.mem.read(frame.thisAddr);
        if (isK(obj, "obj")) m = this.dispatch(own, obj.type, e.name, e.args.length) ?? m;
      }
      if (m?.isPure) throw fault("other", `${m.className}::${m.name}() is pure virtual (= 0), so it has no body to run.`);
      if (m) return this.invoke(m, e.args, m.isStatic ? null : frame.thisAddr, e.line);
    }
    if (this.extended && e.name.includes("::")) {
      // Counter::count(), Base::print() from a derived class
      const cut = e.name.lastIndexOf("::");
      const cls = this.classes.get(e.name.slice(0, cut));
      const m = cls ? this.findMethod(cls, e.name.slice(cut + 2), e.args.length) : null;
      if (m) return this.invoke(m, e.args, m.isStatic ? null : frame.thisAddr, e.line);
    }
    if (this.extended) {
      const held = this.tryVarAddr(e.name);
      if (held) {
        // cmp(a, b): a variable that holds a lambda or a functor
        return this.callable({ k: "var", name: e.name, line: e.line }, e.line)(e.args);
      }
    }
    const named = this.program.functions.filter((f) => f.name === e.name);
    if (named.length === 0) {
      if (this.extended) {
        const algo = this.algorithm(e);
        if (algo !== undefined) return algo;
      }
      const result = this.library(e);
      if (result === undefined) throw compileError(`"${e.name}" is not a function in this program.`, e.line);
      return result;
    }
    const fn = this.pick(named, e.args.length);
    if (!fn) throw compileError(`${e.name}() is called with ${e.args.length} argument${e.args.length === 1 ? "" : "s"}, but it expects ${named[0].params.length}.`, e.line);
    return this.invoke(this.pickTemplate(fn, e.args, e.templateArgs, e.line), e.args, null, e.line);
  }

  /** The standard functions lab code uses (std::max in the AVL lab, swap in sorting). A program's own function of the same name wins. */
  private library(e: Extract<Expr, { k: "call" }>): Value | undefined {
    if (["next", "prev", "advance", "distance", "find"].includes(e.name)) {
      const result = this.iteratorLibrary(e);
      if (result !== undefined) return result;
    }
    if (this.extended) {
      const result = this.extendedLibrary(e);
      if (result !== undefined) return result;
    }
    if (this.extended && (e.name === "max" || e.name === "min") && e.args.length === 1 && e.args[0].k === "brace") {
      // max({a, b, c})
      const items = e.args[0].items.map((x) => this.use(this.value(x), x));
      if (items.length === 0) throw compileError(`${e.name}({}) needs at least one value.`, e.line);
      return items.reduce((best, x) => (e.name === "max" ? this.less(best, x, e.line) : this.less(x, best, e.line)) ? x : best);
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
    if (e.name === "abs" && isK(x, "wide")) return wide(x.v < BigInt(0) ? -x.v : x.v, x.bits, x.u);
    if (e.name === "abs") return isK(x, "dbl") ? dbl(Math.abs(x.v)) : Math.abs(this.num(x, a)) | 0;
    const y = this.use(this.value(b), b);
    // Like std::max and std::min: on a tie the first argument is returned.
    if (this.extended) {
      const later = this.truthy(this.arith(e.name === "max" ? "<" : ">", x, y, a, b, e.line), a);
      return later ? y : x;
    }
    const [nx, ny] = [this.num(x, a), this.num(y, b)];
    return (e.name === "max" ? ny > nx : ny < nx) ? y : x;
  }

  /** The standard functions only the extended mode knows: <cmath>, <cctype>, <cstdlib>, <string>... */
  private extendedLibrary(e: Extract<Expr, { k: "call" }>): Value | undefined {
    const n = e.name;
    const arg = (i: number) => {
      if (!e.args[i]) throw compileError(`${n}() needs more arguments.`, e.line);
      return this.use(this.value(e.args[i]), e.args[i]);
    };
    if (Object.hasOwn(MATH, n)) return dbl(MATH[n](...e.args.map((x, i) => this.num(arg(i), x))));
    if (Object.hasOwn(CTYPE, n)) {
      const c = String.fromCharCode(this.int(arg(0), e.args[0]) & 0xff);
      const [bit, test] = CTYPE[n];
      return test(c) ? bit : 0;
    }
    switch (n) {
      case "toupper": case "tolower": {
        const code = this.int(arg(0), e.args[0]);
        const c = String.fromCharCode(code & 0xff);
        return /[a-zA-Z]/.test(c) ? (n === "toupper" ? c.toUpperCase() : c.toLowerCase()).charCodeAt(0) : code;
      }
      case "rand": return this.random.next();
      case "srand": this.random.seed(Number(BigInt.asUintN(32, toBig(arg(0))))); return UNINIT;
      case "time": return wide(BigInt(Math.floor(Date.now() / 1000)), 64, false);
      case "exit": throw new ExitSignal(e.args.length > 0 ? this.int(arg(0), e.args[0]) : 0);
      case "to_string": {
        const v = arg(0);
        if (isK(v, "dbl")) return str(fixedText(v.v, 6));
        if (isK(v, "chr")) return str(String(v.c.charCodeAt(0)));
        return str(isK(v, "wide") ? v.v.toString() : String(this.num(v, e.args[0])));
      }
      case "stoi": case "stol": case "stoll": case "atoi": case "stoul": case "stoull": {
        const v = arg(0);
        const t = isK(v, "str") ? v.s : "";
        const m = /^\s*([+-]?\d+)/.exec(t);
        if (!m) return this.throwStd("invalid_argument", n);
        const big = BigInt(m[1]);
        if (n === "stoi" || n === "atoi") {
          if (big > BigInt(2147483647) || big < BigInt(-2147483648)) return this.throwStd("out_of_range", n);
          return Number(big);
        }
        return wide(big, 64, n.includes("u"));
      }
      case "stod": case "stof": case "atof": {
        const v = arg(0);
        const f = parseFloat(isK(v, "str") ? v.s : "");
        if (Number.isNaN(f)) return this.throwStd("invalid_argument", n);
        return dbl(f);
      }
      case "getline": {
        // while (getline(cin, line))
        if (e.args.length !== 2 || e.args[0].k !== "var" || e.args[0].name !== "cin") throw unsupported("getline from anything other than cin", e.line);
        if (this.cinFailed) return false;
        const addr = this.ref(e.args[1]);
        const line = this.stdin.line();
        if (line === null) { this.cinFailed = true; return false; }
        this.mem.write(addr, str(line));
        this.step("input", e.line, `${this.srcLine(e.line)}  ←  ${line === "" ? "(empty line)" : line}`, { input: line });
        return true;
      }
      case "cin.clear": this.cinFailed = false; return UNINIT;
      case "make_pair": {
        if (e.args.length !== 2) throw compileError("make_pair() takes two values.", e.line);
        const [a, b] = [arg(0), arg(1)];
        const ta = e.args[0].k === "string" ? { base: "string", ptr: 0, ref: false } : this.exprType(e.args[0]) ?? this.typeOfValue(a);
        const tb = e.args[1].k === "string" ? { base: "string", ptr: 0, ref: false } : this.exprType(e.args[1]) ?? this.typeOfValue(b);
        const name = `pair<${typeText({ ...ta, ref: false })}, ${typeText({ ...tb, ref: false })}>`;
        const cls = this.classes.get(name)!;
        const f: Record<string, Value> = Object.create(null);
        f.first = this.coerce(cls.fields[0].type, copyValue(a), e.line);
        f.second = this.coerce(cls.fields[1].type, copyValue(b), e.line);
        return { k: "obj", type: name, f };
      }
      case "gcd": case "__gcd": case "lcm": {
        let [a, b] = [Math.abs(this.int(arg(0), e.args[0])), Math.abs(this.int(arg(1), e.args[1]))];
        const [x, y] = [a, b];
        while (b) [a, b] = [b, a % b];
        return n === "lcm" ? (a === 0 ? 0 : (x / a) * y) : a;
      }
      case "distance": {
        const [a, b] = [arg(0), arg(1)];
        if (isPtr(a) && isPtr(b)) return this.pointerArith("-", b, a, e.args[1], e.args[0], e.line);
        return undefined;
      }
      case "next": case "prev": {
        const a = arg(0);
        if (!isPtr(a) || isIter(a)) return undefined;
        const k = e.args[1] ? this.int(arg(1), e.args[1]) : 1;
        return this.pointerArith(n === "next" ? "+" : "-", a, k, e.args[0], e.args[1] ?? { k: "int", v: 1, line: e.line }, e.line);
      }
    }
    return undefined;
  }

  /** Throw one of the standard exceptions (out_of_range, invalid_argument...) the way the library does. */
  private throwStd(type: string, what: string): never {
    const f: Record<string, Value> = Object.create(null);
    f.message = str(what);
    throw new ThrowSignal({ k: "obj", type, f }, { base: type, ptr: 0, ref: false }, this.line);
  }

  private methodCall(e: Extract<Expr, { k: "mcall" }>): Value {
    if (!e.arrow) {
      // string methods work on values, including temporaries
      const probe = e.obj.k === "string" ? this.value(e.obj) : null;
      const sv = probe ?? this.mem.read(this.ref(e.obj));
      if (isK(sv, "str")) {
        if (e.method === "length" || e.method === "size") return this.extended ? wide(BigInt(sv.s.length), 64, true) : sv.s.length;
        if (e.method === "empty") return sv.s.length === 0;
        if (this.extended) return this.stringMethod(e, sv.s, probe !== null);
        throw unsupported(`The string method ${e.method}()`, e.line);
      }
    }
    if (this.extended && !e.arrow && (e.obj.k === "call" || e.obj.k === "mcall" || e.obj.k === "temp")) {
      // getList().size(), Point(1, 2).show(): a method on a value with no variable of its own
      const v = this.use(this.value(e.obj), e.obj);
      const type = this.exprType(e.obj) ?? (isK(v, "obj") ? { base: v.type, ptr: 0, ref: false } : null);
      if (!type) throw compileError(`${exprText(e.obj)} gives a value whose type HeapHop cannot tell; store it in a variable first.`, e.line);
      return this.onTemporary(v, (at) => {
        const slot = this.mem.top().scopes.at(-1)!.at(-1)!;
        slot.type = type;
        return this.methodCall({ ...e, obj: { k: "value", v, at, line: e.line } });
      });
    }
    const addr = e.arrow ? this.pointee(e.obj) : this.ref(e.obj);
    if (this.extended) {
      const placed = this.mem.typeAt(addr);
      const box = placed && !placed.isArray ? this.container(placed.type) : null;
      if (box) return this.containerMethod(e, addr, box);
    }
    const target = this.mem.read(addr);
    if (!isK(target, "obj")) throw compileError(`${exprText(e.obj)} is not an object, so it has no method ${e.method}().`, e.line);
    if (this.lists.info(target.type)) return this.listMethod(e, addr, target.type);
    const declared = this.extended ? this.staticType(e.obj) : null;
    const staticCls = declared ? this.classes.get(declared.base) : undefined;
    const m = this.dispatch(staticCls, target.type, e.method, e.args.length);
    if (!m && this.extended && e.method === "what" && e.args.length === 0 && this.isA(target.type, "exception")) {
      const msg = target.f.message;
      return isK(msg, "str") ? msg : str("std::exception");
    }
    if (m?.isPure) throw fault("other", `${m.className}::${m.name}() is pure virtual (= 0), so it has no body to run.`);
    if (!m) throw compileError(`${target.type} has no method ${e.method}() that takes ${e.args.length} argument${e.args.length === 1 ? "" : "s"}.`, e.line);
    return this.invoke(m, e.args, m.isStatic ? null : addr, e.line);
  }

  /** string methods the extended mode has: s.push_back('x'), s.substr(1, 3), s.find("ab")... */
  private stringMethod(e: Extract<Expr, { k: "mcall" }>, s: string, temporary: boolean): Value {
    const arg = (i: number) => this.use(this.value(e.args[i]), e.args[i]);
    const text = (v: Value, at: Expr) => (isK(v, "str") ? v.s : isK(v, "chr") ? v.c : (() => { throw compileError(`${exprText(at)} is not a string or a character.`, e.line); })());
    const npos = wide(BigInt(2) ** BigInt(64) - BigInt(1), 64, true);
    const index = (v: Value | undefined, at: Expr | undefined, max: number) => {
      if (v === undefined) return undefined;
      const n = this.num(v, at!);
      return n > max ? max : n;
    };
    const change = (next: string): Value => {
      if (temporary) throw compileError(`${e.method}() changes the string, so it needs a string variable.`, e.line);
      if (next.length > MAX_STRING_CHARS) throw new StopSignal("truncated", `The string grew past ${MAX_STRING_CHARS} characters, so the trace stops here.`);
      this.mem.write(this.ref(e.obj), str(next));
      return UNINIT;
    };
    const outOfRange = (what: string) => this.throwStd("out_of_range", what);
    switch (e.method) {
      case "push_back": return change(s + text(arg(0), e.args[0]));
      case "append": return change(s + text(arg(0), e.args[0]));
      case "pop_back":
        if (s.length === 0) throw fault("out_of_bounds", `${exprText(e.obj)}.pop_back() is called on an empty string.`);
        return change(s.slice(0, -1));
      case "clear": return change("");
      case "front": case "back":
        if (s.length === 0) throw fault("out_of_bounds", `${exprText(e.obj)}.${e.method}() is called on an empty string.`);
        return chr(e.method === "front" ? s[0] : s[s.length - 1]);
      case "at": {
        const i = this.num(arg(0), e.args[0]);
        if (i < 0 || i >= s.length) return outOfRange(`basic_string::at: __n (which is ${i}) >= this->size() (which is ${s.length})`);
        return chr(s[i]);
      }
      case "substr": {
        const pos = e.args.length > 0 ? this.num(arg(0), e.args[0]) : 0;
        if (pos > s.length) return outOfRange(`basic_string::substr: __pos (which is ${pos}) > this->size() (which is ${s.length})`);
        const len = e.args.length > 1 ? index(arg(1), e.args[1], s.length)! : s.length;
        return str(s.substr(pos, len));
      }
      case "find": case "rfind": {
        const needle = text(arg(0), e.args[0]);
        const from = e.args.length > 1 ? this.num(arg(1), e.args[1]) : undefined;
        const at = e.method === "find" ? s.indexOf(needle, from ?? 0) : s.lastIndexOf(needle, from ?? Infinity);
        return at < 0 ? npos : wide(BigInt(at), 64, true);
      }
      case "insert": {
        const pos = this.num(arg(0), e.args[0]);
        if (pos > s.length) return outOfRange(`basic_string::insert: __pos (which is ${pos}) > this->size() (which is ${s.length})`);
        return change(s.slice(0, pos) + text(arg(1), e.args[1]) + s.slice(pos));
      }
      case "erase": {
        const pos = e.args.length > 0 ? this.num(arg(0), e.args[0]) : 0;
        if (pos > s.length) return outOfRange(`basic_string::erase: __pos (which is ${pos}) > this->size() (which is ${s.length})`);
        const len = e.args.length > 1 ? index(arg(1), e.args[1], s.length)! : s.length;
        return change(s.slice(0, pos) + s.slice(pos + len));
      }
      case "c_str": case "data": return str(s);
      case "compare": {
        const o = text(arg(0), e.args[0]);
        return s < o ? -1 : s > o ? 1 : 0;
      }
      default: throw unsupported(`The string method ${e.method}()`, e.line);
    }
  }

  /** Call a function, method, constructor or destructor. One stack frame per call. */
  private invoke(fn: FuncDef, args: Expr[], thisAddr: string | null, callLine: number, outer?: Frame): Value {
    if (this.mem.frames.length >= this.limits.maxCallDepth) {
      throw new StopSignal("truncated",
        `More than ${this.limits.maxCallDepth} function calls are waiting at once, so the trace stops here. A recursive function may be missing its base case.`);
    }
    // Arguments are evaluated in the caller, before the new frame exists. A missing one
    // takes its default value.
    const bound = fn.params.map((p, i) => {
      const arg = args[i] ?? p.def;
      if (!arg) throw compileError(`${fn.name}() needs a value for its parameter "${p.name}".`, callLine);
      if (p.type.ref && arg.k === "value" && !arg.at) return { ref: null, value: copyValue(arg.v) }; // a value HeapHop passes itself
      if (p.type.ref && this.extended && !this.isLvalue(arg)) {
        // const string& s = "text", f(a + b): a const reference to a temporary holds the value
        return { ref: null, value: this.owned(arg, this.coerce({ ...p.type, ref: false }, this.valueFor(p.type, arg), callLine), callLine) };
      }
      return p.type.ref
        ? { ref: this.ref(arg), value: UNINIT as Value }
        : { ref: null, value: this.owned(arg, this.coerce(p.type, this.valueFor(p.type, arg), callLine), callLine) };
    });
    const frame = this.mem.pushFrame(outer ? "lambda" : qualifiedName(fn), outer ? outer.className : fn.className, thisAddr, callLine);
    if (outer) frame.outer = outer;
    fn.params.forEach((p, i) => {
      let type = p.type;
      if (type.base === "auto") {
        // [](auto a, auto b): the parameter takes the type of what it is given
        const v = bound[i].ref ? this.mem.read(bound[i].ref!) : bound[i].value;
        const placed = bound[i].ref ? this.mem.typeAt(bound[i].ref!) : null;
        type = { ...(placed?.type ?? this.typeOfValue(v)), ref: p.type.ref };
      }
      this.mem.declare(p.name, type, false, bound[i].value, bound[i].ref);
    });

    if (fn.kind === "ctor" && thisAddr) {
      const cls = this.classes.get(fn.className!)!;
      const done = this.extended ? this.constructParts(cls, thisAddr, fn.inits, callLine) : new Set<string>();
      for (const init of fn.inits) {
        if (done.has(init.field)) continue;
        const field = cls.fields.find((f) => f.name === init.field);
        if (!field) throw compileError(`${cls.name} has no member named "${init.field}".`, init.line);
        const fcls = this.extended && field.type.ptr === 0 ? this.classes.get(field.type.base) : undefined;
        if (fcls?.builtin && fcls.builtin.kind !== "exception" && !this.lists.info(fcls.name)) {
          // data(n, 0), adj(V): a container member made from its arguments
          const made = init.args.length === 1 && init.args[0].k === "brace" ? this.braceValue(field.type, init.args[0].items, init.line) : this.stlConstruct(fcls, init.args, init.line);
          this.mem.write(`${thisAddr}.${init.field}`, made);
          continue;
        }
        if (init.args.length > 1) throw unsupported("A member initialiser with several values", init.line);
        const v = init.args.length === 1 ? this.coerce(field.type, this.valueFor(field.type, init.args[0]), init.line) : this.zero(field.type);
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
      else if (e instanceof ThrowSignal) {
        // The exception leaves this call: its local objects are destroyed and its frame goes.
        this.destroyScope(frame, frame.scopes[0]);
        this.mem.popFrame();
        this.line = callLine;
        throw e;
      }
      else throw e;
    }
    this.destroyScope(frame, frame.scopes[0]);
    this.mem.popFrame();
    this.line = callLine;
    if (fn.ret.base === "void" && fn.ret.ptr === 0) return UNINIT;
    if (fn.ret.base === "auto") return result;
    if (this.extended && result !== UNINIT && !isK(result, "uninit")) return this.coerce({ ...fn.ret, ref: false }, result, fn.line);
    return this.coerce(fn.ret, result, fn.line);
  }

  /** Can this expression be referred to (does it name a place in memory)? */
  private isLvalue(e: Expr): boolean {
    switch (e.k) {
      case "var": return this.tryVarAddr(e.name) !== null;
      case "member": case "index": case "deref": return true;
      case "value": return !!e.at;
      case "mcall": return ["front", "back", "top", "at"].includes(e.method);
      default: return false;
    }
  }

  /** A type for a value with no declared type (an auto parameter). */
  private typeOfValue(v: Value): TypeRef {
    const t = (base: string, p = 0): TypeRef => ({ base, ptr: p, ref: false });
    if (typeof v === "number") return t("int");
    if (typeof v === "boolean") return t("bool");
    switch (v.k) {
      case "dbl": return t("double");
      case "chr": return t("char");
      case "str": return t("string");
      case "obj": return t(v.type);
      case "wide": return t(v.bits === 64 ? (v.u ? "unsigned long" : "long long") : v.u ? "unsigned int" : "int");
      case "ptr": {
        const target = v.a ? this.mem.typeAt(v.a) : null;
        return target ? { ...target.type, ptr: target.type.ptr + 1, ref: false } : t("void", 1);
      }
      default: return t("int");
    }
  }

  // ---- lvalues -------------------------------------------------------------

  private varAddr(name: string, line: number): string {
    const addr = this.tryVarAddr(name);
    if (addr !== null) return addr;
    throw compileError(`"${name}" is not declared here.`, line);
  }

  /** Where a variable name refers to, in C++'s order: locals, statics, members, globals. */
  private tryVarAddr(name: string): string | null {
    const frame = this.mem.top();
    const slot = this.mem.findSlot(frame, name);
    if (slot) return this.mem.slotAddr(frame, slot);
    for (let o = frame.outer; o; o = o.outer) {
      // a lambda uses the variables of the function it was written in
      const captured = this.mem.findSlot(o, name);
      if (captured && this.mem.frames.includes(o)) return this.mem.slotAddr(o, captured);
    }
    const local = this.staticSlots.get(`${frame.name}::${name}`);
    if (local) return local;
    if (frame.thisAddr && frame.className && this.classes.get(frame.className)?.fields.some((f) => f.name === name)) {
      return `${frame.thisAddr}.${name}`; // a member used by its bare name inside a method
    }
    for (let c = frame.className ? this.classes.get(frame.className) : undefined; c; c = c.bases ? this.classes.get(c.bases[0]) : undefined) {
      const member = this.staticSlots.get(`${c.name}::${name}`);
      if (member) return member;
    }
    if (name.includes("::")) {
      const qualified = this.staticSlots.get(name);
      if (qualified) return qualified;
    }
    if (this.hasGlobals && frame !== this.mem.frames[0]) {
      const g = this.mem.findSlot(this.mem.frames[0], name);
      if (g) return this.mem.slotAddr(this.mem.frames[0], g);
    }
    return null;
  }

  /** A named constant: an enumerator, or (extended mode) INT_MAX and the other library constants. */
  private constant(name: string): Value | undefined {
    if (!this.extended) return undefined;
    const c = this.program.constants?.get(name);
    if (c !== undefined) return c;
    return Object.hasOwn(LIMIT_CONSTANTS, name) ? LIMIT_CONSTANTS[name] : undefined;
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
      case "value":
        if (e.at) return e.at;
        throw compileError("this expression cannot be assigned to or have its address taken.", e.line);
      case "mcall": {
        if (this.extended && ["front", "back", "top", "at"].includes(e.method)) {
          // v.back() = 5;  s.top()++;  m.at(k) += 1;
          const la = e.arrow ? this.pointee(e.obj) : this.ref(e.obj);
          const placed = this.mem.typeAt(la);
          const box = placed && !placed.isArray ? this.container(placed.type) : null;
          if (box) {
            if (e.method === "at") {
              const key = this.use(this.value(e.args[0]), e.args[0]);
              if (box.kind === "map") {
                const where = this.mapEntry(la, box as Extract<Seq, { kind: "map" }>, key, false, e.line);
                if (!where) return this.throwStd("out_of_range", "map::at");
                return `${where}.second`;
              }
              const i = this.int(key, e.args[0]);
              const n = (this.mem.read(la) as Extract<Value, { k: "arr" }>).e.length;
              if (i < 0 || i >= n) return this.throwStd("out_of_range", `vector::_M_range_check: __n (which is ${i < 0 ? BigInt.asUintN(64, BigInt(i)).toString() : i}) >= this->size() (which is ${n})`);
              return `${la}.${i}`;
            }
            return this.elementAddr(la, box, e.method, exprText(e.obj), e.line);
          }
        }
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
        if (this.extended && isK(base, "arr")) {
          const at = this.ref(e.arr);
          const placed = this.mem.typeAt(at);
          const box = placed && !placed.isArray ? this.container(placed.type) : null;
          if (box?.kind === "map") return `${this.mapEntry(at, box as Extract<Seq, { kind: "map" }>, this.use(this.value(e.idx), e.idx), true, e.line)}.second`;
          if (box && box.kind !== "vector" && box.kind !== "deque") throw compileError(`a ${this.kindWord(box)} has no [ ]; use its methods instead.`, e.line);
        }
        const i = this.int(this.value(e.idx), e.idx);
        if (isK(base, "arr") || isK(base, "str")) return `${this.ref(e.arr)}.${i}`;
        const a = this.checkPointer(base, e.arr);
        if (isK(this.mem.read(a), "arr")) return `${a}.${i}`;
        if (this.extended) {
          const at = this.elemPos(a);
          if (at) {
            const j = at.i + i;
            if (j < 0 || j >= at.len) throw fault("out_of_bounds", `${exprText(e.arr)}[${i}] is index ${j} of an array of ${at.len} element${at.len === 1 ? "" : "s"}, outside it.`);
            return `${at.arr}.${j}`;
          }
        }
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
    if (e.k === "brace") return this.braceValue(t, e.items, e.line);
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
    if (isK(v, "wide")) return Number(v.v);
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
      return a !== undefined && b !== undefined && this.samePlace(a, b);
    }
    if (this.extended && isK(l, "obj") && isK(r, "obj")) {
      return l.type === r.type && Object.keys(l.f).every((k) => this.equal(l.f[k], r.f[k]));
    }
    if (this.extended && isK(l, "arr") && isK(r, "arr")) {
      return l.e.length === r.e.length && l.e.every((x, i) => this.equal(x, r.e[i]));
    }
    if (isK(l, "str") && isK(r, "str")) return l.s === r.s;
    if ((isK(l, "wide") || isK(r, "wide")) && intKind(l) && intKind(r)) return wideArith("==", l, r) === true;
    const n = (v: Value) => isK(v, "wide") ? Number(v.v) : (typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : isK(v, "dbl") ? v.v : isK(v, "chr") ? v.c.charCodeAt(0) : NaN);
    return n(l) === n(r);
  }

  /** fixed, setprecision(2), setw(5), left... (<iomanip>): change how cout prints. True when `e` was one. */
  private manipulator(e: Expr): boolean {
    const io = this.io;
    if (e.k === "var" && this.tryVarAddr(e.name) === null) {
      switch (e.name) {
        case "fixed": io.fixed = true; return true;
        case "defaultfloat": io.fixed = false; return true;
        case "scientific": throw unsupported("cout << scientific", e.line, "Use fixed or the default format.");
        case "left": io.left = true; return true;
        case "right": io.left = false; return true;
        case "boolalpha": io.boolalpha = true; return true;
        case "noboolalpha": io.boolalpha = false; return true;
        case "showpoint": case "noshowpoint": case "flush": return true;
      }
      return false;
    }
    if (e.k === "call" && !this.program.functions.some((f) => f.name === e.name)) {
      const arg = () => this.use(this.value(e.args[0]), e.args[0]);
      switch (e.name) {
        case "setprecision": io.precision = this.int(arg(), e.args[0]); return true;
        case "setw": io.width = this.int(arg(), e.args[0]); return true;
        case "setfill": { const c = arg(); io.fill = isK(c, "chr") ? c.c : String.fromCharCode(this.int(c, e.args[0])); return true; }
      }
    }
    return false;
  }

  /** What `cout << v` prints with the stream's current settings. */
  private formatted(v: Value): string {
    const io = this.io;
    let text: string;
    if (isK(v, "dbl")) text = io.fixed ? fixedText(v.v, io.precision) : generalText(v.v, io.precision);
    else if (typeof v === "boolean" && io.boolalpha) text = v ? "true" : "false";
    else text = this.printed(v);
    if (io.width > text.length) text = io.left ? text + io.fill.repeat(io.width - text.length) : io.fill.repeat(io.width - text.length) + text;
    io.width = 0; // setw lasts for one value
    return text;
  }

  /** Text that `cout << v` prints. */
  private printed(v: Value): string {
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "1" : "0";
    switch (v.k) {
      case "dbl": return formatDouble(v.v);
      case "chr": return v.c;
      case "str": return v.s;
      case "wide": return v.v.toString();
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
    if (isK(v, "wide")) return v.v.toString();
    return this.printed(v);
  }

  /** Convert a value to the declared type of the place it is stored in. */
  private coerce(t: TypeRef, v: Value, line: number): Value {
    if (isK(v, "uninit")) return v;
    if (this.extended && t.base === "auto" && t.ptr === 0) return v; // a lambda's auto parameter
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
      // const char* name = "Ali";  a C string is kept as the text itself
      if (this.extended && t.ptr === 1 && t.base === "char" && isK(v, "str")) return v;
      throw bad();
    }
    const numeric = typeof v === "number" || typeof v === "boolean" || isK(v, "dbl") || isK(v, "chr") || isK(v, "wide");
    const n = typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : isK(v, "dbl") ? v.v : isK(v, "chr") ? v.c.charCodeAt(0) : isK(v, "wide") ? Number(v.v) : 0;
    if (this.extended) {
      if (Object.hasOwn(WIDE_TYPES, t.base)) { if (!numeric) throw bad(); return toWide(v, t.base); }
      if (Object.hasOwn(SHORT_TYPES, t.base)) {
        if (!numeric) throw bad();
        const x = Number(BigInt.asIntN(32, toBig(v)));
        return SHORT_TYPES[t.base][1] ? x & 0xffff : (x << 16) >> 16;
      }
      if (this.program.enums?.has(t.base)) { if (!numeric) throw bad(); return Number(BigInt.asIntN(32, toBig(v))); }
    }
    switch (t.base) {
      case "int": if (!numeric) throw bad(); return isK(v, "wide") ? Number(BigInt.asIntN(32, v.v)) : Math.trunc(n) | 0;
      case "double": case "float": if (!numeric) throw bad(); return dbl(n);
      case "bool": if (isPtr(v)) return v.a !== null; if (!numeric) throw bad(); return n !== 0;
      case "char": if (!numeric) throw bad(); return isK(v, "chr") ? v : chr(String.fromCharCode(Number(BigInt.asUintN(8, toBig(v)))));
      case "string": if (isK(v, "str")) return v; if (isK(v, "chr")) return str(v.c); throw bad();
      case "void": throw bad();
      default:
        if (isK(v, "obj") && v.type === t.base) return v;
        if (this.extended && isK(v, "obj") && this.isA(v.type, t.base)) return this.slice(v, t.base);
        if (this.extended && isK(v, "arr") && this.container(t)) return v;
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
    if ((isPtr(l) || isPtr(r)) && this.extended) return this.pointerArith(op, l, r, le, re, line);
    if (isPtr(l) || isPtr(r)) throw unsupported("Pointer arithmetic and ordering comparisons between pointers", line, "Use an index (p[i]) or walk the list with ->next.");
    const real = isK(l, "dbl") || isK(r, "dbl");
    if (!real && (isK(l, "wide") || isK(r, "wide"))) {
      this.num(l, le); this.num(r, re); // reports a value that is not a number
      const result = wideArith(op as WideOp, l, r);
      if (result === null) throw fault("division_by_zero", op === "%" ? "This takes a remainder of division by zero." : "This divides by zero.");
      return result;
    }
    const a = this.num(l, le);
    const b = this.num(r, re);
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
    if (!this.extended && e.target.k === "index" && isK(this.value(e.target.arr), "str")) {
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
      case "int": return this.extended ? this.intLiteral(e) : e.v;
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
      case "var": {
        const addr = this.tryVarAddr(e.name);
        if (addr !== null) return this.mem.read(addr);
        const c = this.constant(e.name);
        if (c !== undefined) return c;
        throw compileError(`"${e.name}" is not declared here.`, e.line);
      }
      case "member": case "index": case "deref":
        return this.mem.read(this.ref(e));
      case "addr": return ptr(this.ref(e.e));
      case "unary": {
        const v = this.value(e.e);
        if (e.op === "!") return !this.truthy(v, e.e);
        const n = this.num(v, e.e);
        if (e.op === "+") return v;
        if (isK(v, "wide")) return wide(-v.v, v.bits, v.u);
        return isK(v, "dbl") ? dbl(-n) : -n | 0;
      }
      case "binary": {
        if (e.op === "&&") return this.truthy(this.value(e.l), e.l) && this.truthy(this.value(e.r), e.r);
        if (e.op === "||") return this.truthy(this.value(e.l), e.l) || this.truthy(this.value(e.r), e.r);
        let l = this.use(this.value(e.l), e.l);
        let r = this.use(this.value(e.r), e.r);
        if (this.extended) {
          // arr + 1, p == arr: an array next to a pointer or a number stands for its first element
          if (isK(l, "arr") && (isPtr(r) || typeof r === "number" || isK(r, "wide")) && this.isCArray(e.l)) l = ptr(this.ref(e.l));
          if (isK(r, "arr") && (isPtr(l) || typeof l === "number" || isK(l, "wide")) && this.isCArray(e.r)) r = ptr(this.ref(e.r));
          if (isK(l, "obj") && !this.classes.get(l.type)?.builtin) {
            let at: string | undefined;
            try { at = this.ref(e.l); } catch { at = undefined; }
            const custom = this.userOperator(e.op, l, r, e.line, at);
            if (custom !== undefined) return custom;
          }
          if ((isK(l, "obj") && isK(r, "obj")) || (isK(l, "arr") && isK(r, "arr"))) {
            switch (e.op) {
              case "==": return this.equal(l, r);
              case "!=": return !this.equal(l, r);
              case "<": return this.less(l, r, e.line);
              case ">": return this.less(r, l, e.line);
              case "<=": return !this.less(r, l, e.line);
              case ">=": return !this.less(l, r, e.line);
            }
          }
        }
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
        if (isPtr(cur) && this.extended) {
          const one: Expr = { k: "int", v: 1, line: e.line };
          const moved = this.pointerArith(e.delta > 0 ? "+" : "-", cur, 1, e.target, one, e.line);
          this.mem.write(addr, moved);
          return e.prefix ? moved : cur;
        }
        if (isPtr(cur)) throw unsupported("++ or -- on a pointer (pointer arithmetic)", e.line, "Walk a list with p = p->next.");
        const n = this.num(cur, e.target) + e.delta;
        const next: Value = isK(cur, "wide") ? wide(cur.v + BigInt(e.delta), cur.bits, cur.u)
          : isK(cur, "dbl") ? dbl(n) : isK(cur, "chr") ? chr(String.fromCharCode(n & 0xff)) : n | 0;
        this.mem.write(addr, next);
        return e.prefix ? next : cur;
      }
      case "ternary":
        return this.truthy(this.value(e.c), e.c) ? this.value(e.a) : this.value(e.b);
      case "call": return this.call(e);
      case "mcall": return this.methodCall(e);
      case "new": return this.newObject(e);
      case "newArray": return this.newArray(e);
      case "cast": return this.cast(e);
      case "sizeof": return wide(BigInt(e.type ? this.sizeOfType(e.type) : this.sizeOfExpr(e.e!)), 64, true);
      case "limit": {
        const v = numericLimit(typeText({ ...e.type, ref: false }), e.which);
        if (v === null) throw unsupported(`numeric_limits<${typeText(e.type)}>::${e.which}()`, e.line);
        return v;
      }
      case "cinRead": return this.cinRead(e);
      case "value": return e.at ? this.mem.read(e.at) : e.v;
      case "temp": return this.temporary(e);
      case "brace": throw compileError("a {...} list can only be given where its type is known, such as to a variable or a parameter.", e.line);
      case "lambda": {
        const id = this.closures.size + 1;
        this.closures.set(id, { fn: e.fn, frame: this.mem.top() });
        const f: Record<string, Value> = Object.create(null);
        f.id = id;
        return { k: "obj", type: "lambda", f };
      }
    }
  }

  // ---- standard containers (extended mode) --------------------------------

  /** The standard container a type names (vector<int>, map<string, int>...), or null. */
  private container(t: TypeRef | null | undefined): Seq | null {
    if (!this.extended || !t || t.ptr > 0) return null;
    const b = this.classes.get(t.base)?.builtin;
    return b && SEQUENCES.has(b.kind) ? (b as Seq) : null;
  }

  private kindWord(b: Seq): string {
    return b.kind === "pq" ? "priority_queue" : b.kind;
  }

  /** A new value of type `t` with nothing given: zero for numbers, an empty container, a default object. */
  private defaultValue(t: TypeRef, line: number): Value {
    if (t.ptr > 0) return NULL_PTR;
    const cls = this.classes.get(t.base);
    if (cls) return this.lists.info(cls.name) ? this.lists.empty(cls.name) : this.makeObject(cls, true, line);
    return this.zero(t);
  }

  /** Store a default value at `addr` and run its constructor, if its class has one. */
  private placeDefault(t: TypeRef, addr: string, line: number) {
    const cls = t.ptr === 0 ? this.classes.get(t.base) : undefined;
    if (cls && !cls.builtin && this.needsConstruct(cls)) this.construct(cls, addr, [], line);
  }

  /** One element for a container: converted to its type and copied. */
  private element(t: TypeRef, e: Expr, line: number): Value {
    return this.copyOwned(this.coerce(t, this.use(this.valueFor(t, e), e), line), line);
  }

  /** `vector<int> v(5, 0)`, `pair<int, int> p(1, 2)`, `vector<int> w(v.begin(), v.end())`... */
  private stlConstruct(cls: ClassDef, args: Expr[], line: number): Value {
    const b = cls.builtin!;
    if (b.kind === "pair") {
      if (args.length === 0) return this.makeObject(cls, true, line);
      if (args.length === 1) return this.coerce({ base: cls.name, ptr: 0, ref: false }, this.use(this.value(args[0]), args[0]), line);
      if (args.length !== 2) throw compileError(`${cls.name} takes two values.`, line);
      return this.braceValue({ base: cls.name, ptr: 0, ref: false }, args, line);
    }
    if (b.kind === "functor") return { k: "obj", type: cls.name, f: Object.create(null) };
    const seq = b as Seq;
    const type: TypeRef = { base: cls.name, ptr: 0, ref: false };
    if (args.length === 0) return { k: "arr", e: [], cap: 0 };
    const first = this.use(this.value(args[0]), args[0]);
    if (args.length === 2 && isPtr(first) || (args.length === 2 && isK(first, "arr") && this.isCArray(args[0]))) {
      const range = this.range(args[0], args[1], line);
      return this.fill(seq, range.items.map(copyValue), line);
    }
    if (isK(first, "arr")) {
      if (args.length !== 1) throw compileError(`${cls.name} cannot be made from these values.`, line);
      return this.copyOwned(this.coerce(type, first, line), line);
    }
    if (seq.kind !== "vector" && seq.kind !== "deque") throw compileError(`${this.kindWord(seq)} cannot be made from these values.`, line);
    const n = this.int(first, args[0]);
    if (n < 0 || n > 100000) throw fault("other", `${cls.name}(${n}) asks for more elements than HeapHop allows.`);
    if (n > this.limits.maxHeapObjects * 10) throw new StopSignal("truncated", `${cls.name}(${n}) is too large to show, so the trace stops here.`);
    const e: Value[] = [];
    for (let i = 0; i < n; i++) e.push(args.length > 1 ? this.element(seq.elem, args[1], line) : this.defaultValue(seq.elem, line));
    return { k: "arr", e, cap: n };
  }

  /** Put elements into a container the way it keeps them: sorted for set and map, a heap for priority_queue. */
  private fill(b: Seq, items: Value[], line: number): Value {
    const e: Value[] = [];
    if (b.kind === "set" || b.kind === "map") {
      for (const v of items) {
        const key = b.kind === "map" && isK(v, "obj") ? v.f.first : v;
        const at = lowerBound(e, key, (x, k) => this.less(b.kind === "map" && isK(x, "obj") ? x.f.first : x, k, line));
        const there = e[at];
        if (there !== undefined && !this.less(key, b.kind === "map" && isK(there, "obj") ? there.f.first : there, line)) continue; // already there
        e.splice(at, 0, v);
      }
      return { k: "arr", e };
    }
    e.push(...items);
    if (b.kind === "pq") makeHeap(e, this.heapLess(b, line));
    return { k: "arr", e, cap: e.length };
  }

  /** The value `{...}` stands for when it goes into a place of type `t`. */
  private braceValue(t: TypeRef, items: Expr[], line: number): Value {
    if (t.ptr > 0 || !this.classes.get(t.base)) {
      if (items.length === 0) return this.zero(t);
      if (items.length > 1) throw compileError(`a ${typeText(t)} takes one value, but {...} gives ${items.length}.`, line);
      return this.coerce(t, this.use(this.valueFor(t, items[0]), items[0]), line);
    }
    const cls = this.classes.get(t.base)!;
    if (this.lists.info(cls.name)) return this.listFrom(cls.name, items, line);
    const b = this.container(t);
    if (b) {
      const elem = b.kind === "map" ? (b as Extract<Seq, { kind: "map" }>).elem : b.elem;
      return this.fill(b, items.map((x) => this.element(elem, x, line)), line);
    }
    if (cls.builtin?.kind === "pair") {
      if (items.length !== 2 && items.length !== 0) throw compileError(`a ${cls.name} takes two values, but {...} gives ${items.length}.`, line);
      const f: Record<string, Value> = Object.create(null);
      cls.fields.forEach((field, i) => { f[field.name] = items[i] ? this.element(field.type, items[i], line) : this.defaultValue(field.type, line); });
      return { k: "obj", type: cls.name, f };
    }
    if (items.length === 1 && cls.ctors.length === 0) {
      const v = this.use(this.value(items[0]), items[0]);
      if (isK(v, "obj") && this.isA(v.type, cls.name)) return this.slice(v, cls.name);
      return this.temporaryOf(cls, [{ k: "value", v, line }], line);
    }
    return this.temporaryOf(cls, items, line);
  }

  /** Destroy elements a container is about to remove (their destructors run while they still exist). */
  private dropElements(addr: string, indexes: number[]) {
    const v = this.mem.read(addr) as Extract<Value, { k: "arr" }>;
    for (const i of [...indexes].reverse()) {
      const el = v.e[i];
      if ((isK(el, "obj") || isK(el, "arr")) && this.hasDestructor(el)) this.destroyValue(el, `${addr}.${i}`);
    }
  }

  /** Does destroying this value run any code (a destructor, a list's nodes)? */
  private hasDestructor(v: Value): boolean {
    if (isK(v, "arr")) return v.e.some((x) => this.hasDestructor(x));
    if (!isK(v, "obj")) return false;
    if (this.lists.info(v.type)) return true;
    for (let c = this.classes.get(v.type); c; c = c.bases ? this.classes.get(c.bases[0]) : undefined) if (c.dtor) return true;
    return Object.keys(v.f).some((k) => this.hasDestructor(v.f[k]));
  }

  /** `v[i]`, `s.top()`, `m[key]`...: the address of an element. */
  private elementAddr(addr: string, b: Seq, which: string, name: string, line: number): string {
    const arr = this.mem.read(addr) as Extract<Value, { k: "arr" }>;
    const n = arr.e.length;
    const empty = () => fault("out_of_bounds", `${name}.${which}() is used on an empty ${this.kindWord(b)}, so there is no element to give back.`);
    switch (which) {
      case "front": if (n === 0) throw empty(); return `${addr}.0`;
      case "back": if (n === 0) throw empty(); return `${addr}.${n - 1}`;
      case "top":
        if (n === 0) throw empty();
        return b.kind === "pq" ? `${addr}.0` : `${addr}.${n - 1}`;
    }
    throw compileError(`${which}() is not a method of ${this.kindWord(b)}.`, line);
  }

  /** `m[key]`: the address of the value for `key`, made with a default value when it is missing. */
  private mapEntry(addr: string, b: Extract<Seq, { kind: "map" }>, key: Value, create: boolean, line: number): string | null {
    const arr = this.mem.read(addr) as Extract<Value, { k: "arr" }>;
    const k = this.coerce(b.key, key, line);
    const keyOf = (x: Value) => (isK(x, "obj") ? x.f.first : x);
    const at = lowerBound(arr.e, k, (x, y) => this.less(keyOf(x), y, line));
    if (at < arr.e.length && !this.less(k, keyOf(arr.e[at]), line)) return `${addr}.${at}`;
    if (!create) return null;
    const f: Record<string, Value> = Object.create(null);
    f.first = copyValue(k);
    f.second = this.defaultValue(b.value, line);
    const e = [...arr.e];
    e.splice(at, 0, { k: "obj", type: b.elem.base, f });
    this.mem.write(addr, { k: "arr", e });
    this.placeDefault(b.value, `${addr}.${at}.second`, line);
    return `${addr}.${at}`;
  }

  /** Where a key is (or would go) in a set or map: its index, and whether it is there. */
  private findKey(addr: string, b: Seq, key: Value, line: number): { at: number; found: boolean } {
    const arr = this.mem.read(addr) as Extract<Value, { k: "arr" }>;
    const keyOf = (x: Value) => (b.kind === "map" && isK(x, "obj") ? x.f.first : x);
    const k = b.kind === "map" ? this.coerce((b as Extract<Seq, { kind: "map" }>).key, key, line) : this.coerce(b.elem, key, line);
    const at = lowerBound(arr.e, k, (x, y) => this.less(keyOf(x), y, line));
    return { at, found: at < arr.e.length && !this.less(k, keyOf(arr.e[at]), line) };
  }

  /** The comparator a priority_queue orders its heap with. */
  private heapLess(b: Extract<Seq, { kind: "pq" }>, line: number): Less<Value> {
    if (!b.cmp) return (x, y) => this.less(x, y, line);
    if (/^greater</.test(b.cmp)) return (x, y) => this.less(y, x, line);
    const cls = this.classes.get(b.cmp);
    const m = cls ? this.findMethod(cls, "operator()", 2) : null;
    if (!m) throw compileError(`${b.cmp} needs a bool operator()(a, b) to order the priority_queue.`, line);
    return (x, y) => this.truthy(this.invoke(m, [{ k: "value", v: x, line }, { k: "value", v: y, line }], null, line), { k: "value", v: false, line });
  }

  private containerMethod(e: Extract<Expr, { k: "mcall" }>, addr: string, b: Seq): Value {
    const name = exprText(e.obj);
    const kind = this.kindWord(b);
    const line = e.line;
    const arr = () => this.mem.read(addr) as Extract<Value, { k: "arr" }>;
    const put = (els: Value[], cap?: number) => this.mem.write(addr, cap === undefined ? { k: "arr", e: els } : { k: "arr", e: els, cap });
    const argc = (n: number, m = n) => {
      if (e.args.length < n || e.args.length > m) throw compileError(`${name}.${e.method}() takes ${n === m ? n : `${n} to ${m}`} argument${m === 1 ? "" : "s"}.`, line);
    };
    const size = (n: number) => wide(BigInt(n), 64, true);
    const elem = b.kind === "map" ? (b as Extract<Seq, { kind: "map" }>).elem : b.elem;
    const fresh = () => {
      // push_back(x) / emplace_back(a, b)
      if (e.method.startsWith("emplace") && (e.args.length !== 1 || this.classes.get(elem.base)?.builtin?.kind === "pair")) return this.braceValue(elem, e.args, line);
      argc(1);
      return this.element(elem, e.args[0], line);
    };
    const grow = (n: number, cap: number | undefined) => {
      // libstdc++: a full vector doubles its capacity (at least to the size needed)
      const c = cap ?? arr().e.length;
      return n <= c ? c : Math.max(n, c * 2, 1);
    };
    const position = (x: Expr) => {
      const v = this.use(this.value(x), x);
      if (!isPtr(v) || v.a === null) throw compileError(`${exprText(x)} is not an iterator of ${name}.`, line);
      const at = this.elemPos(v.a);
      if (!at || at.arr !== addr) throw compileError(`${exprText(x)} is not an iterator of ${name}.`, line);
      return at.i;
    };
    const it = (i: number) => ptr(`${addr}.${i}`);
    const common = (): Value | undefined => {
      switch (e.method) {
        case "size": argc(0); return size(arr().e.length);
        case "empty": argc(0); return arr().e.length === 0;
        case "swap": {
          argc(1);
          const other = this.ref(e.args[0]);
          const mine = this.mem.read(addr);
          this.mem.write(addr, this.mem.read(other));
          this.mem.write(other, mine);
          return UNINIT;
        }
      }
      return undefined;
    };
    const shared = common();
    if (shared !== undefined) return shared;

    if (b.kind === "stack" || b.kind === "queue" || b.kind === "pq") {
      switch (e.method) {
        case "push": case "emplace": {
          const els = [...arr().e, fresh()];
          if (b.kind === "pq") pushHeap(els, this.heapLess(b, line));
          put(els);
          return UNINIT;
        }
        case "pop": {
          argc(0);
          const els = [...arr().e];
          if (els.length === 0) throw fault("out_of_bounds", `${name}.pop() is used on an empty ${kind}. In real C++ that is undefined behaviour; check ${name}.empty() first.`);
          this.dropElements(addr, [b.kind === "stack" ? els.length - 1 : 0]);
          if (b.kind === "pq") { popHeap(els, this.heapLess(b, line)); els.pop(); }
          else if (b.kind === "stack") els.pop();
          else els.shift();
          put(els);
          return UNINIT;
        }
        case "top": case "front": case "back":
          argc(0);
          if ((b.kind === "queue") === (e.method === "top") || (b.kind !== "queue" && e.method !== "top")) {
            throw compileError(`${kind} has no ${e.method}()${b.kind === "queue" ? "; use front() or back()" : "; use top()"}.`, line);
          }
          return this.mem.read(this.elementAddr(addr, b, e.method, name, line));
      }
      throw unsupported(`${kind}::${e.method}()`, line);
    }

    if (b.kind === "set" || b.kind === "map") {
      const keyArg = () => { argc(1); return this.use(this.value(e.args[0]), e.args[0]); };
      switch (e.method) {
        case "insert": case "emplace": {
          let v: Value;
          if (b.kind === "map" && e.args.length === 2) v = this.braceValue(elem, e.args, line);
          else { argc(1); v = this.element(elem, e.args[0], line); }
          const key = b.kind === "map" && isK(v, "obj") ? v.f.first : v;
          const { at, found } = this.findKey(addr, b, key, line);
          if (!found) { const els = [...arr().e]; els.splice(at, 0, v); put(els); }
          return !found;
        }
        case "erase": {
          argc(1);
          const x = this.use(this.value(e.args[0]), e.args[0]);
          if (isPtr(x)) {
            const i = position(e.args[0]);
            const els = [...arr().e];
            if (i >= els.length) throw fault("out_of_bounds", `${name}.erase() is given end(), which is not an element.`);
            els.splice(i, 1);
            put(els);
            return it(i);
          }
          const { at, found } = this.findKey(addr, b, x, line);
          if (found) { const els = [...arr().e]; els.splice(at, 1); put(els); }
          return size(found ? 1 : 0);
        }
        case "count": { const { found } = this.findKey(addr, b, keyArg(), line); return size(found ? 1 : 0); }
        case "contains": { const { found } = this.findKey(addr, b, keyArg(), line); return found; }
        case "find": { const { at, found } = this.findKey(addr, b, keyArg(), line); return it(found ? at : arr().e.length); }
        case "lower_bound": case "upper_bound": {
          const { at, found } = this.findKey(addr, b, keyArg(), line);
          return it(e.method === "upper_bound" && found ? at + 1 : at);
        }
        case "at": {
          if (b.kind !== "map") break;
          const where = this.mapEntry(addr, b as Extract<Seq, { kind: "map" }>, keyArg(), false, line);
          if (!where) return this.throwStd("out_of_range", "map::at");
          return this.mem.read(`${where}.second`);
        }
        case "clear": argc(0); put([]); return UNINIT;
        case "begin": case "cbegin": argc(0); return it(0);
        case "end": case "cend": argc(0); return it(arr().e.length);
      }
      throw unsupported(`${kind}::${e.method}()`, line);
    }

    // vector, deque
    const v = arr();
    switch (e.method) {
      case "push_back": case "emplace_back": {
        const x = fresh();
        const cur = arr();
        put([...cur.e, x], grow(cur.e.length + 1, cur.cap));
        return UNINIT;
      }
      case "push_front": case "emplace_front": {
        if (b.kind !== "deque") break;
        const x = fresh();
        put([x, ...arr().e]);
        return UNINIT;
      }
      case "pop_back": case "pop_front": {
        argc(0);
        if (e.method === "pop_front" && b.kind !== "deque") break;
        if (v.e.length === 0) throw fault("out_of_bounds", `${name}.${e.method}() is used on an empty ${kind}. In real C++ that is undefined behaviour; check ${name}.empty() first.`);
        const i = e.method === "pop_back" ? v.e.length - 1 : 0;
        this.dropElements(addr, [i]);
        const els = [...arr().e];
        els.splice(i, 1);
        put(els, v.cap);
        return UNINIT;
      }
      case "front": case "back": argc(0); return this.mem.read(this.elementAddr(addr, b, e.method, name, line));
      case "at": {
        argc(1);
        const i = this.int(this.use(this.value(e.args[0]), e.args[0]), e.args[0]);
        if (i < 0 || i >= v.e.length) {
          const n = i < 0 ? BigInt.asUintN(64, BigInt(i)).toString() : String(i);
          return this.throwStd("out_of_range", `vector::_M_range_check: __n (which is ${n}) >= this->size() (which is ${v.e.length})`);
        }
        return this.mem.read(`${addr}.${i}`);
      }
      case "clear": argc(0); this.dropElements(addr, v.e.map((_, k) => k)); put([], v.cap); return UNINIT;
      case "capacity": argc(0); return size(v.cap ?? v.e.length);
      case "reserve": {
        argc(1);
        const n = this.int(this.use(this.value(e.args[0]), e.args[0]), e.args[0]);
        put([...v.e], Math.max(n, v.cap ?? v.e.length));
        return UNINIT;
      }
      case "shrink_to_fit": argc(0); put([...v.e], v.e.length); return UNINIT;
      case "resize": {
        argc(1, 2);
        const n = this.int(this.use(this.value(e.args[0]), e.args[0]), e.args[0]);
        if (n < 0 || n > 100000) throw fault("other", `${name}.resize(${n}) asks for more elements than HeapHop allows.`);
        const els = v.e.slice(0, n);
        const old = v.e.length;
        while (els.length < n) els.push(e.args[1] ? this.element(elem, e.args[1], line) : this.defaultValue(elem, line));
        const cap = v.cap ?? old;
        put(els, n > cap ? Math.max(n, old + Math.max(old, n - old)) : cap);
        for (let i = old; i < n && !e.args[1]; i++) this.placeDefault(elem, `${addr}.${i}`, line);
        return UNINIT;
      }
      case "assign": {
        argc(2);
        const a0 = this.use(this.value(e.args[0]), e.args[0]);
        let els: Value[];
        if (isPtr(a0)) els = this.range(e.args[0], e.args[1], line).items.map(copyValue);
        else {
          const n = this.int(a0, e.args[0]);
          els = [];
          for (let i = 0; i < n; i++) els.push(this.element(elem, e.args[1], line));
        }
        put(els, Math.max(els.length, v.cap ?? 0));
        return UNINIT;
      }
      case "begin": case "cbegin": argc(0); return it(0);
      case "end": case "cend": argc(0); return it(v.e.length);
      case "insert": {
        argc(2, 3);
        const i = position(e.args[0]);
        const els = [...v.e];
        if (e.args.length === 3) {
          const n = this.int(this.use(this.value(e.args[1]), e.args[1]), e.args[1]);
          const x = this.element(elem, e.args[2], line);
          for (let k = 0; k < n; k++) els.splice(i, 0, copyValue(x));
        } else {
          els.splice(i, 0, this.element(elem, e.args[1], line));
        }
        put(els, grow(els.length, v.cap));
        return it(i);
      }
      case "erase": {
        argc(1, 2);
        const i = position(e.args[0]);
        const j = e.args.length === 2 ? position(e.args[1]) : i + 1;
        if (i >= v.e.length || j > v.e.length || j < i) throw fault("out_of_bounds", `${name}.erase() is given a position outside the ${kind}.`);
        this.dropElements(addr, Array.from({ length: j - i }, (_, k) => i + k));
        const els = [...arr().e];
        els.splice(i, j - i);
        put(els, v.cap);
        return it(i);
      }
    }
    throw unsupported(`${kind}::${e.method}()`, line);
  }

  // ---- pointers into arrays (extended mode) -------------------------------

  /** Is this expression a C array (not a vector), so it can stand for a pointer to its first element? */
  private isCArray(e: Expr): boolean {
    try { return this.mem.typeAt(this.ref(e))?.isArray === true; } catch { return false; }
  }

  /** Where a pointer stands in an array: the array's address, the index and the array's length. */
  private elemPos(a: string): { arr: string; i: number; len: number } | null {
    let v: Value | undefined;
    try { v = this.mem.peek(a); } catch { v = undefined; }
    if (v !== undefined && isK(v, "arr")) return { arr: a, i: 0, len: v.e.length };
    const cut = a.lastIndexOf(".");
    if (cut < 0 || !/^-?\d+$/.test(a.slice(cut + 1))) return null;
    let parent: Value;
    try { parent = this.mem.peek(a.slice(0, cut)); } catch { return null; }
    if (!isK(parent, "arr")) return null;
    return { arr: a.slice(0, cut), i: Number(a.slice(cut + 1)), len: parent.e.length };
  }

  /** `p + n`, `p - n`, `p - q`, `p < q` for pointers into an array. */
  private pointerArith(op: string, l: Value, r: Value, le: Expr, re: Expr, line: number): Value {
    if (isPtr(l) && isPtr(r)) {
      const [a, b] = [l.a === null ? null : this.elemPos(l.a), r.a === null ? null : this.elemPos(r.a)];
      if (["<", ">", "<=", ">="].includes(op) && l.a !== null && r.a !== null && (!a || !b || a.arr !== b.arr) && l.a === r.a) {
        return op === "<=" || op === ">=";
      }
      if (!a || !b || a.arr !== b.arr) throw fault("other", `${exprText(le)} and ${exprText(re)} do not point into the same array, so they cannot be ${op === "-" ? "subtracted" : "compared"}.`);
      switch (op) {
        case "-": return wide(BigInt(a.i - b.i), 64, false);
        case "<": return a.i < b.i;
        case ">": return a.i > b.i;
        case "<=": return a.i <= b.i;
        case ">=": return a.i >= b.i;
      }
      throw compileError(`two pointers cannot be used with ${op}.`, line);
    }
    if (op !== "+" && op !== "-") throw compileError(`a pointer cannot be used with ${op}.`, line);
    if (!isPtr(l) && op === "-") throw compileError("a pointer cannot be subtracted from a number.", line);
    const [p, pe, ne] = isPtr(l) ? [l, le, re] : [r as Ptr, re, le];
    const n = this.int(isPtr(l) ? r : l, ne) * (op === "-" ? -1 : 1);
    if (p.a === null) throw fault("null_dereference", `${exprText(pe)} is nullptr, so there is no array to move along.`);
    const at = this.elemPos(p.a);
    if (!at) {
      if (n === 0) return p;
      throw fault("out_of_bounds", `${exprText(pe)} points at a single object, not into an array, so moving it ${n} place${Math.abs(n) === 1 ? "" : "s"} leaves that object.`);
    }
    const j = at.i + n;
    // g++ lets a loop step one place before the first element (for (p = a + 4; p >= a; p--)), so -1 is allowed too
    if (j < -1 || j > at.len) {
      throw fault("out_of_bounds", `${exprText(pe)} ${op} ${Math.abs(n)} would point at index ${j}, outside the array of ${at.len} element${at.len === 1 ? "" : "s"} (a pointer may stand on 0 to ${at.len}, where ${at.len} is one past the end).`);
    }
    return ptr(`${at.arr}.${j}`);
  }

  /** The same address written two ways (an array, and its element 0) compares equal. */
  private samePlace(a: string | null, b: string | null): boolean {
    if (a === b) return true;
    if (a === null || b === null || !this.extended) return false;
    const [pa, pb] = [this.elemPos(a), this.elemPos(b)];
    return !!pa && !!pb && pa.arr === pb.arr && pa.i === pb.i;
  }

  /** The elements from `first` up to (not including) `last`: pointers, iterators or arrays. */
  private range(first: Expr, last: Expr, line: number): { arr: string; i: number; j: number; items: Value[] } {
    const at = (x: Expr) => {
      const v = this.use(this.valueFor({ base: "", ptr: 1, ref: false }, x), x);
      if (!isPtr(v) || v.a === null) throw compileError(`${exprText(x)} is not an iterator or a pointer into an array.`, line);
      const p = this.elemPos(v.a);
      if (!p) throw compileError(`${exprText(x)} does not point into an array or a container.`, line);
      return p;
    };
    const a = at(first);
    const b = at(last);
    if (a.arr !== b.arr) throw fault("other", `${exprText(first)} and ${exprText(last)} are not in the same array or container.`);
    if (b.i < a.i) throw fault("other", `${exprText(last)} comes before ${exprText(first)}, so they are not a range.`);
    const whole = this.mem.read(a.arr) as Extract<Value, { k: "arr" }>;
    return { arr: a.arr, i: a.i, j: b.i, items: whole.e.slice(a.i, b.i) };
  }

  /** Write elements back after an algorithm moved them. */
  private writeRange(r: { arr: string; i: number }, items: Value[]) {
    const whole = this.mem.read(r.arr) as Extract<Value, { k: "arr" }>;
    const e = [...whole.e];
    items.forEach((v, k) => { e[r.i + k] = v; });
    this.mem.write(r.arr, whole.cap === undefined ? { k: "arr", e } : { k: "arr", e, cap: whole.cap });
  }

  // ---- comparing (extended mode) ---------------------------------------------

  /** std::less: numbers, strings, pairs and vectors (element by element), objects with operator<. */
  private less(a: Value, b: Value, line: number): boolean {
    if (isK(a, "obj") && isK(b, "obj")) {
      const cls = this.classes.get(a.type);
      if (cls?.builtin?.kind === "pair") {
        if (this.less(a.f.first, b.f.first, line)) return true;
        if (this.less(b.f.first, a.f.first, line)) return false;
        return this.less(a.f.second, b.f.second, line);
      }
      const op = this.userOperator("<", a, b, line);
      if (op !== undefined) return this.truthy(op, { k: "value", v: op, line });
      throw compileError(`${a.type} has no operator<, so two of them cannot be compared. Give it bool operator<(const ${a.type}& other) const, or pass a comparison function.`, line);
    }
    if (isK(a, "arr") && isK(b, "arr")) {
      for (let i = 0; i < Math.min(a.e.length, b.e.length); i++) {
        if (this.less(a.e[i], b.e[i], line)) return true;
        if (this.less(b.e[i], a.e[i], line)) return false;
      }
      return a.e.length < b.e.length;
    }
    const x: Expr = { k: "value", v: a, line };
    const y: Expr = { k: "value", v: b, line };
    return this.truthy(this.arith("<", this.use(a, x), this.use(b, y), x, y, line), x);
  }

  /** `a op b` with an operator the program wrote for its class (a method or a free function). */
  private userOperator(op: string, a: Value, b: Value, line: number, aAddr?: string): Value | undefined {
    if (!isK(a, "obj")) {
      const free = this.program.functions.find((f) => f.name === `operator${op}` && f.params.length === 2);
      return free ? this.invoke(free, [{ k: "value", v: a, line }, { k: "value", v: b, line }], null, line) : undefined;
    }
    const m = this.findMethod(this.classes.get(a.type), `operator${op}`, 1);
    const free = m ? null : this.program.functions.find((f) => f.name === `operator${op}` && f.params.length === 2);
    if (free) return this.invoke(free, [{ k: "value", v: a, line, at: aAddr }, { k: "value", v: b, line }], null, line);
    if (!m) return undefined;
    if (aAddr) return this.invoke(m, [{ k: "value", v: b, line }], aAddr, line);
    return this.onTemporary(a, (addr) => this.invoke(m, [{ k: "value", v: b, line }], addr, line));
  }

  /** Run `use` with the value stored in a short-lived slot, for a method that needs `this`. */
  private onTemporary<T>(v: Value, body: (addr: string) => T): T {
    const frame = this.mem.top();
    frame.scopes.push([]);
    try {
      const slot = this.mem.declare("(temporary)", { base: isK(v, "obj") ? v.type : "int", ptr: 0, ref: false }, false, copyValue(v));
      return body(this.mem.slotAddr(frame, slot));
    } finally {
      frame.scopes.pop();
      frame.version++;
      this.mem.deaths.push(`s${frame.serial}`);
    }
  }

  /** A comparison given to sort and the other algorithms: a function, a lambda or greater<T>(). */
  private comparator(arg: Expr | undefined, line: number): Less<Value> {
    if (!arg) return (a, b) => this.less(a, b, line);
    const call = this.callable(arg, line);
    return (a, b) => this.truthy(call([{ k: "value", v: a, line }, { k: "value", v: b, line }]), arg);
  }

  /** Something that can be called with values: a function name, a lambda, a functor object. */
  private callable(arg: Expr, line: number): (args: Expr[]) => Value {
    const vals = (args: Expr[]) => args;
    if (arg.k === "var" && this.tryVarAddr(arg.name) === null) {
      const fn = this.program.functions.find((f) => f.name === arg.name);
      if (!fn) throw compileError(`"${arg.name}" is not a function or a variable.`, line);
      return (args) => this.invoke(this.pickTemplate(fn, vals(args), undefined, line), vals(args), null, line);
    }
    const v = this.use(this.value(arg), arg);
    if (isK(v, "obj") && v.type === "lambda") {
      const closure = this.closures.get(v.f.id as number)!;
      return (args) => this.invoke(closure.fn, vals(args), closure.frame.thisAddr, line, closure.frame);
    }
    if (isK(v, "obj")) {
      const b = this.classes.get(v.type)?.builtin;
      if (b?.kind === "functor") {
        return ([a, c]) => {
          const [x, y] = [this.value(a), this.value(c)];
          return b.op === "<" ? this.less(x, y, line) : this.less(y, x, line);
        };
      }
      const m = this.findMethod(this.classes.get(v.type), "operator()", 2) ?? this.findMethod(this.classes.get(v.type), "operator()", 1);
      if (m) return (args) => this.onTemporary(v, (addr) => this.invoke(m, vals(args), addr, line));
    }
    throw compileError(`${exprText(arg)} cannot be called.`, line);
  }

  /** For a function template, the version for these arguments. */
  private pickTemplate(fn: FuncDef, args: Expr[], explicit: TypeRef[] | undefined, line: number): FuncDef {
    if (!fn.typeParams) return fn;
    const map = new Map<string, TypeRef>();
    explicit?.forEach((t, i) => { if (fn.typeParams![i]) map.set(fn.typeParams![i], t); });
    fn.params.forEach((p, i) => {
      const a = args[i];
      if (!a) return;
      const t = this.exprType(a);
      if (t) this.unify(p.type, t, map, fn.typeParams!);
    });
    const missing = fn.typeParams.find((t) => !map.has(t));
    if (missing) throw compileError(`HeapHop cannot tell what ${missing} is in this call to ${fn.name}(). Write it out, for example ${fn.name}<int>(...).`, line);
    const key = `${fn.name}<${fn.typeParams.map((t) => typeText(map.get(t)!)).join(", ")}>#${fn.line}`;
    let made = this.instances.get(key);
    if (!made) {
      made = { ...substitute(fn, map, new Map()), typeParams: undefined, name: key.slice(0, key.indexOf("#")) };
      this.instances.set(key, made);
    }
    return made;
  }

  private unify(param: TypeRef, arg: TypeRef, map: Map<string, TypeRef>, params: string[]) {
    if (params.includes(param.base)) {
      if (!map.has(param.base) && arg.ptr >= param.ptr) map.set(param.base, { base: arg.base, ptr: arg.ptr - param.ptr, ref: false });
      return;
    }
    const [p, a] = [splitTemplate(param.base), splitTemplate(arg.base)];
    if (p && a && p.name === a.name && p.args.length === a.args.length) {
      p.args.forEach((x, i) => this.unify(typeFromText(x), typeFromText(a.args[i]), map, params));
    }
  }

  /** The type an expression has, worked out without running it (null when unknown). */
  private exprType(e: Expr): TypeRef | null {
    const t = (base: string, p = 0): TypeRef => ({ base, ptr: p, ref: false });
    switch (e.k) {
      case "int": return t(e.text && /[lL]/.test(e.text) ? "long long" : "int");
      case "float": return t("double");
      case "char": return t("char");
      case "bool": return t("bool");
      case "string": return t("char", 1);
      case "var": {
        const slot = this.mem.findSlot(this.mem.top(), e.name);
        if (slot) return { ...slot.type, ptr: slot.type.ptr + (slot.isArray ? 1 : 0), ref: false };
        const addr = this.tryVarAddr(e.name);
        const placed = addr ? this.mem.typeAt(addr) : null;
        return placed ? { ...placed.type, ptr: placed.type.ptr + (placed.isArray ? 1 : 0), ref: false } : null;
      }
      case "member": case "deref": case "index": case "this": {
        const s = this.staticType(e);
        if (s && e.k === "index") {
          const c = this.container(this.staticType(e.arr));
          if (c) return { ...(c.kind === "map" ? (c as Extract<Seq, { kind: "map" }>).value : c.elem), ref: false };
        }
        return s ? { ...s, ref: false } : null;
      }
      case "cast": return { ...e.type, ref: false };
      case "temp": return t(e.type);
      case "unary": return e.op === "!" ? t("bool") : this.exprType(e.e);
      case "ternary": return this.exprType(e.a);
      case "binary": {
        if (["==", "!=", "<", ">", "<=", ">=", "&&", "||"].includes(e.op)) return t("bool");
        const [l, r] = [this.exprType(e.l), this.exprType(e.r)];
        if (l?.base === "double" || r?.base === "double") return t("double");
        return l ?? r;
      }
      case "call": {
        const f = this.program.functions.find((x) => x.name === e.name && !x.typeParams);
        return f ? { ...f.ret, ref: false } : null;
      }
      case "addr": {
        const s = this.exprType(e.e);
        return s ? { ...s, ptr: s.ptr + 1 } : null;
      }
      default: return null;
    }
  }

  /** `auto [a, b] = p;`: one name for each part of a pair or a struct. */
  private declareBindings(d: Declarator) {
    const names = d.bindings!;
    const source = d.init!;
    let addr: string | null = null;
    try { addr = this.ref(source); } catch { addr = null; }
    const v = addr ? this.mem.read(addr) : this.use(this.value(source), source);
    this.bindParts(names, v, addr, d.type.ref, d.line);
  }

  private bindParts(names: string[], v: Value, addr: string | null, byRef: boolean, line: number) {
    if (!isK(v, "obj")) throw compileError(`[${names.join(", ")}] needs a pair or a struct to take apart.`, line);
    const cls = this.classes.get(v.type)!;
    if (cls.fields.length !== names.length) throw compileError(`${v.type} has ${cls.fields.length} parts, but [${names.join(", ")}] names ${names.length}.`, line);
    if (!byRef || !addr) {
      // by value: a hidden copy of the whole, and each name stands for one part of it
      cls.fields.forEach((f, i) => this.mem.declare(names[i], f.type, f.arraySize !== null, copyValue(v.f[f.name])));
      return;
    }
    cls.fields.forEach((f, i) => this.mem.declare(names[i], f.type, f.arraySize !== null, UNINIT, `${addr}.${f.name}`));
  }

  /** The standard algorithms: sort, reverse, find, max_element, accumulate, lower_bound... */
  private algorithm(e: Extract<Expr, { k: "call" }>): Value | undefined {
    const ALGOS = new Set(["sort", "stable_sort", "reverse", "find", "find_if", "count", "count_if", "max_element", "min_element",
      "accumulate", "fill", "binary_search", "lower_bound", "upper_bound", "next_permutation", "prev_permutation", "iota",
      "unique", "make_heap", "push_heap", "pop_heap", "sort_heap", "all_of", "any_of", "none_of", "for_each", "copy", "is_sorted"]);
    if (!ALGOS.has(e.name) || e.args.length < 2) return undefined;
    if (e.name === "find" && isIter(this.value(e.args[0]))) return undefined; // std::find on a list: the list code
    const line = e.line;
    const r = this.range(e.args[0], e.args[1], line);
    const pos = (k: number) => ptr(`${r.arr}.${r.i + k}`);
    const third = () => {
      if (!e.args[2]) throw compileError(`${e.name}() needs a third argument.`, line);
      return this.use(this.value(e.args[2]), e.args[2]);
    };
    const less = () => this.comparator(e.args[e.name === "binary_search" || e.name === "lower_bound" || e.name === "upper_bound" ? 3 : 2], line);
    const elemType = (): TypeRef => this.mem.typeAt(`${r.arr}.0`)?.type ?? { base: "int", ptr: 0, ref: false };
    const items = [...r.items];
    switch (e.name) {
      case "sort": introsort(items, less()); this.writeRange(r, items); return UNINIT;
      case "stable_sort": stableSort(items, less()); this.writeRange(r, items); return UNINIT;
      case "reverse": reverse(items); this.writeRange(r, items); return UNINIT;
      case "make_heap": makeHeap(items, less()); this.writeRange(r, items); return UNINIT;
      case "push_heap": pushHeap(items, less()); this.writeRange(r, items); return UNINIT;
      case "pop_heap": popHeap(items, less()); this.writeRange(r, items); return UNINIT;
      case "sort_heap": sortHeap(items, less()); this.writeRange(r, items); return UNINIT;
      case "next_permutation": case "prev_permutation": {
        const lt = less();
        const done = nextPermutation(items, e.name === "next_permutation" ? lt : (a, b) => lt(b, a));
        this.writeRange(r, items);
        return done;
      }
      case "is_sorted": { const lt = less(); return items.every((x, k) => k === 0 || !lt(x, items[k - 1])); }
      case "find": {
        const want = third();
        const k = items.findIndex((x) => this.equal(x, want));
        return pos(k < 0 ? items.length : k);
      }
      case "count": { const want = third(); return wide(BigInt(items.filter((x) => this.equal(x, want)).length), 64, false); }
      case "find_if": case "count_if": case "all_of": case "any_of": case "none_of": case "for_each": {
        if (!e.args[2]) throw compileError(`${e.name}() needs a function as its third argument.`, line);
        const f = this.callable(e.args[2], line);
        if (e.name === "for_each") {
          items.forEach((_, k) => {
            const at = `${r.arr}.${r.i + k}`;
            f([{ k: "value", v: this.mem.read(at), line, at }]);
          });
          return UNINIT;
        }
        const test = (x: Value) => this.truthy(f([{ k: "value", v: x, line }]), e.args[2]);
        if (e.name === "find_if") { const k = items.findIndex(test); return pos(k < 0 ? items.length : k); }
        if (e.name === "count_if") return wide(BigInt(items.filter(test).length), 64, false);
        if (e.name === "all_of") return items.every(test);
        if (e.name === "any_of") return items.some(test);
        return !items.some(test);
      }
      case "max_element": case "min_element": {
        if (items.length === 0) return pos(0);
        const lt = less();
        let best = 0;
        for (let k = 1; k < items.length; k++) {
          if (e.name === "max_element" ? lt(items[best], items[k]) : lt(items[k], items[best])) best = k;
        }
        return pos(best);
      }
      case "accumulate": {
        let total = third();
        const t = this.thrownType(e.args[2], total);
        const x: Expr = { k: "value", v: UNINIT, line };
        for (const item of items) {
          total = e.args[3] ? this.callable(e.args[3], line)([{ k: "value", v: total, line }, { k: "value", v: item, line }]) : this.arith("+", total, this.use(item, x), x, x, line);
          total = this.coerce(t, total, line);
        }
        return total;
      }
      case "fill": {
        const v = third();
        const t = elemType();
        this.writeRange(r, items.map(() => this.copyOwned(this.coerce(t, v, line), line)));
        return UNINIT;
      }
      case "iota": {
        let v = third();
        const t = elemType();
        const out: Value[] = [];
        const x: Expr = { k: "value", v: UNINIT, line };
        for (let k = 0; k < items.length; k++) { out.push(this.coerce(t, v, line)); v = this.arith("+", v, 1, x, x, line); }
        this.writeRange(r, out);
        return UNINIT;
      }
      case "binary_search": case "lower_bound": case "upper_bound": {
        const want = third();
        const lt = less();
        if (e.name === "upper_bound") return pos(upperBound(items, want, lt));
        const k = lowerBound(items, want, lt);
        if (e.name === "lower_bound") return pos(k);
        return k < items.length && !lt(want, items[k]);
      }
      case "unique": {
        const out: Value[] = [];
        for (const x of items) if (out.length === 0 || !this.equal(out[out.length - 1], x)) out.push(x);
        this.writeRange(r, [...out, ...items.slice(out.length)]);
        return pos(out.length);
      }
      case "copy": {
        const dest = this.use(this.value(e.args[2]), e.args[2]);
        if (!isPtr(dest) || dest.a === null) throw compileError("copy() needs an iterator or pointer to copy into.", line);
        const d = this.elemPos(dest.a);
        if (!d || d.i + items.length > d.len) throw fault("out_of_bounds", "copy() would write past the end of its destination.");
        this.writeRange({ arr: d.arr, i: d.i }, items.map(copyValue));
        return ptr(`${d.arr}.${d.i + items.length}`);
      }
    }
    return undefined;
  }

  /** `Point(1, 2)`, `runtime_error("empty")`: an object made for one expression. */
  private temporary(e: Extract<Expr, { k: "temp" }>): Value {
    const cls = this.classes.get(e.type);
    const type: TypeRef = { base: e.type, ptr: 0, ref: false };
    if (!cls) {
      // T() or int(x) inside a template: a plain value
      if (e.brace || e.args.length !== 1) return this.braceValue(type, e.args, e.line);
      return this.coerce(type, this.use(this.value(e.args[0]), e.args[0]), e.line);
    }
    if (e.brace) return this.braceValue(type, e.args, e.line);
    if (this.lists.info(cls.name)) return this.listCtor(cls.name, e.args, e.line);
    if (this.extended && cls.builtin && cls.builtin.kind !== "exception") return this.stlConstruct(cls, e.args, e.line);
    return this.temporaryOf(cls, e.args, e.line);
  }

  private temporaryOf(cls: ClassDef, args: Expr[], line: number): Value {
    const e = { line, args };
    this.checkConcrete(cls, e.line);
    // It is built in a short-lived slot of the current frame, so its constructor can run on it.
    const frame = this.mem.top();
    frame.scopes.push([]);
    const end = () => {
      frame.scopes.pop();
      frame.version++;
      this.mem.deaths.push(`s${frame.serial}`);
    };
    try {
      const slot = this.mem.declare("(temporary)", { base: cls.name, ptr: 0, ref: false }, false, this.makeObject(cls, cls.ctors.length === 0, e.line));
      this.construct(cls, this.mem.slotAddr(frame, slot), e.args, e.line);
      const v = slot.value;
      end();
      return v;
    } catch (err) {
      end();
      throw err;
    }
  }

  // ---- extended mode: numbers, casts, sizeof, cin as a condition -------------

  /** An integer literal: an int, unless it has a suffix (5u, 10LL) or does not fit in one. */
  private intLiteral(e: Extract<Expr, { k: "int" }>): Value {
    const text = e.text;
    if (!text) return e.v;
    const digits = text.replace(/[lLuU]+$/, "");
    const big = BigInt(digits);
    const suffix = text.slice(digits.length).toLowerCase();
    const u = suffix.includes("u");
    const long = suffix.includes("l");
    if (!u && !long) return big <= BigInt(2147483647) ? Number(big) : wide(big, 64, false);
    if (u && !long && big <= BigInt(4294967295)) return wide(big, 32, true);
    return wide(big, 64, u);
  }

  private cast(e: Extract<Expr, { k: "cast" }>): Value {
    const v = this.use(this.value(e.e), e.e);
    if (e.type.ptr > 0) {
      if (isK(v, "arr")) return ptr(this.ref(e.e));
      if (!isPtr(v)) {
        if (this.num(v, e.e) === 0) return NULL_PTR;
        throw unsupported("Turning a number into a pointer", e.line);
      }
      if (e.how === "dynamic" && v.a !== null) {
        // dynamic_cast<Dog*>(animal): the pointer if the object really is a Dog, else nullptr
        const target = this.mem.read(v.a);
        return isK(target, "obj") && this.isA(target.type, e.type.base) ? v : NULL_PTR;
      }
      return v;
    }
    return this.coerce(e.type, v, e.line);
  }

  /** Is the class `type` the class `base`, or derived from it? */
  private isA(type: string, base: string): boolean {
    for (let c: string | undefined = type; c; c = this.classes.get(c)?.bases?.[0]) if (c === base) return true;
    return false;
  }

  /** sizeof a type, with g++'s sizes and alignment on 64-bit Linux. */
  private sizeOfType(t: TypeRef): number {
    return this.layout(t)[0];
  }

  /** [size, alignment] of a type. */
  private layout(t: TypeRef): [number, number] {
    const scalar = scalarLayout(t.base, t.ptr);
    if (scalar) return scalar;
    if (this.program.enums?.has(t.base)) return [4, 4];
    const cls = this.classes.get(t.base);
    if (!cls) throw unsupported(`sizeof(${typeText(t)})`, this.line);
    if (cls.builtin) return [24, 8]; // std::list (and the other containers): three pointers' worth
    let offset = 0;
    let align = 1;
    if (this.hasVirtual(cls)) { offset = 8; align = 8; } // the hidden pointer to the class's virtual table
    for (const f of cls.fields) {
      const [size, a] = this.layout(f.type);
      const count = (f.arraySize ?? 1) * (f.arraySize2 ?? 1);
      offset = Math.ceil(offset / a) * a + size * count;
      align = Math.max(align, a);
    }
    return [Math.max(1, Math.ceil(offset / align) * align), align];
  }

  private hasVirtual(cls: ClassDef): boolean {
    for (let c: ClassDef | undefined = cls; c; c = c.bases ? this.classes.get(c.bases[0]) : undefined) {
      if (c.methods.some((m) => m.isVirtual) || c.dtor?.isVirtual) return true;
    }
    return false;
  }

  /** sizeof an expression: of a whole array when the expression names one. */
  private sizeOfExpr(e: Expr): number {
    if (e.k === "string") return e.v.length + 1; // a string literal is a char array, with its '\0'
    if (e.k === "var" || e.k === "member" || e.k === "index" || e.k === "deref") {
      const addr = this.ref(e);
      const placed = this.mem.typeAt(addr);
      if (placed) {
        const one = this.sizeOfType(placed.type);
        if (!placed.isArray) return one;
        const v = this.mem.read(addr);
        if (!isK(v, "arr")) return one;
        const inner = v.e[0];
        return one * v.e.length * (isK(inner, "arr") ? inner.e.length : 1);
      }
    }
    const v = this.value(e);
    if (typeof v === "number") return 4;
    if (typeof v === "boolean") return 1;
    switch (v.k) {
      case "dbl": return 8;
      case "chr": return 1;
      case "str": return 32;
      case "ptr": return 8;
      case "wide": return v.bits / 8;
      case "obj": return this.sizeOfType({ base: v.type, ptr: 0, ref: false });
      default: throw unsupported("sizeof of this expression", e.line);
    }
  }

  /**
   * `while (cin >> x)`: read like `cin >> x;`, but at the end of the input, or when the text
   * is not a number, give false instead of stopping, as a real stream does.
   */
  private cinRead(e: Extract<Expr, { k: "cinRead" }>): boolean {
    if (this.cinFailed) return false;
    const consumed: string[] = [];
    for (const target of e.targets) {
      const got = this.readInputSoft(target, e.line);
      if (got === null) { this.cinFailed = true; break; }
      consumed.push(got);
    }
    if (consumed.length > 0) {
      this.line = e.line;
      const shown = consumed.join(" ");
      this.step("input", e.line, `${this.srcLine(e.line)}  ←  ${shown}`, { input: shown });
    }
    return !this.cinFailed;
  }

  /** One read for cinRead: the text consumed, or null if the read failed. */
  private readInputSoft(target: Expr, line: number): string | null {
    const at = this.stdin.mark();
    try {
      return this.readInput(target, false, line);
    } catch (err) {
      if (!(err instanceof StopSignal)) throw err;
      // A word where a number was expected: C++ stores 0 and leaves the word unread.
      const addr = this.ref(target);
      const t = this.mem.typeAt(addr);
      this.stdin.reset(at);
      const next = this.stdin.token();
      this.stdin.reset(at);
      if (next !== null && t && t.type.ptr === 0 && t.type.base !== "string") this.mem.write(addr, this.coerce(t.type, 0, line));
      return null;
    }
  }
}
