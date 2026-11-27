// The classes of a run in the VS Code extension's mode, including the ones made on demand:
// standard containers (vector<int>, map<string, int>, pair<int, int>...) and the classes a
// program's own templates stand for (Stack<int>, Node<double>). A name such as
// "vector<pair<int, int>>" is looked up like any class; the first lookup builds it.
//
// Type names are always written the same way, so two spellings of one type meet:
// arguments are joined with ", ", pointers are stars right after the name, and nested
// templates close with ">>" (`vector<vector<int>>`).
import { typeText, type ClassDef, type Field, type FuncDef, type TypeRef } from "./ast";

/** Standard templates HeapHop knows, and how many type arguments they take. */
export const STD_TEMPLATES: Record<string, [number, number]> = {
  vector: [1, 1], deque: [1, 1], stack: [1, 2], queue: [1, 2], priority_queue: [1, 3],
  pair: [2, 2], map: [2, 3], set: [1, 2], greater: [0, 1], less: [0, 1],
};

/** The containers whose value is a row of elements (an array value). */
export const SEQUENCES = new Set(["vector", "deque", "stack", "queue", "pq", "set", "map"]);

export function templateName(name: string, args: TypeRef[]): string {
  return `${name}<${args.map((a) => typeText({ ...a, ref: false })).join(", ")}>`;
}

/** "Stack<int*>" -> { name: "Stack", args: ["int*"] }. Null for a plain name. */
export function splitTemplate(text: string): { name: string; args: string[] } | null {
  const open = text.indexOf("<");
  if (open < 0 || !text.endsWith(">")) return null;
  const args: string[] = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open + 1; i < text.length - 1; i++) {
    const c = text[i];
    if (c === "<") depth++;
    else if (c === ">") depth--;
    else if (c === "," && depth === 0) { args.push(text.slice(start, i).trim()); start = i + 1; }
  }
  args.push(text.slice(start, text.length - 1).trim());
  return { name: text.slice(0, open), args };
}

/** "int*" -> { base: "int", ptr: 1 } */
export function typeFromText(text: string): TypeRef {
  let t = text.trim();
  let ptr = 0;
  while (t.endsWith("*")) { ptr++; t = t.slice(0, -1).trim(); }
  return { base: t, ptr, ref: false };
}

const field = (name: string, type: TypeRef): Field => ({ type, name, arraySize: null, arraySize2: null, init: null, line: 0 });

/** Put the types a template stands for in place of its parameters (in a copy of the AST). */
export function substitute<T>(node: T, map: Map<string, TypeRef>, rename: Map<string, string>): T {
  const names = (text: string) => {
    if (map.has(text)) return typeText(map.get(text)!);
    if (!text.includes("<")) return rename.get(text) ?? text;
    return text.replace(/[A-Za-z_]\w*/g, (w) => (map.has(w) ? typeText(map.get(w)!) : w));
  };
  const walk = (v: unknown, key: string): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x, ""));
    if (typeof v === "string") return key === "type" || key === "className" || key === "base" ? names(v) : v;
    if (!v || typeof v !== "object") return v;
    const o = v as Record<string, unknown>;
    if (typeof o.base === "string" && typeof o.ptr === "number" && typeof o.ref === "boolean") {
      const bound = map.get(o.base);
      if (bound) return { base: bound.base, ptr: bound.ptr + (o.ptr as number), ref: o.ref };
      return { base: names(o.base), ptr: o.ptr, ref: o.ref };
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) out[k] = walk(o[k], k);
    return out;
  };
  return walk(node, "") as T;
}

export class TypeTable extends Map<string, ClassDef> {
  /** The program's class templates by name (`Stack`), each with its type parameters. */
  readonly templates = new Map<string, ClassDef>();

  override get(name: string): ClassDef | undefined {
    const known = super.get(name);
    if (known || !name.includes("<")) return known;
    const nest = name.lastIndexOf(">::");
    if (nest > 0) {
      // Stack<int>::Node: made together with Stack<int>
      this.get(name.slice(0, nest + 1));
      return super.get(name);
    }
    return this.make(name);
  }

  private make(text: string): ClassDef | undefined {
    const parts = splitTemplate(text);
    if (!parts) return undefined;
    const args = parts.args.map(typeFromText);
    const user = this.templates.get(parts.name);
    if (user) return this.instantiate(user, args, text);
    if (!Object.hasOwn(STD_TEMPLATES, parts.name)) return undefined;
    const builtin = (cls: Omit<ClassDef, "ctors" | "dtor" | "methods" | "line">): ClassDef => {
      const made: ClassDef = { ctors: [], dtor: null, methods: [], line: 0, ...cls };
      this.set(text, made);
      return made;
    };
    const [elem, second, third] = args;
    switch (parts.name) {
      case "vector": case "deque": case "stack": case "queue": case "set":
        return builtin({ name: text, fields: [], builtin: { kind: parts.name, elem } });
      case "priority_queue": {
        const cmp = third ? third.base : null;
        return builtin({ name: text, fields: [], builtin: { kind: "pq", elem, cmp: cmp && /^less</.test(cmp) ? null : cmp } });
      }
      case "pair":
        return builtin({ name: text, fields: [field("first", elem), field("second", second)], builtin: { kind: "pair" } });
      case "map": {
        const entry: TypeRef = { base: templateName("pair", [elem, second]), ptr: 0, ref: false };
        this.get(entry.base);
        return builtin({ name: text, fields: [], builtin: { kind: "map", key: elem, value: second, elem: entry } });
      }
      case "greater": case "less":
        return builtin({ name: text, fields: [], builtin: { kind: "functor", op: parts.name === "greater" ? ">" : "<" } });
    }
    return undefined;
  }

  /** `Stack<int>` from `template <typename T> class Stack`. */
  private instantiate(tpl: ClassDef, args: TypeRef[], text: string): ClassDef {
    const params = tpl.typeParams ?? [];
    if (args.length !== params.length) {
      throw new Error(`${tpl.name} takes ${params.length} type argument${params.length === 1 ? "" : "s"}, but ${text} gives ${args.length}.`);
    }
    const map = new Map(params.map((p, i) => [p, args[i]] as const));
    const made = this.copyOf(tpl, map, text, tpl.name);
    // classes declared inside the template: Stack<T>::Node becomes Stack<int>::Node
    const prefix = `${tpl.name}<${params.join(", ")}>::`;
    for (const [key, inner] of this.templates) {
      if (key.startsWith(prefix)) this.copyOf(inner, map, `${text}::${key.slice(prefix.length)}`, inner.shortName ?? key.slice(prefix.length));
    }
    return made;
  }

  private copyOf(tpl: ClassDef, map: Map<string, TypeRef>, text: string, shortName: string): ClassDef {
    const rename = new Map([[tpl.name, text]]);
    const copy = substitute(
      { fields: tpl.fields, ctors: tpl.ctors, dtor: tpl.dtor, methods: tpl.methods, statics: tpl.statics, bases: tpl.bases },
      map, rename,
    );
    const cls: ClassDef = {
      name: text, shortName, line: tpl.line,
      fields: copy.fields, ctors: copy.ctors, dtor: copy.dtor, methods: copy.methods,
      ...(copy.statics ? { statics: copy.statics } : {}), ...(copy.bases ? { bases: copy.bases } : {}),
    };
    const own = (f: FuncDef) => { f.className = text; };
    cls.ctors.forEach(own);
    cls.methods.forEach(own);
    if (cls.dtor) own(cls.dtor);
    this.set(text, cls);
    return cls;
  }
}
