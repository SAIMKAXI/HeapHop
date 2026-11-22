// The nine Learn topics: their page address (/learn/<slug>), the text on their card and page,
// and which lessons and example programs each page shows. Every lesson and every example
// belongs to exactly one topic (tests/ui/learn-topics.test.ts).
import { EXAMPLES, GROUP_TITLES, type Example } from "@content/examples";
import { LESSONS, type LessonEntry, type LessonTopic } from "@content/lessons";

export interface Topic {
  topic: LessonTopic;
  slug: string;
  title: string;
  /** One line for the card on the Learn page. */
  short: string;
  /** A sentence or two for the topic page. */
  intro: string;
}

export const TOPICS: Topic[] = [
  { topic: "sorting", slug: "sorting", title: "Sorting & Big-O", short: "Count the steps, then watch four sorts rearrange the same cells.", intro: "Count the steps an algorithm takes as the input grows, then watch bubble, selection, merge and quick sort rearrange the same array, one comparison at a time." },
  { topic: "lists", slug: "linked-lists", title: "Linked lists", short: "Nodes, next pointers, and why the order of two lines matters.", intro: "Build nodes with new, follow next from head to NULL, and see why linking the new node first and moving head second is the only safe order." },
  { topic: "doubly", slug: "doubly-linked-lists", title: "Doubly & circular lists", short: "Two arrows per node, and lists that loop back to the start.", intro: "Keep next and prev in every node so the list can be walked both ways, and close the loop so the last node points back to the first." },
  { topic: "stacks", slug: "stacks", title: "Stacks", short: "Last in, first out: push, pop, and the call stack behind recursion.", intro: "Push and pop at the top of an array or a list, and watch the call stack grow and shrink as a recursive function runs." },
  { topic: "queues", slug: "queues", title: "Queues", short: "First in, first out: add at the back, remove from the front.", intro: "Add at the back and remove from the front, in a circular array and in a linked list, then use a queue to visit a tree level by level." },
  { topic: "bst", slug: "binary-search-trees", title: "Binary search trees", short: "Smaller left, larger right: search, traverse and delete.", intro: "Smaller values to the left, larger to the right: build a tree, search it, walk it in order, and delete a node with two children." },
  { topic: "avl", slug: "avl-trees", title: "AVL trees", short: "Balance factors and the rotations that keep a tree short.", intro: "Work out each node's balance factor and watch the single and double rotations that keep a search tree short after every insert and delete." },
  { topic: "heaps", slug: "heaps", title: "Heaps & priority queues", short: "A complete tree in an array, with the largest value on top.", intro: "A complete binary tree stored in an array: insert by sifting up, remove the top by sifting down, and use it as a priority queue." },
  { topic: "graphs", slug: "graphs", title: "Graphs", short: "Adjacency lists, BFS and DFS, shortest paths and spanning trees.", intro: "Store a graph as a matrix or adjacency lists, search it wide and deep, and find shortest paths and minimum spanning trees step by step." },
];

const BY_SLUG = new Map(TOPICS.map((t) => [t.slug, t]));
export const topicBySlug = (slug: string): Topic | undefined => BY_SLUG.get(slug);

export const lessonsOf = (t: Topic): LessonEntry[] => LESSONS.filter((l) => l.topic === t.topic);

/** Example programs shown on a topic page, in groups with a heading each. */
const DOUBLY_EXAMPLES = new Set(["doubly", "circular"]);
export function examplesOf(t: Topic): { title: string; examples: Example[] }[] {
  const heading = (g: Example["group"]) => (g === "lists" ? (t.topic === "doubly" ? "Doubly and circular lists" : "List operations") : GROUP_TITLES[g]);
  const groups = (pick: (e: Example) => boolean, titles: Example["group"][]) =>
    titles.map((g) => ({ title: heading(g), examples: EXAMPLES.filter((e) => e.group === g && pick(e)) })).filter((g) => g.examples.length > 0);
  if (t.topic === "lists") return groups((e) => !DOUBLY_EXAMPLES.has(e.id), ["lists", "mistakes", "pointers"]);
  if (t.topic === "doubly") return groups((e) => DOUBLY_EXAMPLES.has(e.id), ["lists"]);
  return [];
}
