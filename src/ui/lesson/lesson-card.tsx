"use client";

// Lesson player (tasks 7.2 and 7.3). Shows the current checkpoint; "Next" plays the
// program forward and pauses at the next one. A prediction checkpoint pauses before its
// line runs and asks where a pointer will point; the answer is then shown by stepping.
import { useState } from "react";
import type { ResolvedCheckpoint, ResolvedLesson } from "@/core/learn";
import { RichText } from "@/ui/rich-text";

interface LessonCardProps {
  resolved: ResolvedLesson;
  /** Index of the checkpoint being shown. */
  current: number;
  /** The program is being played forward to the next checkpoint. */
  travelling: boolean;
  onGo: (checkpoint: number) => void;
  /** Step to the result of a prediction. */
  onReveal: (step: number) => void;
  onClose: () => void;
}

const primary = "rounded-full bg-accent px-3.5 py-1.5 text-xs font-bold text-on-accent hover:opacity-90 focus-visible:outline-2 focus-visible:outline-foreground disabled:opacity-40";
const secondary = "rounded-md border border-card-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

function PredictionBlock({ checkpoint, onReveal }: { checkpoint: ResolvedCheckpoint; onReveal: (step: number) => void }) {
  const prediction = checkpoint.prediction!;
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const answered = picked !== undefined;
  const right = answered && picked === prediction.answer;
  const answerLabel = prediction.options.find((o) => o.id === prediction.answer)?.label ?? "nullptr";
  return (
    <div data-prediction>
      <p className="text-sm font-medium leading-relaxed"><RichText text={prediction.question} /></p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Choose an answer">
        {prediction.options.map((o) => {
          const isAnswer = o.id === prediction.answer;
          const tone = !answered ? "border-card-border hover:border-accent hover:text-accent"
            : isAnswer ? "border-success bg-success-dim text-success"
            : o.id === picked ? "border-danger bg-danger-dim text-danger" : "border-card-border opacity-50";
          return (
            <button
              key={o.id ?? "null"}
              type="button"
              data-option={o.id ?? "null"}
              data-correct={(answered && isAnswer) || undefined}
              disabled={answered}
              onClick={() => { setPicked(o.id); onReveal(prediction.revealStep); }}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="mt-2" data-prediction-result={right ? "right" : "wrong"} role="status">
          <p className={`text-xs font-bold ${right ? "text-success" : "text-danger"}`}>
            {right ? "Correct." : `Not quite. It points at ${answerLabel}.`} The picture now shows the result.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground"><RichText text={checkpoint.text} /></p>
        </div>
      )}
    </div>
  );
}

export function LessonCard({ resolved, current, travelling, onGo, onReveal, onClose }: LessonCardProps) {
  const { lesson, checkpoints, problems } = resolved;
  const checkpoint = checkpoints[current];
  const last = current >= checkpoints.length - 1;
  return (
    <aside data-no-pan data-lesson-card aria-label={`Lesson: ${lesson.title}`} className="absolute bottom-3 left-3 z-10 w-[380px] max-w-[calc(100%-1.5rem)] rounded-xl border border-accent/40 bg-card shadow-xl">
      <header className="flex items-center justify-between gap-2 border-b border-card-border px-4 py-2">
        <h3 className="truncate text-xs font-bold uppercase tracking-wider text-accent">Lesson · {lesson.title}</h3>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground" data-lesson-progress>{Math.min(current + 1, checkpoints.length)} / {checkpoints.length}</span>
      </header>
      <div className="px-4 py-3">
        {problems.length > 0 && <p className="mb-2 text-xs text-warning">This lesson has a problem: {problems[0]}</p>}
        {!checkpoint ? (
          <p className="text-sm text-muted-foreground">This lesson has no steps.</p>
        ) : travelling ? (
          <p className="text-sm italic text-muted-foreground" data-lesson-travelling>Running to the next stop…</p>
        ) : checkpoint.prediction ? (
          <PredictionBlock key={checkpoint.index} checkpoint={checkpoint} onReveal={onReveal} />
        ) : (
          <p className="text-sm leading-relaxed" data-lesson-text><RichText text={checkpoint.text} /></p>
        )}
      </div>
      <footer className="flex items-center justify-between border-t border-card-border px-4 py-2">
        <button type="button" className={secondary} onClick={onClose}>End lesson</button>
        <div className="flex gap-2">
          <button type="button" className={secondary} disabled={current <= 0 || travelling} onClick={() => onGo(current - 1)}>Back</button>
          <button type="button" data-lesson-next className={primary} disabled={last || travelling} onClick={() => onGo(current + 1)}>{last ? "Finished" : "Next"}</button>
        </div>
      </footer>
    </aside>
  );
}
