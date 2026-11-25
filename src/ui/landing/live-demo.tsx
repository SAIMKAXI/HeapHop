"use client";

// The landing page's demo: a short program run through the real interpreter (in the
// Worker, like any other program) and played on a loop with the real canvas. It pauses
// on its own when the visitor prefers reduced motion, and has a pause button otherwise.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import type { Trace } from "@/core/types";
import { TraceModel } from "@/core/trace";
import { explainStep } from "@/core/explain";
import { planLists } from "@/core/structures";
import { MemoryCanvas } from "@/ui/canvas/memory-canvas";
import type { RunFn } from "@/ui/editor/editor-shell";
import { SyntaxView } from "@/ui/editor/syntax-view";
import { RichText } from "@/ui/rich-text";
import { cn } from "@/ui/utils";

const PROGRAM = `#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
    Node(int d) : data(d), next(nullptr) {}
};

int main() {
    Node* head = new Node(10);
    head->next = new Node(20);
    head->next->next = new Node(30);
    Node* cur = head;
    while (cur != nullptr) {
        cur = cur->next;
    }
    while (head != nullptr) {
        Node* old = head;
        head = head->next;
        delete old;
    }
    return 0;
}
`;
const LINES = PROGRAM.split("\n");
/** Only main is shown; the struct above it is described in the caption. */
const FIRST_SHOWN = LINES.indexOf("int main() {");
const STEP_MS = 1100;
const END_PAUSE_MS = 2600;

function DemoFrame({ activeLine, step, steps, playing, onToggle, canvas, caption }: {
  activeLine: number;
  step: number;
  steps: number;
  playing: boolean;
  onToggle?: () => void;
  canvas: ReactNode;
  caption: ReactNode;
}) {
  return (
    <figure data-live-demo className="overflow-hidden rounded-2xl border-2 border-card-border bg-card shadow-2xl shadow-accent/5">
      <div className="flex items-center justify-between gap-3 border-b border-card-border px-4 py-2.5">
        <span className="text-xs font-semibold text-muted-foreground">A three-node list, built, walked and freed</span>
        <span className="flex items-center gap-2">
          {steps > 0 && <span className="text-xs tabular-nums text-muted">step {step + 1}/{steps}</span>}
          <button
            type="button"
            onClick={onToggle}
            disabled={!onToggle}
            aria-label={playing ? "Pause the demo" : "Play the demo"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-card-border/30 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 lg:h-auto lg:w-auto lg:p-1.5"
          >
            {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
          </button>
        </span>
      </div>
      <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <pre className="overflow-x-auto border-b border-card-border bg-code-bg py-3 font-mono text-[0.7812rem] leading-6 md:border-b-0 md:border-r">
          {LINES.slice(FIRST_SHOWN).map((line, i) => {
            const number = FIRST_SHOWN + i + 1;
            return (
              <div key={number} className={cn("flex border-l-2 pr-4", number === activeLine ? "border-accent bg-accent/10" : "border-transparent")}>
                <span className="w-10 shrink-0 select-none pr-3 text-right text-muted" aria-hidden>{number}</span>
                <span className="whitespace-pre"><SyntaxView code={line} /></span>
              </div>
            );
          })}
        </pre>
        <div className="relative h-75 md:h-auto md:min-h-[380px]">{canvas}</div>
      </div>
      <figcaption className="min-h-[3.25rem] border-t border-card-border px-4 py-3 text-sm" aria-live="off">{caption}</figcaption>
    </figure>
  );
}

function Player({ trace }: { trace: Trace }) {
  const model = useMemo(() => new TraceModel(trace), [trace]);
  const plan = useMemo(() => planLists(trace), [trace]);
  const [playing, setPlaying] = useState(() => !matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [step, setStep] = useState(0);
  const last = trace.steps.length - 1;

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setStep((s) => (s >= last ? 0 : s + 1)), step >= last ? END_PAUSE_MS : STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, step, last]);

  return (
    <DemoFrame
      activeLine={trace.steps[step].sourceLine}
      step={step}
      steps={trace.steps.length}
      playing={playing}
      onToggle={() => setPlaying((p) => !p)}
      canvas={<MemoryCanvas still model={model} plan={plan} stepIndex={step} />}
      caption={<RichText text={explainStep(model, step)[0]?.text ?? ""} />}
    />
  );
}

export function LiveDemo({ run }: { run: RunFn }) {
  const [trace, setTrace] = useState<Trace | null>(null);
  useEffect(() => {
    let current = true;
    void run(PROGRAM, { input: "" }).then((r) => { if (current && r.ok) setTrace(r.trace); });
    return () => { current = false; };
  }, [run]);

  if (trace) return <Player trace={trace} />;
  return (
    <DemoFrame
      activeLine={0} step={0} steps={0} playing={false}
      canvas={<span className="absolute inset-0 flex items-center justify-center text-sm text-muted">Starting…</span>}
      caption={<span className="text-muted-foreground">Each step is explained here as the program runs.</span>}
    />
  );
}
