// std::list for the interpreter.
//
// A list is drawn the way students draw one by hand, so it is built from the same parts
// as a list they write themselves:
//
//   list<int> nums            an object with  head, tail (node pointers) and size
//   list<int>::node           a heap object with  prev, value, next
//   list<int>::iterator it    a pointer to a node, or end() when it stands past the last one
//
// Real implementations keep a hidden sentinel node; HeapHop leaves it out because it only
// confuses the picture. Everything the program can observe (values, order, size, which
// iterators stay valid) behaves as in real C++. The things real C++ leaves undefined
// (pop_back on an empty list, using an erased iterator, ++ past end()) stop the run with
// an explanation instead.
import type { BuiltinClass, ClassDef, TypeRef } from "./ast";
import { fault } from "./errors";
import type { Memory } from "./memory";
import { iter, NULL_PTR, ptr, type Ptr, type Value } from "./values";

type ListInfo = Extract<BuiltinClass, { kind: "list" }>;

/** What the list code needs from the executor. */
export interface ListHost {
  readonly mem: Memory;
  readonly classes: Map<string, ClassDef>;
  /** Run destructors of an element that is about to disappear. */
  destroyValue(v: Value, addr: string): void;
  /** `a == b` as the program means it. */
  equal(a: Value, b: Value): boolean;
  /** `a < b` as the program means it. */
  less(a: Value, b: Value, line: number): boolean;
  /** A copy that owns its own lists (lists inside objects are copied node by node). */
  copy(v: Value, line: number): Value;
}

const obj = (type: string, f: Record<string, Value>): Value => {
  const fields: Record<string, Value> = Object.create(null);
  Object.assign(fields, f);
  return { k: "obj", type, f: fields };
};

export class ListRuntime {
  constructor(private host: ListHost) {}

  private get mem(): Memory { return this.host.mem; }

  /** The list behind a type name, or null if the type is not a std::list. */
  info(type: string): ListInfo | null {
    const b = this.host.classes.get(type)?.builtin;
    return b?.kind === "list" ? b : null;
  }

  /** The list type a value is, or null. */
  typeOf(v: Value): string | null {
    return typeof v === "object" && v.k === "obj" && this.info(v.type) ? v.type : null;
  }

  /** `list<int>::iterator` -> `list<int>`, or null if this is not an iterator type. */
  iteratorOf(t: TypeRef): string | null {
    if (t.ptr !== 0 || !t.base.endsWith("::iterator")) return null;
    const list = t.base.slice(0, -"::iterator".length);
    return this.info(list) ? list : null;
  }

  empty(type: string): Value {
    return obj(type, { head: NULL_PTR, tail: NULL_PTR, size: 0 });
  }

  // ---- reading -------------------------------------------------------------

  private link(addr: string): string | null {
    const v = this.mem.read(addr);
    return typeof v === "object" && v.k === "ptr" ? v.a : null;
  }

  size(la: string): number {
    const n = this.mem.read(`${la}.size`);
    return typeof n === "number" ? n : 0;
  }

  /** Node ids from the first to the last. */
  nodes(la: string): string[] {
    const out: string[] = [];
    for (let id = this.link(`${la}.head`); id !== null; id = this.link(`${id}.next`)) out.push(id);
    return out;
  }

  /** Same, starting from the head pointer inside a list value (one that may not be in memory yet). */
  private nodesOf(v: Value): string[] {
    if (typeof v !== "object" || v.k !== "obj") return [];
    const head = v.f.head;
    const out: string[] = [];
    let id = typeof head === "object" && head.k === "ptr" ? head.a : null;
    for (; id !== null; id = this.link(`${id}.next`)) out.push(id);
    return out;
  }

  // ---- building ------------------------------------------------------------

  private newNode(info: ListInfo, value: Value, prev: string | null, next: string | null, line: number): string {
    return this.mem.alloc({ base: info.node, ptr: 0, ref: false }, false,
      obj(info.node, { prev: prev ? ptr(prev) : NULL_PTR, value, next: next ? ptr(next) : NULL_PTR }), line);
  }

