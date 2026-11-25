// One Learn topic (/learn/<slug>): its lessons in order, then its example programs, and links
// to the topics before and after it. Lessons and examples open in place, like before.
import { ArrowLeft, ArrowRight, Play } from "lucide-react";
import { PickLink } from "./pick-link";
import { TopicArt, TopicIcon } from "./topic-art";
import { TOPICS, examplesOf, lessonsOf, type Topic } from "./topics";
import { iconTile, learnCard } from "./learn-home";

export function TopicPage({ topic }: { topic: Topic }) {
  const lessons = lessonsOf(topic);
  const groups = examplesOf(topic);
  const at = TOPICS.indexOf(topic);
  const prev = TOPICS[at - 1];
  const next = TOPICS[at + 1];
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:py-12" data-topic={topic.topic}>
      <a href="/learn" data-back-to-topics className="inline-flex min-h-10 items-center gap-1.5 text-sm lg:min-h-0 font-semibold text-muted-foreground hover:text-accent">
        <ArrowLeft size={14} aria-hidden /> All topics
      </a>
      <header data-reveal-children className="mt-5 flex flex-col gap-6 rounded-2xl border-2 border-card-border bg-card p-6 sm:flex-row sm:items-center">
        <div className="flex-1">
          <span className={iconTile}><TopicIcon topic={topic.topic} /></span>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">{topic.title}</h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">{topic.intro}</p>
        </div>
        <TopicArt topic={topic.topic} className="h-28 w-44 shrink-0 self-center" />
      </header>

      <section className="mt-10">
        <h2 className="text-xl font-bold">Lessons</h2>
        <p className="mt-1 text-sm text-muted-foreground">Guided, in order. Use the arrow keys or the timeline to move back and forth at any time.</p>
        <ol data-reveal-children className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lessons.map((l, i) => (
            <li key={l.id} className="flex">
              <PickLink pick={{ kind: "lesson", id: l.id }} className={`${learnCard} flex-1`}>
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

      {groups.length > 0 && (
        <section className="mt-14" data-topic-examples>
          <h2 className="flex items-center gap-2 text-xl font-bold"><Play size={18} className="text-accent" aria-hidden />Example programs</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ready-made programs to step through at your own pace, without questions.</p>
          {groups.map((g) => (
            <div key={g.title} className="mt-7">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{g.title}</h3>
              <ul data-reveal-children className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.examples.map((e) => (
                  <li key={e.id} className="flex">
                    <PickLink pick={{ kind: "example", id: e.id }} className={`${learnCard} flex-1 p-4`}>
                      <span className="text-sm font-semibold">{e.title}</span>
                      <span className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{e.description}</span>
                    </PickLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <nav aria-label="Other topics" className="mt-14 grid gap-4 sm:grid-cols-2" data-topic-nav>
        {prev ? (
          <a href={`/learn/${prev.slug}`} className={`${learnCard} flex-row items-center gap-3 p-4`}>
            <ArrowLeft size={16} className="text-accent" aria-hidden />
            <span><span className="block text-xs text-muted">Previous topic</span><span className="font-semibold">{prev.title}</span></span>
          </a>
        ) : <span />}
        {next && (
          <a href={`/learn/${next.slug}`} className={`${learnCard} flex-row items-center justify-end gap-3 p-4 text-right`}>
            <span><span className="block text-xs text-muted">Next topic</span><span className="font-semibold">{next.title}</span></span>
            <ArrowRight size={16} className="text-accent" aria-hidden />
          </a>
        )}
      </nav>
    </div>
  );
}
