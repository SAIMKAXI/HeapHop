// Runtime values of the interpreter. Scalars are immutable; objects and arrays are
// mutable containers that live inside a heap cell or a stack slot.

export interface Dbl { k: "dbl"; v: number }
export interface Chr { k: "chr"; c: string }
export interface Str { k: "str"; s: string }
/**
 * A pointer. `a` is an address such as "h3", "h3.next" or "s2.list.head"; null is nullptr.
 *
 * A std::list iterator is a pointer with `iter` set: `a` is the node it stands on (null at
 * end()), `iter` is the list type ("list<int>") and `l` the address of the list it walks.
 */
export interface Ptr { k: "ptr"; a: string | null; iter?: string; l?: string }
/**
 * A whole number of a type other than int (extended mode only): long long, long, unsigned,
 * size_t... Held as a BigInt so 64-bit values and unsigned wrap-around are exact, as in g++.
 */
export interface Wide { k: "wide"; v: bigint; bits: 32 | 64; u: boolean }
interface Obj { k: "obj"; type: string; f: Record<string, Value> }
/** `cap`: a std::vector's capacity (extended mode); a copy has none, as a copied vector's capacity is its size. */
interface Arr { k: "arr"; e: Value[]; cap?: number }
/** A variable that was declared but never given a value. */
export interface Uninit { k: "uninit" }

/** A plain number is an int; a boolean is a bool. */
export type Value = number | boolean | Dbl | Chr | Str | Ptr | Obj | Arr | Uninit | Wide;

export const UNINIT: Uninit = { k: "uninit" };
export const NULL_PTR: Ptr = { k: "ptr", a: null };
export const ptr = (a: string): Ptr => ({ k: "ptr", a });
/** An iterator of the list type `listType` that lives at `list`, standing on node `a` (null = end()). */
export const iter = (listType: string, list: string, a: string | null): Ptr => ({ k: "ptr", a, iter: listType, l: list });
export const dbl = (v: number): Dbl => ({ k: "dbl", v });
export const chr = (c: string): Chr => ({ k: "chr", c });
export const str = (s: string): Str => ({ k: "str", s });
/** A whole number of `bits` bits, wrapped the way C++ wraps it. */
export const wide = (v: bigint, bits: 32 | 64, u: boolean): Wide => ({ k: "wide", v: u ? BigInt.asUintN(bits, v) : BigInt.asIntN(bits, v), bits, u });

export function kindOf(v: Value): "int" | "bool" | Exclude<Value, number | boolean>["k"] {
  if (typeof v === "number") return "int";
  if (typeof v === "boolean") return "bool";
  return v.k;
}

/** C++ value semantics: assigning or passing an object copies it. */
export function copyValue(v: Value): Value {
  if (typeof v !== "object") return v;
  if (v.k === "obj") {
    const f: Record<string, Value> = Object.create(null);
    for (const key of Object.keys(v.f)) f[key] = copyValue(v.f[key]);
    return { k: "obj", type: v.type, f };
  }
  if (v.k === "arr") return { k: "arr", e: v.e.map(copyValue) };
  return v;
}
