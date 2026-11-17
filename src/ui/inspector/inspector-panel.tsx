"use client";

// Inspector (tasks 6.3 to 6.5 and 6.8): everything the trace knows about the selected
// node, pointer or source line. All text comes from src/core/explain and src/core/trace.
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { describeEvent, explainObject, explainPointer, cellLabel, targetLabel } from "@/core/explain";
import { heapRootOf, pointerTarget, objectsOfEvent, type Selection, type TraceModel } from "@/core/trace";
import { RichText, TONE_TEXT } from "@/ui/rich-text";

interface InspectorPanelProps {
  model: TraceModel;
  stepIndex: number;
  selection: Selection;
  onSelect: (selection: Selection | null) => void;
  onJump: (step: number) => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section data-inspector-section={title} className="border-t border-card-border px-4 py-3">
      <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">{title}</h4>
      {children}
    </section>
  );
}

const linkButton = "rounded px-1 text-left text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent";
const rowButton = "flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent";

function Sentences({ items }: { items: { text: string; tone: keyof typeof TONE_TEXT }[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((s, i) => (
        <li key={i} className={`text-xs leading-relaxed ${TONE_TEXT[s.tone]}`}><RichText text={s.text} /></li>
      ))}
    </ul>
  );
}

function ObjectInspector({ model, stepIndex, id, onSelect, onJump }: Omit<InspectorPanelProps, "selection"> & { id: string }) {
  const rec = model.object(id);
  if (!rec) return <p className="px-4 py-3 text-xs text-muted">This object is not part of the trace.</p>;
  const view = model.getStep(stepIndex);
  const item = view.heapObject(rec.id);
  const fn = view.step.activeFunction;
  const incoming = view.incoming(rec.id);
  const leaves: { cellId: string; label: string; kind: string; value: string; target: string | null }[] = [];
  const walk = (it: NonNullable<typeof item>, path: string) => {
    const label = !path ? it.name : it.name.startsWith("[") ? `${path}${it.name}` : `${path}.${it.name}`;
    if (it.children) it.children.forEach((c) => walk(c, label));
    else leaves.push({
      cellId: it.id, label: label || "value", kind: it.kind,
      value: it.kind === "pointer" ? (it.pointsTo ? `→ ${targetLabel(model, it.pointsTo)}` : it.dangling ? "deleted (dangling)" : it.value === "?" ? "? (no value)" : "nullptr") : it.value ?? "",
      target: it.kind === "pointer" ? pointerTarget(it) : null,
    });
  };
  if (item) (item.children ?? [item]).forEach((c) => walk(c, ""));
  const lines = [...new Set(rec.history.map((h) => h.sourceLine).filter((l) => l > 0))].sort((a, b) => a - b);
  const state = stepIndex < rec.allocStep ? "not created yet" : rec.freeStep !== null && stepIndex >= rec.freeStep ? "deleted" : item?.orphaned ? "unreachable (leaked)" : "alive";

  return (
    <>
      <Section title="Properties">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">type</dt><dd className="font-mono">{rec.typeName}</dd>
          <dt className="text-muted-foreground">state</dt>
          <dd data-object-state className={state === "alive" ? "text-success" : state === "deleted" ? "text-muted-foreground" : "text-danger"}>{state}</dd>
          {item?.address && (<><dt className="text-muted-foreground">address</dt><dd className="font-mono text-muted-foreground">{item.address} <span className="text-muted">(for display only)</span></dd></>)}
          {leaves.map((l) => (
            <div key={l.cellId} className="contents">
              <dt className="font-mono text-muted-foreground">{l.label}</dt>
              <dd className="font-mono">
                {l.kind === "pointer" ? (
                  <button type="button" className={linkButton} onClick={() => onSelect({ kind: "pointer", cellId: l.cellId })}>{l.value}</button>
                ) : l.value}
              </dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title="References">
        <p className="mb-1 text-[11px] text-muted-foreground">Pointing at it now ({incoming.length})</p>
        {incoming.length === 0 ? <p className="text-xs italic text-muted">nothing</p> : (
          <ul>{incoming.map((r) => (
            <li key={r.cellId}>
              <button type="button" data-incoming-ref className={rowButton} onClick={() => onSelect({ kind: "pointer", cellId: r.cellId })}>
                <RichText text={cellLabel(model, r.owner, r.name, fn)} />
              </button>
            </li>
          ))}</ul>
        )}
        <p className="mb-1 mt-2 text-[11px] text-muted-foreground">It points at</p>
        {leaves.filter((l) => l.kind === "pointer" && heapRootOf(l.target)).length === 0 ? <p className="text-xs italic text-muted">nothing</p> : (
          <ul>{leaves.filter((l) => l.kind === "pointer" && heapRootOf(l.target)).map((l) => (
            <li key={l.cellId}>
              <button type="button" className={rowButton} onClick={() => onSelect({ kind: "object", id: heapRootOf(l.target)! })}>
                <span className="font-mono text-muted-foreground">{l.label}</span>
                <span>→ {model.nameOf(l.target!)}</span>
              </button>
            </li>
          ))}</ul>
        )}
      </Section>
      <Section title="History">
        <ol className="flex flex-col">
          {rec.history.map((h, i) => (
            <li key={i}>
              <button
                type="button"
                data-history-step={h.step}
                className={`${rowButton} ${h.step === stepIndex ? "bg-accent/15" : h.step > stepIndex ? "opacity-50" : ""}`}
                onClick={() => onJump(h.step)}
                title={`Jump to step ${h.step + 1}`}
              >
                <span className="w-12 shrink-0 tabular-nums text-muted">step {h.step + 1}</span>
                <span className="min-w-0 flex-1"><RichText text={describeEvent(model, h)} /></span>
              </button>
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Explanation">
        <Sentences items={explainObject(model, rec.id, stepIndex)} />
      </Section>
      <Section title="Related code">
        <ul>{lines.map((line) => (
          <li key={line}>
            <button type="button" data-related-line={line} className={rowButton} onClick={() => onSelect({ kind: "line", line })}>
              <span className="w-8 shrink-0 text-right tabular-nums text-muted">{line}</span>
              <code className="min-w-0 flex-1 truncate font-mono">{(model.trace.source[line - 1] ?? "").trim()}</code>
            </button>
          </li>
        ))}</ul>
      </Section>
    </>
  );
}

function PointerInspector({ model, stepIndex, cellId, onSelect, onJump }: Omit<InspectorPanelProps, "selection"> & { cellId: string }) {
  const story = explainPointer(model, cellId, stepIndex);
  if (!story) return <p className="px-4 py-3 text-xs text-muted">This pointer does not exist at this step. Step to a point where its function is running.</p>;
  const targetRoot = heapRootOf(story.targetId);
  const previousRoot = heapRootOf(story.previousId);
  const ownerObject = story.owner.kind === "object" ? story.owner.id : null;
  return (
    <>
      <Section title="Pointer">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">lives in</dt>
          <dd data-pointer-source>
            {ownerObject ? (
              <button type="button" className={linkButton} onClick={() => onSelect({ kind: "object", id: ownerObject })}>{model.nameOf(ownerObject)} (heap)</button>
            ) : <>stack frame of <code className="font-mono">{story.owner.name}</code></>}
          </dd>
          <dt className="text-muted-foreground">points at</dt>
          <dd data-pointer-target className={story.state === "dangling" ? "text-danger" : story.state === "uninitialised" ? "text-warning" : ""}>
            {targetRoot ? (
              <button type="button" className={linkButton} onClick={() => onSelect({ kind: "object", id: targetRoot })}>{story.target}</button>
            ) : story.target}
          </dd>
          <dt className="text-muted-foreground">before</dt>
          <dd data-pointer-previous>
            {previousRoot ? (
              <button type="button" className={linkButton} onClick={() => onSelect({ kind: "object", id: previousRoot })}>{story.previous}</button>
            ) : story.previous ?? <span className="text-muted">no earlier target</span>}
          </dd>
          <dt className="text-muted-foreground">changed by</dt>
          <dd>
            {story.lastChange ? (
              <button type="button" data-pointer-change className={`${linkButton} font-mono`} onClick={() => onJump(story.lastChange!.step)} title={`Jump to step ${story.lastChange.step + 1}`}>
                line {story.lastChange.line}: {story.lastChange.source}
              </button>
            ) : <span className="text-muted">not changed yet</span>}
          </dd>
        </dl>
      </Section>
      <Section title="Explanation"><Sentences items={story.sentences} /></Section>
    </>
  );
}

function LineInspector({ model, stepIndex, line, onSelect, onJump }: Omit<InspectorPanelProps, "selection"> & { line: number }) {
  const runs = model.stepsOnLine(line);
  const touched = [...new Set(runs.flatMap((i) => model.events[i].flatMap(objectsOfEvent)))];
  const next = model.nextStepOnLine(line, stepIndex);
  return (
    <>
      <Section title="Line">
        <code className="block truncate rounded bg-code-bg px-2 py-1.5 font-mono text-xs">{(model.trace.source[line - 1] ?? "").trim()}</code>
        <p className="mt-2 text-xs text-muted-foreground" data-line-runs={runs.length}>
          {runs.length === 0 ? "This line did not run." : `This line ran ${runs.length} time${runs.length === 1 ? "" : "s"}.`}
        </p>
        {next >= 0 && (
          <button type="button" data-next-run className="mt-2 rounded-md border border-accent/40 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent" onClick={() => onJump(next)}>
            Jump to its next run (step {next + 1})
          </button>
        )}
      </Section>
      <Section title="Nodes it touched">
        {touched.length === 0 ? <p className="text-xs italic text-muted">none</p> : (
          <ul className="flex flex-wrap gap-1.5">{touched.map((id) => (
            <li key={id}><button type="button" className="rounded-full border border-card-border px-2 py-0.5 text-xs hover:border-accent hover:text-accent" onClick={() => onSelect({ kind: "object", id })}>{model.nameOf(id)}</button></li>
          ))}</ul>
        )}
      </Section>
      <Section title="Each run">
        <ol className="flex flex-wrap gap-1">{runs.map((i) => (
          <li key={i}><button type="button" className={`rounded px-1.5 py-0.5 text-xs tabular-nums hover:bg-accent/10 ${i === stepIndex ? "bg-accent/20 text-accent" : "text-muted-foreground"}`} onClick={() => onJump(i)}>{i + 1}</button></li>
        ))}</ol>
      </Section>
    </>
  );
}

export function InspectorPanel(props: InspectorPanelProps) {
  const { model, stepIndex, selection, onSelect } = props;
  const title =
    selection.kind === "object" ? model.nameOf(selection.id)
    : selection.kind === "pointer" ? (explainPointer(model, selection.cellId, stepIndex)?.label ?? "pointer")
    : `Line ${selection.line}`;
  return (
    <aside data-no-pan data-inspector={selection.kind} aria-label="Inspector" className="flex w-[320px] shrink-0 flex-col overflow-hidden border-l-2 border-card-border bg-card">
      <header className="flex items-center justify-between px-4 py-2.5">
        <h3 className="truncate text-sm font-bold"><RichText text={title} /></h3>
        <button type="button" aria-label="Close inspector" className="rounded p-1 text-muted-foreground hover:bg-accent/10 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent" onClick={() => onSelect(null)}><X size={15} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {selection.kind === "object" && <ObjectInspector {...props} id={selection.id} />}
        {selection.kind === "pointer" && <PointerInspector {...props} cellId={selection.cellId} />}
        {selection.kind === "line" && <LineInspector {...props} line={selection.line} />}
      </div>
    </aside>
  );
}
