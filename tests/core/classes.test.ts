// Classes, methods, `this`, objects on the stack, destructors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { field, lastLive, last, trace, variable } from "./helpers";

const LIST = `class Node {
public:
    int data;
    Node* next;
    Node(int v) { data = v; next = NULL; }
};
class LinkedList {
private:
    Node* head;
public:
    LinkedList() { head = NULL; }
    void push_front(int v) {
        Node* n = new Node(v);
        n->next = head;
        head = n;
    }
    void print() {
        Node* t = head;
        while (t != NULL) { cout << t->data << " "; t = t->next; }
        cout << endl;
    }
};
int main() {
    LinkedList list;
    list.push_front(2);
    list.push_front(1);
    list.print();
    return 0;
}`;

test("class with public/private sections and member functions runs", () => {
  const t = trace(LIST);
  assert.equal(t.status, "completed");
  assert.equal(t.output, "1 2 \n");
});

test("each method call gets its own stack frame named Class::method", () => {
  const t = trace(LIST);
  const names = new Set(t.steps.flatMap((s) => s.stack.map((f) => f.name)));
  for (const n of ["main", "LinkedList::LinkedList", "LinkedList::push_front", "Node::Node", "LinkedList::print"]) {
    assert.ok(names.has(n), `missing frame ${n}`);
  }
  const inPush = t.steps.find((s) => s.activeFunction === "LinkedList::push_front" && s.kind === "call")!;
  assert.equal(inPush.stack.length, 2);
  assert.equal(inPush.callerSourceLine, 25);
});

test("a method shows `this`, pointing at the object it runs on", () => {
  const t = trace(LIST);
  const inPush = t.steps.find((s) => s.activeFunction === "LinkedList::push_front")!;
  assert.equal(variable(inPush, "this").pointsTo, "f0_list");
});

test("bare member names and this->member both reach the object", () => {
  const t = trace(`class Box { public: int a; int b; Box() { a = 1; this->b = 2; } int sum() { return a + this->b; } };
int main() { Box x; cout << x.sum() << endl; return 0; }`);
  assert.equal(t.output, "3\n");
});

test("an object declared on the stack appears in main's frame with its fields", () => {
  const list = variable(lastLive(trace(LIST)), "list", 0);
  assert.equal(list.kind, "object");
  assert.equal(list.typeName, "LinkedList");
  const head = field(list, "head");
  assert.equal(head.kind, "pointer");
  assert.match(head.pointsTo ?? "", /^h\d+$/);
});

test("the constructor runs when the object is declared", () => {
  const t = trace(LIST);
  const afterDecl = t.steps.find((s) => s.sourceLine === 24 && s.kind === "statement")!;
  assert.equal(field(variable(afterDecl, "list"), "head").value, "nullptr");
});

test("methods defined outside the class with Class::name", () => {
  const t = trace(`class Counter {
    int n;
public:
    Counter();
    void add(int by);
    int get();
};
Counter::Counter() { n = 0; }
void Counter::add(int by) { n += by; }
int Counter::get() { return n; }
int main() { Counter c; c.add(4); c.add(5); cout << c.get(); return 0; }`);
  assert.equal(t.output, "9");
});

const DTOR = `struct Node { int data; Node* next; Node(int d) : data(d), next(nullptr) {} };
class LinkedList {
    Node* head;
public:
    LinkedList() : head(nullptr) {}
    ~LinkedList() {
        Node* cur = head;
        while (cur != nullptr) {
            Node* nxt = cur->next;
            delete cur;
            cur = nxt;
        }
    }
    void add(int v) { Node* n = new Node(v); n->next = head; head = n; }
};
int main() {
    LinkedList list;
    list.add(1);
    list.add(2);
    list.add(3);
    return 0;
}`;

test("the destructor of a stack object runs when main ends, one step per delete", () => {
  const t = trace(DTOR);
  const deletes = t.steps.filter((s) => s.sourceLine === 10 && s.activeFunction === "LinkedList::~LinkedList");
  assert.equal(deletes.length, 3);
  assert.deepEqual(deletes.map((s) => s.heap.length), [2, 1, 0]);
  assert.equal(last(t).kind, "end");
  assert.match(last(t).explanation, /Every object created with new was deleted/);
});

test("delete p runs ~Node() before the memory is released", () => {
  const t = trace(`struct Node { int data; Node(int d) : data(d) {} ~Node() { cout << "bye " << data << endl; } };
int main() { Node* p = new Node(7); delete p; return 0; }`);
  assert.equal(t.output, "bye 7\n");
  assert.ok(t.steps.some((s) => s.activeFunction === "Node::~Node"));
  assert.equal(lastLive(t).heap.length, 0);
});

test("the end step reports objects that were never deleted", () => {
  const t = trace(LIST);
  assert.match(last(t).explanation, /2 objects created with new were never deleted/);
  assert.ok(last(t).heap.every((h) => h.orphaned));
});
