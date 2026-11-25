"use client";

// The code box: a transparent <textarea> over a coloured copy of the same text, with
// line numbers. Key rules come from text-edits.ts; the cursor is placed after React has
// written the new text, so fast typing never lands in the wrong place.
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { editForKey } from "./text-edits";
import { SyntaxView } from "./syntax-view";

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
}

const TEXT = "py-6 pl-3 pr-6 font-mono text-[0.875rem] leading-relaxed";

export function CodeInput({ value, onChange }: CodeInputProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const colourRef = useRef<HTMLPreElement>(null);
  const caretRef = useRef<number | null>(null);
  const lineCount = value.split("\n").length;

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (area && caretRef.current !== null) {
      area.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  }, [value]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const area = e.currentTarget;
    const edit = editForKey({ value: area.value, start: area.selectionStart, end: area.selectionEnd }, e.key, e.shiftKey);
    if (!edit) return;
    e.preventDefault();
    if (edit.value === area.value) area.setSelectionRange(edit.caret, edit.caret);
    else { caretRef.current = edit.caret; onChange(edit.value); }
  }

  function syncScroll() {
    const area = areaRef.current;
    if (!area) return;
    if (gutterRef.current) gutterRef.current.scrollTop = area.scrollTop;
    if (colourRef.current) {
      colourRef.current.scrollTop = area.scrollTop;
      colourRef.current.scrollLeft = area.scrollLeft;
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <div ref={gutterRef} aria-hidden className="w-13.5 shrink-0 select-none overflow-hidden border-r border-card-border/30 bg-code-bg pr-2 pt-6 text-right">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className="px-2 font-mono text-[0.875rem] leading-relaxed text-muted">{i + 1}</div>
        ))}
      </div>
      <div className="relative min-w-0 flex-1 bg-code-bg">
        <pre ref={colourRef} aria-hidden className={`editor-highlight pointer-events-none absolute inset-0 overflow-hidden whitespace-pre ${TEXT}`}>
          <code><SyntaxView code={value} />{"\n"}</code>
        </pre>
        <textarea
          ref={areaRef}
          data-code-input
          aria-label="C++ code"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onScroll={syncScroll}
          spellCheck={false}
          wrap="off"
          placeholder="Write your C++ code here..."
          className={`relative z-10 h-full w-full resize-none bg-transparent text-transparent caret-foreground outline-none placeholder:text-muted ${TEXT}`}
        />
      </div>
    </div>
  );
}
