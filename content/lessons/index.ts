// Guided lessons. Each lesson is a JSON file that is loaded only when the
// student opens it. The format is the Lesson type in src/core/learn.
import type { Lesson } from "@/core/learn";

export interface LessonEntry {
  id: string;
  topic: "lists" | "trees";
  title: string;
  summary: string;
  load: () => Promise<Lesson>;
}

export const LESSONS: LessonEntry[] = [
  { id: "walk-a-list", topic: "lists", title: "Walk a list", summary: "Build three nodes and follow next from head to NULL.", load: () => import("./walk-a-list.json").then((m) => m.default as Lesson) },
  { id: "insert-at-front", topic: "lists", title: "Insert at the front", summary: "Why the new node is linked first and head is moved second.", load: () => import("./insert-at-front.json").then((m) => m.default as Lesson) },
  { id: "delete-safely", topic: "lists", title: "Delete a node safely", summary: "Keep a pointer to the node, unlink it, then delete it.", load: () => import("./delete-safely.json").then((m) => m.default as Lesson) },
  { id: "reverse-a-list", topic: "lists", title: "Reverse a list", summary: "Three pointers flip one arrow per round.", load: () => import("./reverse-a-list.json").then((m) => m.default as Lesson) },
  { id: "build-a-bst", topic: "trees", title: "Build a binary search tree", summary: "Each new value walks down from the root: left if smaller, right if larger.", load: () => import("./build-a-bst.json").then((m) => m.default as Lesson) },
  { id: "search-a-bst", topic: "trees", title: "Search a binary search tree", summary: "Why a search looks at one path from the root instead of every node.", load: () => import("./search-a-bst.json").then((m) => m.default as Lesson) },
  { id: "inorder-traversal", topic: "trees", title: "In-order traversal", summary: "Left, node, right: recursion visits a tree in sorted order.", load: () => import("./inorder-traversal.json").then((m) => m.default as Lesson) },
  { id: "avl-rotation", topic: "trees", title: "AVL rotation", summary: "Inserting 10, 20, 30 makes a chain; one rotation turns it back into a tree.", load: () => import("./avl-rotation.json").then((m) => m.default as Lesson) },
];
