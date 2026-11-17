"use client";

// The visualizer screen: code on the left, the stack and the heap in the middle, the
// inspector on the right when something is selected, and the timeline at the bottom.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Trace } from "@/core/types";
import { highlightsFor, TraceModel, type Selection } from "@/core/trace";
import { explainStep } from "@/core/explain";
import { resolveLesson, type Lesson } from "@/core/learn";
import { planLists } from "@/core/structures";
import { AppHeader } from "@/ui/app-header";
import { MemoryCanvas } from "@/ui/canvas/memory-canvas";
import { InspectContext, type InspectApi } from "@/ui/inspect-context";
import { InspectorPanel } from "@/ui/inspector/inspector-panel";
import { LessonCard } from "@/ui/lesson/lesson-card";
import { RichText, TONE_TEXT } from "@/ui/rich-text";
import { CodePanel } from "./code-panel";
import { Controls } from "./controls";
import { StackPanel } from "./stack-panel";
import { usePlayback, useStepKeys } from "./use-playback";

interface VisualizerProps {
  trace: Trace;
  /** When given, the lesson card guides the student through its checkpoints. */
  lesson?: Lesson;
  onBack: () => void;
}

export function Visualizer({ trace, lesson, onBack }: VisualizerProps) {
  // Derived once per trace: events, object names, and where each list node sits.
  const model = useMemo(() => new TraceModel(trace), [trace]);
  const plan = useMemo(() => planLists(trace), [trace]);
  const resolved = useMemo(() => (lesson ? resolveLesson(lesson, model) : null), [lesson, model]);
  const playback = usePlayback(trace, resolved?.checkpoints[0]?.step ?? 0);
  const { step, goTo } = playback;
  // One selection (a node, a pointer or a source line) shared by every panel.
  const [selection, setSelection] = useState<Selection | null>(null);
  const [lessonOpen, setLessonOpen] = useState(true);
  const [checkpoint, setCheckpoint] = useState(0);
  const stackRef = useRef<HTMLDivElement>(null);

  const current = trace.steps[step];
  const highlights = useMemo(() => highlightsFor(model, selection), [model, selection]);
  const sentences = useMemo(() => explainStep(model, step), [model, step]);
  const output = model.outputUntil(step);
  const clearSelection = useCallback(() => setSelection(null), []);
  useStepKeys(playback, clearSelection);

  // Keep the part of the stack that changed in view.
  useEffect(() => {
    const panel = stackRef.current;
    const target = panel?.querySelector("[data-changed]") ?? panel?.querySelector("[data-active-frame]");
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [step]);

  const inspect = useMemo<InspectApi>(
    () => ({ model, stepIndex: step, selection, select: setSelection, jump: goTo }),
    [model, step, selection, goTo]
  );

  const goToCheckpoint = (index: number) => {
    const target = resolved?.checkpoints[index];
    if (!target) return;
    setCheckpoint(index);
    playback.travelTo(target.step);
  };

  return (
    <InspectContext.Provider value={inspect}>
      <div className="flex min-h-dvh flex-col lg:h-dvh">
        <AppHeader onBack={onBack} />

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="max-h-[30vh] shrink-0 overflow-y-auto border-b-2 border-card-border lg:max-h-none lg:w-[400px] lg:border-b-0 lg:border-r-2">
            <CodePanel
              source={trace.source}
              activeFunction={current.activeFunction}
              activeLine={current.sourceLine}
              callerLine={current.callerSourceLine}
              selectedLine={selection?.kind === "line" ? selection.line : null}
              highlightLines={highlights.lines}
              onSelectLine={(line) => setSelection((s) => (s?.kind === "line" && s.line === line ? null : { kind: "line", line }))}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col bg-background md:flex-row">
            <div ref={stackRef} className="max-h-[28vh] shrink-0 overflow-auto border-b-2 border-card-border p-4 md:max-h-none md:w-[300px] md:border-b-0 md:border-r-2 md:p-5">
              <StackPanel frames={current.stack} />
            </div>
            <div className="relative min-h-[320px] min-w-0 flex-1">
              <MemoryCanvas model={model} plan={plan} stepIndex={step} selection={selection} highlighted={highlights.objects} onSelect={setSelection} />
              {resolved && lessonOpen && (
                <LessonCard
                  resolved={resolved}
                  current={checkpoint}
                  travelling={playback.travelling}
                  onGo={goToCheckpoint}
                  onReveal={goTo}
                  onClose={() => setLessonOpen(false)}
                />
              )}
            </div>
            {selection && <InspectorPanel model={model} stepIndex={step} selection={selection} onSelect={setSelection} onJump={goTo} />}
          </div>
        </div>

        {trace.status !== "completed" && trace.notice && (
          <div
            role="status"
            data-trace-status={trace.status}
            className={trace.status === "error"
              ? "border-t-2 border-danger/30 bg-danger-dim px-5 py-2 text-sm font-medium text-danger"
              : "border-t-2 border-warning/30 bg-warning-dim px-5 py-2 text-sm font-medium text-warning"}
          >
            {trace.status === "error" ? "Program crashed. " : "Trace truncated. "}
            {trace.notice}
          </div>
        )}

        <div className="flex flex-col gap-2 border-t-2 border-accent/20 bg-accent/5 px-5 py-3 md:flex-row md:items-start md:gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span data-step={step + 1} data-steps={trace.steps.length} className="mt-0.5 shrink-0 rounded-lg bg-accent/15 px-2.5 py-1 text-xs font-bold tabular-nums text-accent">
              Step {step + 1}/{trace.steps.length}
            </span>
            <div className="min-w-0 flex-1" data-explanation aria-live="polite">
              {sentences.map((s, i) => (
                <p key={i} className={i === 0 ? `text-sm font-medium leading-relaxed ${TONE_TEXT[s.tone]}` : `mt-0.5 text-[13px] leading-relaxed ${s.tone === "info" ? "text-muted-foreground" : TONE_TEXT[s.tone]}`}>
                  <RichText text={s.text} />
                </p>
              ))}
            </div>
          </div>
          {output && (
            <div className="md:w-[360px] md:shrink-0">
              <h3 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Output so far</h3>
              <pre data-output className="max-h-24 overflow-auto rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-2 font-mono text-sm text-foreground">{output}</pre>
            </div>
          )}
        </div>

        <Controls playback={playback} marks={highlights.steps} />
      </div>
    </InspectContext.Provider>
  );
}
