// Guided lessons. Each lesson is a JSON file that is loaded only when the
// student opens it. The format is the Lesson type in src/core/learn.
import type { Lesson } from "@/core/learn";

/** Learn is grouped by topic, in the order of the course outline, not by lab number. */
export type LessonTopic = "sorting" | "lists" | "doubly" | "stacks" | "queues" | "bst" | "avl" | "heaps";

export interface LessonEntry {
  id: string;
  topic: LessonTopic;
  title: string;
  summary: string;
  load: () => Promise<Lesson>;
}

export const LESSONS: LessonEntry[] = [
  { id: "counting-steps", topic: "sorting", title: "Counting steps: best, worst and Big-O", summary: "Count what an algorithm does as the input grows. Big-O is the worst case, Big-Omega the best case.", load: () => import("./counting-steps.json").then((m) => m.default as Lesson) },
  { id: "bubble-sort", topic: "sorting", title: "Bubble sort", summary: "Compare neighbours and swap them if they are in the wrong order. The largest value bubbles to the end.", load: () => import("./bubble-sort.json").then((m) => m.default as Lesson) },
  { id: "selection-sort", topic: "sorting", title: "Selection sort", summary: "Find the smallest value that is left, and swap it into the next place.", load: () => import("./selection-sort.json").then((m) => m.default as Lesson) },
  { id: "merge-sort", topic: "sorting", title: "Merge sort", summary: "Split the array in half until each part has one value, then merge the sorted halves back together.", load: () => import("./merge-sort.json").then((m) => m.default as Lesson) },
  { id: "quick-sort", topic: "sorting", title: "Quick sort", summary: "Pick a pivot, move smaller values to its left and larger ones to its right, then sort each side.", load: () => import("./quick-sort.json").then((m) => m.default as Lesson) },
  { id: "walk-a-list", topic: "lists", title: "Walk a list", summary: "Build three nodes and follow next from head to NULL.", load: () => import("./walk-a-list.json").then((m) => m.default as Lesson) },
  { id: "insert-at-front", topic: "lists", title: "Insert at the front", summary: "Why the new node is linked first and head is moved second.", load: () => import("./insert-at-front.json").then((m) => m.default as Lesson) },
  { id: "append-at-end", topic: "lists", title: "Append at the end", summary: "Walk to the last node, then hang the new one on it. Why this costs O(n).", load: () => import("./append-at-end.json").then((m) => m.default as Lesson) },
  { id: "search-a-list", topic: "lists", title: "Search a list", summary: "There is no index to jump to: check one node at a time from head.", load: () => import("./search-a-list.json").then((m) => m.default as Lesson) },
  { id: "sorted-insert", topic: "lists", title: "Insert into a sorted list", summary: "Find the node just before the new value, then link two pointers in the right order.", load: () => import("./sorted-insert.json").then((m) => m.default as Lesson) },
  { id: "delete-safely", topic: "lists", title: "Delete a node safely", summary: "Keep a pointer to the node, unlink it, then delete it.", load: () => import("./delete-safely.json").then((m) => m.default as Lesson) },
  { id: "reverse-a-list", topic: "lists", title: "Reverse a list", summary: "Three pointers flip one arrow per round.", load: () => import("./reverse-a-list.json").then((m) => m.default as Lesson) },
  { id: "array-list", topic: "lists", title: "A list in an array", summary: "Inserting in the middle of an array means shifting everything after it. Compare that with a linked list.", load: () => import("./array-list.json").then((m) => m.default as Lesson) },
  { id: "doubly-links", topic: "doubly", title: "Two arrows per node", summary: "A doubly linked list keeps next and prev, so it can be walked both ways.", load: () => import("./doubly-links.json").then((m) => m.default as Lesson) },
  { id: "doubly-insert-after", topic: "doubly", title: "Insert after a node", summary: "Four pointers change. The two on the new node go first, so nothing is lost.", load: () => import("./doubly-insert-after.json").then((m) => m.default as Lesson) },
  { id: "doubly-delete", topic: "doubly", title: "Delete using prev", summary: "The node already knows its neighbour on each side, so no search is needed.", load: () => import("./doubly-delete.json").then((m) => m.default as Lesson) },
  { id: "doubly-reverse", topic: "doubly", title: "Reverse a doubly linked list", summary: "Swap next and prev in every node, then move head to the old last node.", load: () => import("./doubly-reverse.json").then((m) => m.default as Lesson) },
  { id: "circular-list", topic: "doubly", title: "Circular lists: where the loop stops", summary: "The last node points back at the first. Loops stop when they get back to head, not at NULL.", load: () => import("./circular-list.json").then((m) => m.default as Lesson) },
  { id: "linked-stack", topic: "stacks", title: "Push and pop on a linked stack", summary: "Last in, first out. Both operations touch only the top node, so both are O(1).", load: () => import("./linked-stack.json").then((m) => m.default as Lesson) },
  { id: "array-stack", topic: "stacks", title: "A stack in an array", summary: "One int, top, says where the top of the stack is. Push moves it up, pop moves it down.", load: () => import("./array-stack.json").then((m) => m.default as Lesson) },
  { id: "call-stack", topic: "stacks", title: "Recursion and the call stack", summary: "Every call gets its own frame on a stack. Watch the frames pile up and come off in reverse.", load: () => import("./call-stack.json").then((m) => m.default as Lesson) },
  { id: "stack-reverse-word", topic: "stacks", title: "A stack turns things around", summary: "Push the letters of a word, pop them off, and they come out reversed.", load: () => import("./stack-reverse-word.json").then((m) => m.default as Lesson) },
  { id: "postfix-evaluation", topic: "stacks", title: "Using a stack: evaluate a postfix expression", summary: "In 2 3 * 5 4 * +, each operator works on the last two numbers. A stack keeps them in the right order.", load: () => import("./postfix-evaluation.json").then((m) => m.default as Lesson) },
  { id: "linked-queue", topic: "queues", title: "A linked queue: front and rear", summary: "Add at the rear, remove from the front. Two pointers keep both O(1).", load: () => import("./linked-queue.json").then((m) => m.default as Lesson) },
  { id: "circular-queue", topic: "queues", title: "A circular queue in an array", summary: "front and rear chase each other around the array. The % operator wraps them back to cell 0.", load: () => import("./circular-queue.json").then((m) => m.default as Lesson) },
  { id: "round-robin", topic: "queues", title: "Using a queue: taking turns", summary: "Three programs share one CPU. Each runs for 2 time units, then goes to the back of the queue.", load: () => import("./round-robin.json").then((m) => m.default as Lesson) },
  { id: "level-order", topic: "queues", title: "Level-order traversal with a queue", summary: "Visit a tree level by level. A queue remembers which nodes are waiting.", load: () => import("./level-order.json").then((m) => m.default as Lesson) },
  { id: "tree-words", topic: "bst", title: "Root, leaf, height, depth", summary: "The words every tree question uses, measured on a real tree.", load: () => import("./tree-words.json").then((m) => m.default as Lesson) },
  { id: "build-a-bst", topic: "bst", title: "Build a binary search tree", summary: "Each new value walks down from the root: left if smaller, right if larger.", load: () => import("./build-a-bst.json").then((m) => m.default as Lesson) },
  { id: "search-a-bst", topic: "bst", title: "Search a binary search tree", summary: "Why a search looks at one path from the root instead of every node.", load: () => import("./search-a-bst.json").then((m) => m.default as Lesson) },
  { id: "inorder-traversal", topic: "bst", title: "In-order traversal", summary: "Left, node, right: recursion visits a tree in sorted order.", load: () => import("./inorder-traversal.json").then((m) => m.default as Lesson) },
  { id: "traversal-orders", topic: "bst", title: "Pre-order and post-order", summary: "The same recursion, with the visit moved before or after the children.", load: () => import("./traversal-orders.json").then((m) => m.default as Lesson) },
  { id: "sorted-chain", topic: "bst", title: "Sorted input makes a chain", summary: "The same five values, inserted in two orders, give two very different trees.", load: () => import("./sorted-chain.json").then((m) => m.default as Lesson) },
  { id: "min-max-successor", topic: "bst", title: "Smallest, largest and the next value", summary: "Go left as far as you can for the minimum, right for the maximum. The successor is the next value in sorted order.", load: () => import("./min-max-successor.json").then((m) => m.default as Lesson) },
  { id: "bst-delete-cases", topic: "bst", title: "Deleting from a BST: three cases", summary: "A leaf, a node with one child, and a node with two children, each done by hand on one tree.", load: () => import("./bst-delete-cases.json").then((m) => m.default as Lesson) },
  { id: "balance-factor", topic: "avl", title: "Balance factor", summary: "Left height minus right height, at every node. Anything outside -1 to +1 needs a rotation.", load: () => import("./balance-factor.json").then((m) => m.default as Lesson) },
  { id: "avl-rotation", topic: "avl", title: "AVL rotation", summary: "Inserting 10, 20, 30 makes a chain; one rotation turns it back into a tree.", load: () => import("./avl-rotation.json").then((m) => m.default as Lesson) },
  { id: "double-rotation", topic: "avl", title: "Double rotation: left-right", summary: "When the extra height is on the inside, one rotation is not enough. Two rotations fix it.", load: () => import("./double-rotation.json").then((m) => m.default as Lesson) },
  { id: "avl-delete-rebalance", topic: "avl", title: "Delete, then rebalance", summary: "Removing a node can make an ancestor lopsided. Check the balance and rotate, done by hand.", load: () => import("./avl-delete-rebalance.json").then((m) => m.default as Lesson) },
  { id: "complete-binary-tree", topic: "heaps", title: "A tree stored in an array", summary: "A complete binary tree needs no pointers: the children of cell i are cells 2i+1 and 2i+2.", load: () => import("./complete-binary-tree.json").then((m) => m.default as Lesson) },
  { id: "heap-insert", topic: "heaps", title: "Insert into a max-heap", summary: "Add the new value at the end, then swap it upwards while it is larger than its parent.", load: () => import("./heap-insert.json").then((m) => m.default as Lesson) },
  { id: "heap-remove-max", topic: "heaps", title: "A priority queue: remove the largest", summary: "Take the root, move the last value to the top, then swap it down below its larger child.", load: () => import("./heap-remove-max.json").then((m) => m.default as Lesson) },
];
