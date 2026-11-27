// Whole numbers wider or narrower than int, as g++ on 64-bit Linux has them, and the
// library constants and functions that come with them. Extended mode only: the website
// keeps every integer an int.
import { dbl, wide, type Value, type Wide } from "./values";

/** Integer types held as Wide values: [bits, unsigned]. */
export const WIDE_TYPES: Record<string, [32 | 64, boolean]> = {
  "unsigned int": [32, true],
  long: [64, false],
  "long long": [64, false],
  "unsigned long": [64, true],
  "unsigned long long": [64, true],
  size_t: [64, true],
};

/** Integer types narrower than int, held as plain numbers but wrapped to their width. */
export const SHORT_TYPES: Record<string, [16, boolean]> = {
  short: [16, false],
  "unsigned short": [16, true],
};

const isObj = (v: Value): v is Exclude<Value, number | boolean> => typeof v === "object";

/** The value as a BigInt (a double is cut toward zero, as a C++ conversion does). */
export function toBig(v: Value): bigint {
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "boolean") return v ? BigInt(1) : BigInt(0);
  if (isObj(v)) {
    if (v.k === "wide") return v.v;
    if (v.k === "chr") return BigInt(v.c.charCodeAt(0));
    if (v.k === "dbl") return Number.isFinite(v.v) ? BigInt(Math.trunc(v.v)) : BigInt(0);
  }
  return BigInt(0);
}

interface IntKind { bits: 32 | 64; u: boolean }

/** int, bool and char all take part in arithmetic as int. */
export function intKind(v: Value): IntKind | null {
  if (typeof v === "number" || typeof v === "boolean") return { bits: 32, u: false };
  if (isObj(v) && v.k === "chr") return { bits: 32, u: false };
  if (isObj(v) && v.k === "wide") return { bits: v.bits, u: v.u };
  return null;
}

/** C++'s usual arithmetic conversions for two integer types. */
function common(a: IntKind, b: IntKind): IntKind {
  if (a.u === b.u) return { bits: a.bits >= b.bits ? a.bits : b.bits, u: a.u };
  const [uns, sig] = a.u ? [a, b] : [b, a];
  return uns.bits >= sig.bits ? uns : sig;
}

const fit = (x: bigint, k: IntKind) => (k.u ? BigInt.asUintN(k.bits, x) : BigInt.asIntN(k.bits, x));

/** Back to a Value of kind `k`: a plain int when it is 32-bit signed. */
function back(x: bigint, k: IntKind): Value {
  return k.bits === 32 && !k.u ? Number(BigInt.asIntN(32, x)) : wide(x, k.bits, k.u);
}

export type WideOp = "+" | "-" | "*" | "/" | "%" | "<" | ">" | "<=" | ">=" | "==";

/**
 * Arithmetic or a comparison between two integers when at least one is not an int.
 * Returns null for a division by zero (the caller reports it).
 */
export function wideArith(op: WideOp, l: Value, r: Value): Value | null {
  const k = common(intKind(l)!, intKind(r)!);
  const a = fit(toBig(l), k);
  const b = fit(toBig(r), k);
  switch (op) {
    case "+": return back(fit(a + b, k), k);
    case "-": return back(fit(a - b, k), k);
    case "*": return back(fit(a * b, k), k);
    case "/": return b === BigInt(0) ? null : back(fit(a / b, k), k);
    case "%": return b === BigInt(0) ? null : back(fit(a % b, k), k);
    case "<": return a < b;
    case ">": return a > b;
    case "<=": return a <= b;
    case ">=": return a >= b;
    case "==": return a === b;
  }
}

/** Convert any number to an integer type held as Wide. */
export function toWide(v: Value, type: string): Wide {
  const [bits, u] = WIDE_TYPES[type];
  return wide(toBig(v), bits, u);
}

// ---- <climits>, <cfloat>, std::numeric_limits ---------------------------------

const I64 = (x: bigint) => wide(x, 64, false);
const U64 = (x: bigint) => wide(x, 64, true);

export const LIMIT_CONSTANTS: Record<string, Value> = {
  INT_MAX: 2147483647,
  INT_MIN: -2147483648,
  UINT_MAX: wide(BigInt(4294967295), 32, true),
  LONG_MAX: I64(BigInt(2) ** BigInt(63) - BigInt(1)),
  LONG_MIN: I64(-(BigInt(2) ** BigInt(63))),
  LLONG_MAX: I64(BigInt(2) ** BigInt(63) - BigInt(1)),
  LLONG_MIN: I64(-(BigInt(2) ** BigInt(63))),
  ULONG_MAX: U64(BigInt(2) ** BigInt(64) - BigInt(1)),
  ULLONG_MAX: U64(BigInt(2) ** BigInt(64) - BigInt(1)),
  SHRT_MAX: 32767,
  SHRT_MIN: -32768,
  USHRT_MAX: 65535,
  CHAR_MAX: 127,
  CHAR_MIN: -128,
  UCHAR_MAX: 255,
  SCHAR_MAX: 127,
  SCHAR_MIN: -128,
  RAND_MAX: 2147483647,
  EXIT_SUCCESS: 0,
  EXIT_FAILURE: 1,
  "string::npos": U64(BigInt(2) ** BigInt(64) - BigInt(1)),
  FLT_MAX: dbl(3.4028234663852886e38),
  DBL_MAX: dbl(Number.MAX_VALUE),
  FLT_MIN: dbl(1.1754943508222875e-38),
  DBL_MIN: dbl(2.2250738585072014e-308),
  INFINITY: dbl(Infinity),
  M_PI: dbl(Math.PI),
  M_E: dbl(Math.E),
};

