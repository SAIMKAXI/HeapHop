// A strip of C++ memory words that rolls sideways forever under the features heading:
// new, head->next, delete, nullptr... in the code font, at the size of a section heading.
//
// It pauses while the mouse is over it, and while it has keyboard focus (it is one Tab stop),
// so moving text can always be stopped without a mouse. Screen readers get the list once
// from its label; the two moving copies are hidden from them. With reduced motion it
// stands still.

export const TICKER_WORDS = ["new", "head->next", "delete", "nullptr", "stack", "heap", "cur = cur->next", "leak"];

export function CodeTicker({ words = TICKER_WORDS }: { words?: string[] }) {
  const copy = (key: number) => (
    <span key={key} aria-hidden className="flex shrink-0 items-center">
      {words.map((w) => (
        <span key={w} className="flex items-center">
          <span>{w}</span>
          <span className="px-5 text-lg text-accent/60 sm:px-8 sm:text-xl">✦</span>
        </span>
      ))}
    </span>
  );
  return (
    <div
      data-marquee
      role="marquee"
      tabIndex={0}
      aria-label={`C++ words: ${words.join(", ")}`}
      className="hh-marquee py-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <div className="hh-marquee-track whitespace-nowrap text-2xl font-semibold text-foreground/85 sm:text-3xl">
        {copy(0)}{copy(1)}
      </div>
    </div>
  );
}
