// The HeapHop panel inside VS Code: the website's visualizer in its embedded form (no site
// header, no code panel, no Byte), a bar for the program input, and the messages that keep
// the real editor in step with the picture.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Play, RotateCcw, TriangleAlert } from "lucide-react";
import type { RunError, RunResult, Trace } from "@/core/types";
import { Visualizer } from "@/ui/visualizer/visualizer";
import { cn } from "@/ui/utils";
import type { ToPanel } from "../src/protocol";
import { host } from "./host";
import { summarize } from "./summary";

export type RunFn = (code: string, input: string) => Promise<RunResult>;

type View =
  | { kind: "waiting" }
  | { kind: "trace"; trace: Trace }
  | { kind: "error"; error: RunError };

interface Current {
  runId: number;
  fileName: string;
  code: string;
}

const ERROR_TITLES: Record<RunError["kind"], string> = {
  parse: "HeapHop cannot read this code",
  unsupported: "This C++ is not supported yet",
  empty: "Nothing to run yet",
  timeout: "The program ran for too long",
  cancelled: "The run was replaced by a newer one",
  internal: "Something went wrong inside HeapHop",
};

/** The code reads input, so an empty input box is worth pointing out. */
const readsInput = (code: string) => /\bcin\b|\bgetline\s*\(/.test(code);

function Header(props: {
  fileName: string;
  status: string;
  tone: "normal" | "warn" | "danger";
  running: boolean;
  input: string;
  needsInput: boolean;
  inputOpen: boolean;
  onToggleInput: () => void;
  onInput: (text: string) => void;
  onRerun: () => void;
}) {
  const button = "flex h-8 items-center gap-1.5 rounded-md border border-card-border bg-card px-2.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";
  return (
    <div data-panel-header className="shrink-0 border-b-2 border-card-border bg-header">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate font-mono text-sm font-semibold text-foreground" data-file-name>{props.fileName}</span>
          <span
            data-run-status
            className={cn("truncate text-xs", props.tone === "danger" ? "text-danger" : props.tone === "warn" ? "text-warning" : "text-muted-foreground")}
          >
            {props.running ? "Running…" : props.status}
          </span>
        </div>
        <button type="button" data-input-toggle className={cn(button, props.inputOpen && "border-accent/50 text-accent")} onClick={props.onToggleInput} aria-expanded={props.inputOpen} title="What the program reads with cin">
          <Keyboard size={14} aria-hidden />
          Program input
          {props.needsInput && <span className="rounded bg-warning-dim px-1 text-[0.625rem] font-bold uppercase text-warning">cin</span>}
        </button>
        <button type="button" data-rerun className={button} onClick={props.onRerun} disabled={props.running} title="Run the file again (it also runs every time you save)">
          <RotateCcw size={14} aria-hidden />
          Run again
        </button>
      </div>
      {props.inputOpen && (
        <div className="flex flex-col gap-1.5 px-3 pb-3">
          <label htmlFor="hh-input" className="text-xs text-muted-foreground">
            Type everything the program reads with <code className="font-mono">cin</code>, in order: values separated by spaces or new lines. Press Ctrl+Enter to run.
          </label>
          <textarea
            id="hh-input"
            data-program-input
            value={props.input}
            spellCheck={false}
            rows={3}
            onChange={(e) => props.onInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); props.onRerun(); } }}
            className="w-full resize-y rounded-md border border-card-border bg-code-bg px-2.5 py-2 font-mono text-sm text-foreground outline-none focus:border-accent"
          />
        </div>
      )}
    </div>
  );
}

function ErrorCard({ error, onReveal }: { error: RunError; onReveal: (line: number) => void }) {
  return (
    <div className="flex flex-1 items-start justify-center overflow-auto p-6">
      <div data-run-error={error.kind} className="w-full max-w-xl rounded-xl border-2 border-danger/30 bg-danger-dim p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-danger">
          <TriangleAlert size={18} aria-hidden />
          {ERROR_TITLES[error.kind]}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground">{error.message}</p>
        {error.line !== undefined && (
          <button type="button" data-reveal-line={error.line} onClick={() => onReveal(error.line!)}
            className="mt-4 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-accent">
            Show line {error.line} in the editor
          </button>
        )}
        {error.kind === "unsupported" && (
          <p className="mt-4 text-xs text-muted-foreground">
            HeapHop runs the parts of C++ that data-structure labs use: structs and classes, pointers, new and delete, arrays,
            recursion, cin and cout, and std::list. Everything it supports is listed on heaphop.vercel.app/supported.
          </p>
        )}
      </div>
    </div>
  );
}