/** std::numeric_limits<type>::which(), or null when HeapHop does not know it. */
export function numericLimit(type: string, which: string): Value | null {
  const ints: Record<string, [Value, Value]> = {
    int: [-2147483648, 2147483647],
    short: [-32768, 32767],
    "unsigned short": [0, 65535],
    char: [{ k: "chr", c: String.fromCharCode(0x80) }, { k: "chr", c: "\x7f" }],
    bool: [false, true],
    "unsigned int": [wide(BigInt(0), 32, true), wide(BigInt(4294967295), 32, true)],
    long: [I64(-(BigInt(2) ** BigInt(63))), I64(BigInt(2) ** BigInt(63) - BigInt(1))],
    "long long": [I64(-(BigInt(2) ** BigInt(63))), I64(BigInt(2) ** BigInt(63) - BigInt(1))],
    "unsigned long": [U64(BigInt(0)), U64(BigInt(2) ** BigInt(64) - BigInt(1))],
    "unsigned long long": [U64(BigInt(0)), U64(BigInt(2) ** BigInt(64) - BigInt(1))],
    size_t: [U64(BigInt(0)), U64(BigInt(2) ** BigInt(64) - BigInt(1))],
  };
  if (Object.hasOwn(ints, type)) {
    const [min, max] = ints[type];
    if (which === "max") return max;
    if (which === "min" || which === "lowest") return min;
    return null;
  }
  const reals: Record<string, { max: number; min: number; eps: number }> = {
    double: { max: Number.MAX_VALUE, min: 2.2250738585072014e-308, eps: Number.EPSILON },
    float: { max: 3.4028234663852886e38, min: 1.1754943508222875e-38, eps: 1.1920928955078125e-7 },
  };
  const r = reals[type];
  if (!r) return null;
  switch (which) {
    case "max": return dbl(r.max);
    case "min": return dbl(r.min);
    case "lowest": return dbl(-r.max);
    case "epsilon": return dbl(r.eps);
    case "infinity": return dbl(Infinity);
    default: return null;
  }
}

// ---- sizeof (g++, x86-64 Linux) --------------------------------------------------

/** [size, alignment] of a type that is not a class, or null. */
export function scalarLayout(base: string, ptr: number): [number, number] | null {
  if (ptr > 0) return [8, 8];
  switch (base) {
    case "char": case "bool": return [1, 1];
    case "short": case "unsigned short": return [2, 2];
    case "int": case "unsigned int": case "float": return [4, 4];
    case "long": case "long long": case "unsigned long": case "unsigned long long": case "size_t": case "double": return [8, 8];
    case "string": return [32, 8];
    default: return null;
  }
}

// ---- rand() exactly as glibc computes it ----------------------------------------

/**
 * glibc's random(): an additive feedback generator over 34 words, seeded by srand().
 * The same seed gives the same numbers as a program built with g++ on Linux.
 * (Windows compilers use a different generator, so their numbers differ.)
 */
export class GlibcRandom {
  private r: number[] = [];
  private i = 0;

  constructor(seed = 1) {
    this.seed(seed);
  }

  seed(seed: number) {
    const r: number[] = new Array(34);
    r[0] = (seed >>> 0) === 0 ? 1 : seed | 0;
    for (let i = 1; i < 31; i++) {
      // r[i] = (16807 * r[i-1]) % 2147483647, kept positive, as glibc computes it
      const hi = Math.trunc(r[i - 1] / 127773);
      const lo = r[i - 1] % 127773;
      let word = 16807 * lo - 2836 * hi;
      if (word < 0) word += 2147483647;
      r[i] = word;
    }
    for (let i = 31; i < 34; i++) r[i] = r[i - 31];
    this.r = r;
    this.i = 34;
    for (let k = 0; k < 310; k++) this.next();
  }

  /** The next rand() value, 0 to RAND_MAX. */
  next(): number {
    const r = this.r;
    const i = this.i;
    const v = (r[(i - 31) % 34] + r[(i - 3) % 34]) | 0;
    r[i % 34] = v;
    this.i = i + 1;
    return (v >>> 1) & 0x7fffffff;
  }
}
