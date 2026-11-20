// Runtime values of the interpreter. Scalars are immutable; objects and arrays are
// mutable containers that live inside a heap cell or a stack slot.

export interface Dbl { k: "dbl"; v: number }
export interface Chr { k: "chr"; c: string }
export interface Str { k: "str"; s: string }
/** A pointer. `a` is an address such as "h3", "h3.next" or "s2.list.head"; null is nullptr. */
export interface Ptr { k: "ptr"; a: string | null }
interface Obj { k: "obj"; type: string; f: Record<string, Value> }
interface Arr { k: "arr"; e: Value[] }
/** A variable that was declared but never given a value. */
export interface Uninit { k: "uninit" }

/** A plain number is an int; a boolean is a bool. */
export type Value = number | boolean | Dbl | Chr | Str | Ptr | Obj | Arr | Uninit;

export const UNINIT: Uninit = { k: "uninit" };
export const NULL_PTR: Ptr = { k: "ptr", a: null };
export const ptr = (a: string): Ptr => ({ k: "ptr", a });
export const dbl = (v: number): Dbl => ({ k: "dbl", v });
export const chr = (c: string): Chr => ({ k: "chr", c });
export const str = (s: string): Str => ({ k: "str", s });

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
