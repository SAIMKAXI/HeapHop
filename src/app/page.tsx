// The landing page: the slogan with Byte beside it, a live demo, and the two ways in (Learn, Editor).
import type { ReactNode } from "react";
import { ArrowRight, CodeXml, GraduationCap, ListTree, MessageSquareText, MousePointerClick, ShieldCheck, TriangleAlert, Undo2 } from "lucide-react";
import { PageFrame } from "@/ui/site/page-frame";
import { ByteHero } from "@/ui/landing/byte-hero";
import { LiveDemoPlayer } from "./live-demo-player";

// One punchy line each, with a short sentence to back it up.
const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <Undo2 size={22} />, title: "Rewind anything.", text: "The whole run is recorded first, so a step back is as exact as a step forward." },
  { icon: <MessageSquareText size={22} />, title: "Read it in plain English.", text: "Every step explained from what your program actually did." },
  { icon: <TriangleAlert size={22} />, title: "Catch the crash.", text: "Null pointers, use after delete and leaks stop at their line, with the reason." },
  { icon: <ListTree size={22} />, title: "Trees that look like trees.", text: "Lists in a row, binary trees with real branches, head and cur on their nodes." },
  { icon: <MousePointerClick size={22} />, title: "Click to investigate.", text: "Any node, pointer or line of code shows its history. Jump to any moment in it." },
  { icon: <ShieldCheck size={22} />, title: "Nothing leaves your browser.", text: "No account, no install, no upload." },
];

const WAYS = [
  {
    href: "/learn", icon: <GraduationCap size={22} />, title: "Learn", cta: "Start learning",
    text: "Guided lessons on sorting, linked lists, stacks, queues, trees, heaps and graphs. The program pauses at the moments that matter and asks you to predict the next step.",
  },
  {
    href: "/editor", icon: <CodeXml size={22} />, title: "Editor", cta: "Open the editor",
    text: "Write or paste your own lab program, give it input, and step through it forwards and backwards.",
  },
];

export default function LandingPage() {
  return (
    <PageFrame current="home">
      <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[auto_1fr]">
          <div className="text-center lg:text-left">
            <p className="inline-flex rounded-full border border-card-border bg-card px-4 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
              C++ memory visualizer · linked lists and trees · free
            </p>
            <h1 className="mt-6 text-6xl font-black leading-[0.95] tracking-tighter sm:text-7xl lg:text-8xl">
              Hop through <span className="block text-accent">the heap.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl lg:mx-0">
              Step forward, step back, and watch every pointer move.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <a href="/learn" data-cta="learn" className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-bold text-on-accent shadow-lg shadow-accent/20 transition-colors hover:bg-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                Start learning <ArrowRight size={16} aria-hidden />
              </a>
              <a href="/editor" data-cta="editor" className="flex items-center gap-2 rounded-full border border-card-border bg-card px-6 py-3 text-sm font-bold transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                Open the editor
              </a>
            </div>
          </div>
          <ByteHero />
        </div>
        <div className="mx-auto mt-12 max-w-5xl"><LiveDemoPlayer /></div>
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
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Pointers, finally visible.</h2>
        <ul className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent" aria-hidden>{f.icon}</span>
              <span className="mt-4 block text-2xl font-bold tracking-tight">{f.title}</span>
              <span className="mt-2 block leading-relaxed text-muted-foreground">{f.text}</span>
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