  /** A new list value whose nodes hold `values`, in order. The nodes are allocated now. */
  build(type: string, values: Value[], line: number): Value {
    const info = this.info(type)!;
    const ids: string[] = [];
    for (const v of values) {
      const id = this.newNode(info, v, ids[ids.length - 1] ?? null, null, line);
      if (ids.length > 0) this.mem.write(`${ids[ids.length - 1]}.next`, ptr(id));
      ids.push(id);
    }
    return obj(type, {
      head: ids.length ? ptr(ids[0]) : NULL_PTR,
      tail: ids.length ? ptr(ids[ids.length - 1]) : NULL_PTR,
      size: ids.length,
    });
  }

  /** `list<int> b = a;`: new nodes holding copies of the elements. */
  copyOf(v: Value, line: number): Value {
    const type = this.typeOf(v)!;
    const values = this.nodesOf(v).map((id) => this.host.copy(this.mem.read(`${id}.value`), line));
    return this.build(type, values, line);
  }

  // ---- changing ------------------------------------------------------------

  private setSize(la: string, n: number) {
    this.mem.write(`${la}.size`, n);
  }

  /** Insert `value` before node `before` (null = at the back). Returns the new node. */
  insertBefore(la: string, type: string, before: string | null, value: Value, line: number): string {
    const info = this.info(type)!;
    const prev = before === null ? this.link(`${la}.tail`) : this.link(`${before}.prev`);
    const id = this.newNode(info, value, prev, before, line);
    if (prev) this.mem.write(`${prev}.next`, ptr(id));
    else this.mem.write(`${la}.head`, ptr(id));
    if (before) this.mem.write(`${before}.prev`, ptr(id));
    else this.mem.write(`${la}.tail`, ptr(id));
    this.setSize(la, this.size(la) + 1);
    return id;
  }

  pushFront(la: string, type: string, value: Value, line: number): void {
    this.insertBefore(la, type, this.link(`${la}.head`), value, line);
  }

  /** Unlink and delete one node. Returns the node after it (null when it was the last). */
  unlink(la: string, id: string, line: number): string | null {
    const prev = this.link(`${id}.prev`);
    const next = this.link(`${id}.next`);
    if (prev) this.mem.write(`${prev}.next`, next ? ptr(next) : NULL_PTR);
    else this.mem.write(`${la}.head`, next ? ptr(next) : NULL_PTR);
    if (next) this.mem.write(`${next}.prev`, prev ? ptr(prev) : NULL_PTR);
    else this.mem.write(`${la}.tail`, prev ? ptr(prev) : NULL_PTR);
    this.setSize(la, this.size(la) - 1);
    this.host.destroyValue(this.mem.read(`${id}.value`), `${id}.value`);
    this.mem.free(id, line);
    return next;
  }

  /** pop_front / pop_back. */
  pop(la: string, end: "head" | "tail", method: string, what: string, line: number) {
    const id = this.link(`${la}.${end}`);
    if (id === null) {
      throw fault("other", `${what}.${method}() is called on an empty list. There is no element to remove; in real C++ this is undefined behaviour and often crashes.`);
    }
    this.unlink(la, id, line);
  }

  /** Address of the value of the first or last element, for front() and back(). */
  endRef(la: string, end: "head" | "tail", method: string, what: string): string {
    const id = this.link(`${la}.${end}`);
    if (id === null) {
      throw fault("other", `${what}.${method}() is called on an empty list, so there is no element to give back. In real C++ this is undefined behaviour.`);
    }
    return `${id}.value`;
  }

  clear(la: string, line: number) {
    for (const id of this.nodes(la)) this.unlink(la, id, line);
  }

  /** The list's own memory goes away (its variable ended, or it was deleted): delete every node. */
  destroy(la: string, line: number) {
    let ids: string[];
    try { ids = this.nodes(la); } catch { return; }
    for (const id of ids) {
      this.host.destroyValue(this.mem.read(`${id}.value`), `${id}.value`);
      this.mem.free(id, line);
    }
  }

  /** `a = b;` with `value` already copied: the old nodes are deleted, the new ones take their place. */
  replace(la: string, value: Value, line: number) {
    this.destroy(la, line);
    this.mem.write(la, value);
  }

  reverse(la: string) {
    const ids = this.nodes(la);
    for (const id of ids) {
      const prev = this.mem.read(`${id}.prev`);
      this.mem.write(`${id}.prev`, this.mem.read(`${id}.next`));
      this.mem.write(`${id}.next`, prev);
    }
    const head = this.mem.read(`${la}.head`);
    this.mem.write(`${la}.head`, this.mem.read(`${la}.tail`));
    this.mem.write(`${la}.tail`, head);
  }

