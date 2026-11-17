// Renders explanation text. Parts wrapped in `backticks` are shown as code.
import { Fragment } from "react";

export function RichText({ text }: { text: string }) {
  const parts = text.split("`");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-foreground/10 px-1 py-px font-mono text-[0.92em]">{part}</code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

export const TONE_TEXT = { info: "text-foreground", good: "text-success", warn: "text-warning", danger: "text-danger" } as const;
