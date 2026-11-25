"use client";

// The visualizer screen: code on the left, the stack and the heap in the middle, the
// inspector on the right when something is selected, and the timeline at the bottom.
// The code and stack panels can be resized; a lesson card sits under the heap, never on it.
// A phone held upright shows Code or Memory, chosen with tabs; held sideways, the two sit side
// by side with a one-line explanation and the timeline beside the buttons.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Trace } from "@/core/types";
import { highlightsFor, TraceModel, type Selection } from "@/core/trace";
import { explainStep } from "@/core/explain";
import { resolveLesson, type Lesson } from "@/core/learn";
import { planLists } from "@/core/structures";
import { AppHeader } from "@/ui/site/app-header";
import type { SitePage } from "@/ui/site/links";
import { MemoryCanvas } from "@/ui/canvas/memory-canvas";
import { InspectContext, type InspectApi } from "@/ui/inspect-context";
import { InspectorPanel } from "@/ui/inspector/inspector-panel";
import { LessonCard } from "@/ui/lesson/lesson-card";
import { RichText, TONE_TEXT } from "@/ui/rich-text";
import { cn } from "@/ui/utils";
import { CodePanel } from "./code-panel";
import { DEFAULT_SIZES, loadSizes, MIN_HEAP, MIN_SIZES, saveSizes, type PanelSizes } from "./panel-sizes";
import { Splitter } from "./splitter";
import { Controls } from "./controls";
import { StackPanel } from "./stack-panel";
import { usePlayback, useStepKeys } from "./use-playback";

/** Width of a panel divider (Tailwind w-1.5). */
const SPLITTER_W = 6;

interface VisualizerProps {
  trace: Trace;
  /** When given, the lesson card guides the student through its checkpoints. */
  lesson?: Lesson;
  /** The site page this run belongs to, and the words on the button that returns there. */
  current: SitePage;
  backLabel: string;
  onBack: () => void;
}