  /** Relink the nodes in the given order (the values stay in their nodes, as std::list::sort does). */
  private relink(la: string, ids: string[]) {
    ids.forEach((id, i) => {
      this.mem.write(`${id}.prev`, i > 0 ? ptr(ids[i - 1]) : NULL_PTR);
      this.mem.write(`${id}.next`, i < ids.length - 1 ? ptr(ids[i + 1]) : NULL_PTR);
    });
    this.mem.write(`${la}.head`, ids.length ? ptr(ids[0]) : NULL_PTR);
    this.mem.write(`${la}.tail`, ids.length ? ptr(ids[ids.length - 1]) : NULL_PTR);
  }

  sort(la: string, line: number) {
    const ids = this.nodes(la);
    const values = new Map(ids.map((id) => [id, this.mem.read(`${id}.value`)]));
    // Stable, like std::list::sort: equal elements keep their order.
    const sorted = ids
      .map((id, i) => ({ id, i }))
      .sort((a, b) => {
        const [va, vb] = [values.get(a.id)!, values.get(b.id)!];
        if (this.host.less(va, vb, line)) return -1;
        if (this.host.less(vb, va, line)) return 1;
        return a.i - b.i;
      })
      .map((x) => x.id);
    this.relink(la, sorted);
  }

  remove(la: string, value: Value, line: number) {
    for (const id of this.nodes(la)) {
      if (this.host.equal(this.mem.read(`${id}.value`), value)) this.unlink(la, id, line);
    }
  }

  /** Remove each element equal to the one before it. */
  unique(la: string, line: number) {
    let kept: Value | undefined;
    for (const id of this.nodes(la)) {
      const v = this.mem.read(`${id}.value`);
      if (kept !== undefined && this.host.equal(v, kept)) this.unlink(la, id, line);
      else kept = v;
    }
  }

  // ---- iterators -----------------------------------------------------------

  begin(la: string, type: string): Ptr {
    return iter(type, la, this.link(`${la}.head`));
  }

  end(la: string, type: string): Ptr {
    return iter(type, la, null);
  }

  /**
   * The node an iterator stands on, checked: null means end(). An iterator whose node was
   * erased is the classic mistake, so it gets its own message.
   */
  node(it: Ptr, what: string): string | null {
    if (it.a === null) return null;
    if (!this.mem.heap.has(it.a)) {
      const dead = this.mem.freed.get(it.a);
      throw fault("use_after_free", dead
        ? `The iterator ${what} is no longer valid: the element it pointed at was erased on line ${dead.line}.`
        : `The iterator ${what} does not point at an element of a list.`);
    }
    return it.a;
  }

  /** Address of the element an iterator stands on, for *it and it->field. */
  elem(it: Ptr, what: string): string {
    const id = this.node(it, what);
    if (id === null) {
      throw fault("out_of_bounds", `The iterator ${what} is end(), which stands one place past the last element. There is no element there to read or change.`);
    }
    return `${id}.value`;
  }

  /** ++it (delta 1) or --it (delta -1). */
  step(it: Ptr, delta: 1 | -1, what: string): Ptr {
    const id = this.node(it, what);
    let to: string | null;
    if (delta === 1) {
      if (id === null) throw fault("out_of_bounds", `The iterator ${what} is already end(), so ++ would move past the end of the list.`);
      to = this.link(`${id}.next`);
    } else if (id === null) {
      to = this.link(`${it.l}.tail`);
      if (to === null) throw fault("out_of_bounds", `The iterator ${what} is end() of an empty list, so -- has no element to move back to.`);
    } else {
      to = this.link(`${id}.prev`);
      if (to === null) throw fault("out_of_bounds", `The iterator ${what} is at begin(), so -- would move before the first element.`);
    }
    return { ...it, a: to };
  }

  /** The iterator must belong to this list (insert and erase take a position in this list). */
  owns(la: string, it: Ptr, what: string, method: string) {
    if (it.l !== la) throw fault("other", `The iterator ${what} belongs to a different list, so it cannot be a position for ${method}() here.`);
  }
}
