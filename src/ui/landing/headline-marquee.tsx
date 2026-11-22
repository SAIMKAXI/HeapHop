"use client";

// The landing page's section headline as a strip that rolls sideways forever: the headline,
// then each feature title, separated by a star. Hovering pauses it, and so does the small
// button under it (moving text must be stoppable from the keyboard too).
//
// Screen readers get the headline once, as a normal heading; the strip itself is hidden
// from them. With reduced motion the strip is not shown and the heading is shown instead.
import { useState } from "react";
import { Pause, Play } from "lucide-react";

export function HeadlineMarquee({ headline, items }: { headline: string; items: string[] }) {
  const [paused, setPaused] = useState(false);
  const words = [headline, ...items];
  const copy = (key: number) => (
    <span key={key} className="flex shrink-0 items-center">
      {words.map((w, i) => (
        <span key={i} className="flex items-center">
          <span className={i === 0 ? "text-accent" : undefined}>{w}</span>
          <span className="px-6 text-2xl text-accent/60 sm:px-10 sm:text-3xl">✦</span>
        </span>
      ))}
    </span>
  );
  return (
    <div data-reveal>
      <h2 className="mx-auto max-w-6xl px-5 text-3xl font-black tracking-tight motion-safe:sr-only sm:text-4xl">{headline}</h2>
      <div data-marquee aria-hidden data-paused={paused || undefined} className="hh-marquee py-3 motion-reduce:hidden">
        <div className="hh-marquee-track whitespace-nowrap text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
          {copy(0)}{copy(1)}
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl justify-end px-5 motion-reduce:hidden">
        <button
          type="button"
          data-marquee-toggle
          aria-label={paused ? "Play the rolling headline" : "Pause the rolling headline"}
          onClick={() => setPaused((p) => !p)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          {paused ? <Play size={12} aria-hidden /> : <Pause size={12} aria-hidden />}
          {paused ? "Play" : "Pause"}
        </button>
      </div>
    </div>
  );
}
