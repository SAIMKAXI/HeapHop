// The Learn page: a hero with Byte pointing at the heading, the nine topics as a 3x3 grid of
// cards (each opens its topic page, /learn/<slug>), and a row for the Editor and the references.
import { ArrowRight, BookOpen, SquareTerminal } from "lucide-react";
import { EXAMPLES } from "@content/examples";
import { LESSONS } from "@content/lessons";
import { TopicArt, TopicIcon } from "./topic-art";
import { TOPICS, examplesOf, lessonsOf } from "./topics";

export const learnCard = "group relative flex flex-col overflow-hidden rounded-2xl border-2 border-card-border bg-card p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-accent/70 hover:shadow-[0_0_28px_-8px_var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const iconTile = "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent";
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function LearnHome() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:py-12">
      <section data-learn-hero className="grid items-center gap-6 lg:grid-cols-[1fr_auto]">
        <div data-reveal-children>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Learn C++ <span className="text-accent">visually.</span></h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Pick a topic, run real programs, and watch memory change one line at a time. Lessons stop at the moments that
            matter and ask you to predict what happens next.
          </p>
          <span className="mt-5 block h-1 w-16 rounded-full bg-accent" aria-hidden />
          <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground" data-learn-stats>
            <span><b className="text-foreground">{LESSONS.length}</b> lessons</span>
            <span><b className="text-foreground">{TOPICS.length}</b> topics</span>
            <span><b className="text-foreground">{EXAMPLES.length}</b> example programs</span>
          </p>
        </div>
        <div className="relative mx-auto hidden h-64 w-56 sm:block lg:h-72 lg:w-64" aria-hidden data-reveal>
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_65%)]" />
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, pre-sized image */}
          <img src="/media/byte-point.webp" alt="" width={463} height={790} data-byte-point className="relative h-full w-full object-contain drop-shadow-[0_18px_24px_rgba(0,0,0,0.35)]" />
        </div>
      </section>

      <h2 className="sr-only">Topics</h2>
      <ul data-reveal-children className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-topic-grid>
        {TOPICS.map((t) => {
          const lessons = lessonsOf(t).length;
          const programs = examplesOf(t).reduce((n, g) => n + g.examples.length, 0);
          return (
            <li key={t.slug} className="flex">
              <a href={`/learn/${t.slug}`} data-topic-card={t.topic} className={`${learnCard} flex-1`}>
                <div className="flex items-start justify-between gap-3">
                  <span className={iconTile}><TopicIcon topic={t.topic} /></span>
                  <TopicArt topic={t.topic} className="h-14 w-24 shrink-0 opacity-90 transition-opacity group-hover:opacity-100" />
                </div>
                <span className="mt-4 text-lg font-bold">{t.title}</span>
                <span className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{t.short}</span>
                <span className="mt-5 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">{plural(lessons, "lesson")}{programs ? ` · ${plural(programs, "program")}` : ""}</span>
                  <span className="flex items-center gap-1 font-semibold text-accent">
                    Explore topic <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>

      <div data-reveal-children className="mt-5 grid gap-5 md:grid-cols-2">
        <section className={`${learnCard} sm:flex-row sm:items-center sm:gap-5 hover:translate-y-0`} data-learn-practice>
          <span className={iconTile}><SquareTerminal size={20} aria-hidden /></span>
          <div className="mt-3 flex-1 sm:mt-0">
            <h2 className="text-lg font-bold">Practice &amp; build</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Write your own C++ and step through it the same way.</p>
          </div>
          <a href="/editor" className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full border-2 border-accent/60 px-4 py-1.5 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-background sm:mt-0 sm:self-center">
            Open the Editor <ArrowRight size={14} aria-hidden />
          </a>
        </section>
        <section className={`${learnCard} sm:flex-row sm:items-center sm:gap-5 hover:translate-y-0`} data-learn-references>
          <span className={iconTile}><BookOpen size={20} aria-hidden /></span>
          <div className="mt-3 flex-1 sm:mt-0">
            <h2 className="text-lg font-bold">Quick references</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Which C++ HeapHop runs, and answers to common questions.</p>
          </div>
          <span className="mt-4 flex gap-2 sm:mt-0">
            <a href="/supported" className="rounded-full border-2 border-card-border px-3.5 py-1.5 text-sm font-semibold transition-colors hover:border-accent hover:text-accent">Supported C++</a>
            <a href="/faq" className="rounded-full border-2 border-card-border px-3.5 py-1.5 text-sm font-semibold transition-colors hover:border-accent hover:text-accent">FAQ</a>
          </span>
        </section>
      </div>
    </div>
  );
}