export function Visualizer({ trace, lesson, current: page, backLabel, onBack }: VisualizerProps) {
  // Derived once per trace: events, object names, and where each list node sits.
  const model = useMemo(() => new TraceModel(trace), [trace]);
  const plan = useMemo(() => planLists(trace), [trace]);
  const resolved = useMemo(() => (lesson ? resolveLesson(lesson, model) : null), [lesson, model]);
  const playback = usePlayback(trace, resolved?.checkpoints[0]?.step ?? 0);
  const { step, goTo } = playback;
  // One selection (a node, a pointer or a source line) shared by every panel.
  const [selection, setSelection] = useState<Selection | null>(null);
  const [lessonOpen, setLessonOpen] = useState(true);
  // Which half a phone held upright shows. Memory first: it is what the run is for.
  const [tab, setTab] = useState<"code" | "memory">("memory");
  const [checkpoint, setCheckpoint] = useState(0);
  const stackRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const middleRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState(loadSizes);
  const resize = (patch: Partial<PanelSizes>) => {
    const next = { ...sizes, ...patch };
    setSizes(next);
    saveSizes(next);
  };
  const inspectorWidth = () => middleRef.current?.querySelector<HTMLElement>("[data-inspector]")?.offsetWidth ?? 0;

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
      <div className="flex min-h-dvh flex-col lg:h-dvh phone-tall:h-[max(100dvh,600px)] phone-land:h-[max(100dvh,330px)]">
        <AppHeader current={page} backLabel={backLabel} onBack={onBack} />

        <div role="tablist" aria-label="Show" className="hidden shrink-0 gap-1 border-b-2 border-card-border bg-card p-1.5 phone-tall:flex">
          {(["code", "memory"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`hh-tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`hh-panel-${t}`}
              data-view-tab={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                tab === t ? "bg-accent text-on-accent" : "text-muted-foreground hover:bg-card-border/40 hover:text-foreground"
              )}
            >
              {t === "code" ? "Code" : "Memory"}
              {t === "code" && current.sourceLine != null && (
                <span className={cn("rounded-md px-1.5 py-0.5 text-[0.6875rem] font-bold tabular-nums", tab === t ? "bg-on-accent/15" : "bg-accent/15 text-accent")}>line {current.sourceLine}</span>
              )}
            </button>
          ))}
        </div>

        <div
          ref={rowRef}
          className={cn(
            "flex min-h-0 flex-1 flex-col lg:flex-row phone-land:grid phone-land:grid-cols-[minmax(0,36%)_10.5rem_minmax(0,1fr)]",
            resolved && lessonOpen ? "phone-land:grid-rows-[minmax(4.5rem,1fr)_minmax(0,2fr)]" : "phone-land:grid-rows-[minmax(0,1fr)]"
          )} style={{ "--code-w": `${sizes.code}px`, "--stack-w": `${sizes.stack}px` } as CSSProperties}>
          <div
            id="hh-panel-code"
            data-panel="code"
            className={cn(
              "max-h-[30vh] shrink-0 overflow-y-auto border-b-2 border-card-border lg:max-h-none lg:w-[var(--code-w)] lg:border-b-0",
              "phone-tall:max-h-none phone-tall:min-h-0 phone-tall:flex-1 phone-tall:border-b-0",
              "phone-land:col-start-1 phone-land:row-start-1 phone-land:max-h-none phone-land:min-h-0 phone-land:border-b-0 phone-land:border-r-2",
              tab !== "code" && "phone-tall:hidden"
            )}
          >
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
          <Splitter
            label="Resize the code panel"
            className="hidden lg:block"
            value={sizes.code}
            min={MIN_SIZES.code}
            defaultValue={DEFAULT_SIZES.code}
            max={() => (rowRef.current?.clientWidth ?? Infinity) - sizes.stack - MIN_HEAP - inspectorWidth() - 2 * SPLITTER_W}
            onChange={(code) => resize({ code })}
          />

          <div
            ref={middleRef}
            id="hh-panel-memory"
            className={cn("flex min-h-0 flex-1 flex-col bg-background md:flex-row phone-tall:overflow-y-auto phone-land:contents", tab !== "memory" && "phone-tall:hidden")}
          >
            <div ref={stackRef} data-panel="stack" className="max-h-[28vh] shrink-0 overflow-auto border-b-2 border-card-border p-4 md:max-h-none md:w-[var(--stack-w)] md:border-b-0 md:p-5 phone-tall:max-h-[24%] phone-tall:p-3 phone-land:col-start-2 phone-land:row-span-2 phone-land:row-start-1 phone-land:max-h-none phone-land:w-auto phone-land:border-b-0 phone-land:border-r-2 phone-land:bg-background phone-land:p-3">
              <StackPanel frames={current.stack} />
            </div>
            <Splitter
              label="Resize the stack panel"
              className="hidden md:block phone-land:hidden"
              value={sizes.stack}
              min={MIN_SIZES.stack}
              defaultValue={DEFAULT_SIZES.stack}
              max={() => (middleRef.current?.clientWidth ?? Infinity) - MIN_HEAP - inspectorWidth() - SPLITTER_W}
              onChange={(stack) => resize({ stack })}
            />
            {/* On a desktop the panel shares the window's height: the drawing shrinks before the
                lesson card is pushed out over the explanation bar. */}
            <div data-panel="heap" className="flex min-h-[320px] min-w-0 flex-1 flex-col md:min-h-0 md:overflow-hidden phone-tall:min-h-0 phone-land:contents">
              <div className="relative min-h-[260px] flex-1 md:min-h-[120px] phone-tall:min-h-[140px] phone-land:col-start-3 phone-land:row-span-2 phone-land:row-start-1 phone-land:min-h-0 phone-land:bg-background">
                <MemoryCanvas model={model} plan={plan} stepIndex={step} selection={selection} highlighted={highlights.objects} onSelect={setSelection} robotMotion={!playback.playing && !playback.travelling} />
              </div>
              {resolved && lessonOpen && (
                <LessonCard
                  resolved={resolved}
                  current={checkpoint}
                  travelling={playback.travelling}
                  onGo={goToCheckpoint}
                  onReveal={goTo}
                  onClose={() => setLessonOpen(false)}
                  className="phone-land:col-start-1 phone-land:row-start-2 phone-land:max-h-none phone-land:border-r-2 phone-land:border-r-card-border"
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

        {/* On a phone held sideways during a lesson, the lesson card explains the step instead. */}
        <div className={cn("flex flex-col gap-2 border-t-2 border-accent/20 bg-accent/5 px-5 py-3 md:flex-row md:items-start md:gap-4", resolved && lessonOpen && "phone-land:hidden", "phone-tall:max-h-[22vh] phone-tall:shrink-0 phone-tall:overflow-y-auto phone-tall:px-4 phone-land:max-h-14 phone-land:shrink-0 phone-land:overflow-y-auto phone-land:py-1.5")}>
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span data-step={step + 1} data-steps={trace.steps.length} className="mt-0.5 shrink-0 rounded-lg bg-accent/15 px-2.5 py-1 text-xs font-bold tabular-nums text-accent">
              Step {step + 1}/{trace.steps.length}
            </span>
            <div className="min-w-0 flex-1" data-explanation aria-live="polite">
              {sentences.map((s, i) => (
                <p key={i} className={i === 0 ? `text-sm font-medium leading-relaxed ${TONE_TEXT[s.tone]}` : `mt-0.5 text-[0.8125rem] leading-relaxed ${s.tone === "info" ? "text-muted-foreground" : TONE_TEXT[s.tone]}`}>
                  <RichText text={s.text} />
                </p>
              ))}
            </div>
          </div>
          {output && (
            <div className="md:w-90 md:shrink-0">
              <h3 className="mb-1 text-[0.625rem] font-bold uppercase tracking-widest text-muted-foreground">Output so far</h3>
              <pre data-output className="max-h-24 overflow-auto rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-2 font-mono text-sm text-foreground">{output}</pre>
            </div>
          )}
        </div>

        <Controls playback={playback} marks={highlights.steps} />
      </div>
    </InspectContext.Provider>
  );
}
