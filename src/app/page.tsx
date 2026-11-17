// The landing page: what HeapHop is, a live demo, and the two ways in (Learn, Editor).
import type { ReactNode } from "react";
import { ArrowRight, CodeXml, GraduationCap, ListTree, MessageSquareText, MousePointerClick, ShieldCheck, TriangleAlert, Undo2 } from "lucide-react";
import { PageFrame } from "@/ui/site/page-frame";
import { LiveDemoPlayer } from "./live-demo-player";

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <Undo2 size={18} />, title: "Steps both ways", text: "The whole run is recorded first, so going back a step is as reliable as going forward." },
  { icon: <MessageSquareText size={18} />, title: "Explains every step", text: "Plain sentences built from what your program actually did, like “cur moves along next to Node #2”." },
  { icon: <TriangleAlert size={18} />, title: "Catches pointer mistakes", text: "A null pointer, a use after delete or a memory leak stops at its line, with an explanation." },
  { icon: <ListTree size={18} />, title: "Lists and trees, drawn properly", text: "Singly, doubly and circular lists in one row, binary trees as trees, with head and cur on their nodes." },
  { icon: <MousePointerClick size={18} />, title: "Inspect anything", text: "Click a node, a pointer or a line of code to see its history and jump to any moment in it." },
  { icon: <ShieldCheck size={18} />, title: "Runs in your browser", text: "Your code never leaves your computer. No account, no install." },
];

const WAYS = [
  {
    href: "/learn", icon: <GraduationCap size={22} />, title: "Learn", cta: "Start learning",
    text: "Guided lessons on linked lists and binary trees. The program pauses at the moments that matter and asks you to predict the next step.",
  },
  {
    href: "/editor", icon: <CodeXml size={22} />, title: "Editor", cta: "Open the editor",
    text: "Write or paste your own lab program, give it input, and step through it forwards and backwards.",
  },
];

export default function LandingPage() {
  return (
    <PageFrame current="home">
      <section className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">See what your C++ does to memory</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            HeapHop runs your linked-list and tree programs one statement at a time and draws the stack, the heap and
            every pointer as they change.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="/learn" data-cta="learn" className="flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg shadow-accent/20 transition-colors hover:bg-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Start learning <ArrowRight size={16} aria-hidden />
            </a>
            <a href="/editor" data-cta="editor" className="flex items-center gap-2 rounded-xl border-2 border-card-border px-5 py-3 text-sm font-bold transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Open the editor
            </a>
          </div>
        </div>
        <div className="mt-12"><LiveDemoPlayer /></div>
      </section>

      <section className="border-y-2 border-card-border bg-card/50">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-2xl font-bold tracking-tight">Two ways to use HeapHop</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {WAYS.map((w) => (
              <a key={w.href} href={w.href} className="group flex flex-col rounded-2xl border-2 border-card-border bg-card p-6 transition-colors hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent" aria-hidden>{w.icon}</span>
                <span className="mt-4 text-xl font-bold">{w.title}</span>
                <span className="mt-2 flex-1 leading-relaxed text-muted-foreground">{w.text}</span>
                <span className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-accent">
                  {w.cta} <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-2xl font-bold tracking-tight">What it does</h2>
        <ul className="mt-6 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex gap-3">
              <span className="mt-0.5 shrink-0 text-accent" aria-hidden>{f.icon}</span>
              <span>
                <span className="block font-semibold">{f.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{f.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-sm text-muted-foreground">
          HeapHop runs a part of C++ chosen from real first-course lab programs.{" "}
          <a href="/supported" className="font-semibold text-accent underline-offset-4 hover:underline">See what C++ is supported</a>.
        </p>
      </section>
    </PageFrame>
  );
}
