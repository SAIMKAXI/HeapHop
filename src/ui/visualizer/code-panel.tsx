"use client";

// The student's program with the running line highlighted. Each line can be chosen to see
// what it did; glossary words explain themselves on hover.
import { Fragment, useEffect, useRef } from "react";
import { GLOSSARY } from "@content/glossary";
import { SYNTAX_CLASS, type SyntaxToken } from "@/ui/editor/cpp-syntax";
import { SyntaxView } from "@/ui/editor/syntax-view";
import { cn } from "@/ui/utils";

interface CodePanelProps {
  /** The student's program, one entry per line. */
  source: string[];
  /** Function running at this step, shown above the code. */
  activeFunction: string;
  /** 1-based line being executed. 0 for none. */
  activeLine: number;
  /** 1-based line of the call that is waiting for the active function to return. */
  callerLine?: number;
  /** Line chosen by the student. */
  selectedLine: number | null;
  /** Lines related to the current selection. */
  highlightLines: Set<number>;
  onSelectLine: (line: number) => void;
}

const glossaryWord = (word: string, key: string, className = "") => (
  <span key={key} data-glossary={word} title={GLOSSARY[word]} className={cn("cursor-help underline decoration-muted decoration-dotted underline-offset-4", className)}>{word}</span>
);

/** Adds a hover definition to glossary words: whole keywords, or words inside plain code. */
function withGlossary(token: SyntaxToken, key: number) {
  if (token.kind !== "plain") return GLOSSARY[token.text] ? glossaryWord(token.text, String(key), SYNTAX_CLASS[token.kind]) : undefined;
  if (!/\w/.test(token.text)) return undefined;
  return <Fragment key={key}>{token.text.split(/(\b\w+\b)/).map((part, i) => (GLOSSARY[part] ? glossaryWord(part, `${key}-${i}`) : part))}</Fragment>;
}

export function CodePanel({ source, activeFunction, activeLine, callerLine, selectedLine, highlightLines, onSelectLine }: CodePanelProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeLine]);

  return (
    <section aria-label="Code" className="flex flex-col gap-3 p-5">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Code
        {activeFunction && (
          <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[0.625rem] font-bold normal-case tracking-normal text-accent">in {activeFunction}()</span>
        )}
      </h3>
      <div className="overflow-x-auto rounded-xl border-2 border-card-border bg-code-bg py-1 font-mono text-[0.8125rem] leading-relaxed">
        {source.map((line, i) => {
          const lineNo = i + 1;
          const active = lineNo === activeLine;
          const caller = !active && lineNo === callerLine;
          const chosen = selectedLine === lineNo;
          const related = !chosen && highlightLines.has(lineNo);
          return (
            <button
              key={i}
              type="button"
              ref={active ? activeRef : undefined}
              disabled={!line.trim()}
              data-active-line={active || undefined}
              data-source-line={lineNo}
              data-selected-line={chosen || undefined}
              data-related-line={related || undefined}
              aria-label={`Line ${lineNo}: ${line.trim()}`}
              aria-pressed={chosen}
              onClick={() => onSelectLine(lineNo)}
              title="See what this line did"
              className={cn(
                "flex w-max min-w-full items-center border-l-4 border-transparent px-4 py-[3px] text-left transition-colors duration-200 enabled:cursor-pointer enabled:hover:bg-foreground/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-default",
                chosen && "outline outline-2 -outline-offset-2 outline-warning",
                related && "bg-warning-dim",
                active && "border-l-accent bg-accent/10 font-medium text-foreground",
                caller && "border-l-warning/70 bg-warning-dim text-foreground",
                !active && !caller && "text-muted-foreground"
              )}
            >
              <span className={cn("mr-3 w-7 shrink-0 select-none text-right", active ? "font-bold text-accent" : "text-muted")}>{lineNo}</span>
              <span className="whitespace-pre">{line ? <SyntaxView code={line} decorate={withGlossary} /> : " "}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
