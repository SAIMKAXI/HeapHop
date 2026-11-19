"use client";

// The list of everything in Learn: guided lessons by topic, then ready-made programs to
// step through. Each entry is a real link, so it can be opened in a new tab or shared.
import type { MouseEvent, ReactNode } from "react";
import { ArrowDownWideNarrow, ArrowLeftRight, ArrowRight, ArrowRightToLine, Layers, Link2, ListTree, Network, Play, Scale, Triangle } from "lucide-react";
import { EXAMPLES, GROUP_TITLES, type Example } from "@content/examples";
import { LESSONS, type LessonTopic } from "@content/lessons";
import { hrefOf, openPick, type Pick } from "./address";

const TOPICS: { topic: LessonTopic; title: string; intro: string; icon: ReactNode }[] = [
  { topic: "sorting", title: "Sorting and complexity", intro: "Count the steps an algorithm takes, then watch four sorts rearrange the same cells.", icon: <ArrowDownWideNarrow size={18} aria-hidden /> },
  { topic: "lists", title: "Linked lists", intro: "Nodes, next pointers, and why the order of two lines matters.", icon: <Link2 size={18} aria-hidden /> },
  { topic: "doubly", title: "Doubly and circular lists", intro: "Two arrows per node, and lists that loop back to the start.", icon: <ArrowLeftRight size={18} aria-hidden /> },
  { topic: "stacks", title: "Stacks", intro: "Last in, first out: push and pop at the top, and the call stack behind recursion.", icon: <Layers size={18} aria-hidden /> },
  { topic: "queues", title: "Queues", intro: "First in, first out: add at the rear, remove from the front.", icon: <ArrowRightToLine size={18} aria-hidden /> },
  { topic: "bst", title: "Binary search trees", intro: "Smaller to the left, larger to the right: searching, traversing and deleting.", icon: <ListTree size={18} aria-hidden /> },
  { topic: "avl", title: "AVL trees", intro: "Balance factors and the rotations that keep a search tree short.", icon: <Scale size={18} aria-hidden /> },
  { topic: "heaps", title: "Heaps and priority queues", intro: "A complete tree kept in an array, with the largest value always on top.", icon: <Triangle size={18} aria-hidden /> },
  { topic: "graphs", title: "Graphs", intro: "Matrices and adjacency lists, searching wide and deep, shortest paths and spanning trees.", icon: <Network size={18} aria-hidden /> },
];
const EXAMPLE_GROUPS: Example["group"][] = ["lists", "mistakes", "pointers"];

/** A link that opens a lesson or example in place; with a modifier key it acts like any link. */
function PickLink({ pick, className, children }: { pick: Pick; className: string; children: ReactNode }) {
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openPick(pick);
  };
  return <a href={hrefOf(pick)} onClick={onClick} {...{ [`data-${pick.kind}`]: pick.id }} className={className}>{children}</a>;
}

const card = "group flex flex-col rounded-xl border-2 border-card-border bg-card p-5 transition-colors hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function LearnHome() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
      <h1 className="text-3xl font-bold tracking-tight">Learn</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
        Each lesson runs a real C++ program and stops at the moments that matter. Some stops ask you to predict where a
        pointer will go before the line runs. Use the arrow keys or the timeline to move back and forth at any time.
      </p>

      {TOPICS.map(({ topic, title, intro, icon }) => (
        <section key={topic} data-topic={topic} className="mt-12">
          <h2 className="flex items-center gap-2 text-xl font-bold"><span className="text-accent">{icon}</span>{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
          <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LESSONS.filter((l) => l.topic === topic).map((l, i) => (
              <li key={l.id} className="flex">
                <PickLink pick={{ kind: "lesson", id: l.id }} className={`${card} flex-1`}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">{i + 1}</span>
                  <span className="mt-3 font-semibold">{l.title}</span>
                  <span className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{l.summary}</span>
                  <span className="mt-4 flex items-center gap-1 text-sm font-semibold text-accent">
                    Start lesson <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </PickLink>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="mt-16">
        <h2 className="flex items-center gap-2 text-xl font-bold"><Play size={18} className="text-accent" aria-hidden />Watch a program</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ready-made programs to step through at your own pace, without questions.</p>
        {EXAMPLE_GROUPS.map((group) => (
          <div key={group} className="mt-8">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{GROUP_TITLES[group]}</h3>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {EXAMPLES.filter((e) => e.group === group).map((e) => (
                <li key={e.id} className="flex">
                  <PickLink pick={{ kind: "example", id: e.id }} className={`${card} flex-1 p-4`}>
                    <span className="text-sm font-semibold">{e.title}</span>
                    <span className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{e.description}</span>
                  </PickLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