function Waiting() {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <Play className="mx-auto mb-3 text-accent" size={28} aria-hidden />
        <p className="text-sm font-semibold text-foreground">Nothing to show yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Open a C++ file and run <span className="font-mono">HeapHop: Visualize Current File</span> (Ctrl+Alt+H), or press the HeapHop button at the top right of the editor.
        </p>
      </div>
    </div>
  );
}

export function App({ run }: { run: RunFn }) {
  const [view, setView] = useState<View>({ kind: "waiting" });
  const [current, setCurrent] = useState<Current | null>(null);
  const [running, setRunning] = useState(false);
  const [input, setInput] = useState("");
  const [inputOpen, setInputOpen] = useState(false);
  const [focusLine, setFocusLine] = useState<number | null | undefined>(undefined);
  /** Shown trace's run, so each new run starts a fresh timeline. */
  const [traceRun, setTraceRun] = useState(0);
  const stepRef = useRef(0);
  const [startStep, setStartStep] = useState(0);
  const latest = useRef(0);
  const inputTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(async (m: Extract<ToPanel, { type: "run" }>) => {
    latest.current = m.runId;
    setCurrent({ runId: m.runId, fileName: m.fileName, code: m.code });
    setInput(m.input);
    if (readsInput(m.code) && m.input.trim() === "") setInputOpen(true); // it will need input
    setRunning(true);
    host.setState({ uri: m.fileUri });
    const result = await run(m.code, m.input);
    if (latest.current !== m.runId || (!result.ok && result.error.kind === "cancelled")) return;
    setRunning(false);
    host.postMessage({ type: "result", runId: m.runId, summary: summarize(result) });
    if (result.ok) {
      setStartStep(stepRef.current); // a re-run of the same file keeps the student's place
      setTraceRun(m.runId);
      setView({ kind: "trace", trace: result.trace });
    } else {
      setView({ kind: "error", error: result.error });
    }
  }, [run]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      const m = event.data as ToPanel;
      if (typeof m !== "object" || m === null) return;
      if (m.type === "run" && typeof m.code === "string" && typeof m.input === "string") {
        if (m.fileName !== current?.fileName) stepRef.current = 0;
        void start(m);
      } else if (m.type === "focusLine" && (m.line === null || typeof m.line === "number")) {
        setFocusLine(m.line);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [start, current?.fileName]);

  useEffect(() => { host.postMessage({ type: "ready" }); }, []);

  const onInput = (text: string) => {
    setInput(text);
    if (inputTimer.current) clearTimeout(inputTimer.current);
    inputTimer.current = setTimeout(() => host.postMessage({ type: "input", text }), 250);
  };
  const rerun = () => {
    if (inputTimer.current) { clearTimeout(inputTimer.current); inputTimer.current = null; }
    host.postMessage({ type: "input", text: input });
    host.postMessage({ type: "rerun" });
  };
  const reveal = (line: number) => host.postMessage({ type: "reveal", line });

  const onStepChange = useCallback((s: { step: number; line: number; callerLine: number | null; error: boolean }) => {
    stepRef.current = s.step;
    host.postMessage({ type: "step", runId: traceRun, line: s.line, callerLine: s.callerLine, error: s.error });
  }, [traceRun]);

  const needsInput = !!current && readsInput(current.code) && input.trim() === "";
  const status = useMemo(() => {
    if (view.kind === "trace") {
      const t = view.trace;
      if (t.status === "error") return { text: `${t.steps.length} steps · crashed on line ${t.steps[t.steps.length - 1].sourceLine}`, tone: "danger" as const };
      if (t.status === "truncated") return { text: `${t.steps.length} steps · stopped early`, tone: "warn" as const };
      return { text: `${t.steps.length} steps`, tone: "normal" as const };
    }
    if (view.kind === "error") return { text: view.error.line ? `cannot run (line ${view.error.line})` : "cannot run", tone: "danger" as const };
    return { text: "", tone: "normal" as const };
  }, [view]);

  const header = current ? (
    <Header
      fileName={current.fileName}
      status={status.text}
      tone={status.tone}
      running={running}
      input={input}
      needsInput={needsInput}
      inputOpen={inputOpen}
      onToggleInput={() => setInputOpen((o) => !o)}
      onInput={onInput}
      onRerun={rerun}
    />
  ) : null;

  if (view.kind === "trace") {
    return (
      <Visualizer
        key={traceRun}
        trace={view.trace}
        current="editor"
        backLabel=""
        onBack={() => {}}
        embedded={{ header, onStepChange, focusLine, initialStep: startStep }}
      />
    );
  }
  return (
    <div className="flex h-dvh flex-col">
      {header}
      {view.kind === "error" ? <ErrorCard error={view.error} onReveal={reveal} /> : <Waiting />}
    </div>
  );
}
