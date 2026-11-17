// Guided lessons. Each lesson is a JSON file that is loaded only when the
// student opens it. The format is the Lesson type in src/core/learn.
import type { Lesson } from "@/core/learn";

export interface LessonEntry {
  id: string;
  title: string;
  summary: string;
  load: () => Promise<Lesson>;
}

export const LESSONS: LessonEntry[] = [
  { id: "walk-a-list", title: "Walk a list", summary: "Build three nodes and follow next from head to NULL.", load: () => import("./walk-a-list.json").then((m) => m.default as Lesson) },
  { id: "insert-at-front", title: "Insert at the front", summary: "Why the new node is linked first and head is moved second.", load: () => import("./insert-at-front.json").then((m) => m.default as Lesson) },
  { id: "delete-safely", title: "Delete a node safely", summary: "Keep a pointer to the node, unlink it, then delete it.", load: () => import("./delete-safely.json").then((m) => m.default as Lesson) },
  { id: "reverse-a-list", title: "Reverse a list", summary: "Three pointers flip one arrow per round.", load: () => import("./reverse-a-list.json").then((m) => m.default as Lesson) },
];
