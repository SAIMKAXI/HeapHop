// Lessons and prediction exercises (tasks 7.2 and 7.3).
//
// A lesson is a program plus checkpoints. A checkpoint names a source line by its text
// and says which run of that line it means; it never stores a step number, so a lesson
// keeps working when the interpreter changes how many steps a program takes.
//
// A prediction asks where a pointer will point after the next statement. Its right
// answer is read from the trace, never typed by the lesson's author.
import type { MemoryItem, Step } from "../types";
import { heapRootOf, type TraceModel } from "../trace";

interface LessonCheckpoint {
  /** The text of the source line (surrounding spaces ignored). Use this or `line`. */
  at?: string;
  /** 1-based source line number, as an alternative to `at`. */
  line?: number;
  /** Which run of that line: 1 = the first time it executes (default). */
  occurrence?: number;
  title?: string;
  /** Shown to the student. `backticks` mark code. */
  text: string;
  /** Name of a pointer variable: pause BEFORE the line runs and ask where it will point. */
  predict?: string;
}

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  code: string;
  /** Program input, when the code reads from cin. */
  input?: string;
  checkpoints: LessonCheckpoint[];
}

interface PredictionOption {
  /** Heap object id, or null for nullptr. */
  id: string | null;
  label: string;
}

export interface Prediction {
  variable: string;
  /** The statement about to run. */
  statement: string;
  question: string;
  options: PredictionOption[];
  /** Taken from the next step of the trace. */
  answer: string | null;
  /** The step that shows the result. */
  revealStep: number;
}

export interface ResolvedCheckpoint {
  index: number;
  /** Step to pause at. For a prediction this is the step BEFORE the line runs. */
  step: number;
  line: number;
  title: string;
  text: string;
  prediction: Prediction | null;
}

export interface ResolvedLesson {
  lesson: Lesson;
  checkpoints: ResolvedCheckpoint[];
  /** Why a checkpoint could not be placed. Empty when the lesson is healthy. */
  problems: string[];
}

function findVariable(step: Step, name: string): MemoryItem | undefined {
  const parts = name.split(".");
  for (let f = step.stack.length - 1; f >= 0; f--) {
    let cell = step.stack[f].variables.find((v) => v.name === parts[0]);
    for (let i = 1; cell && i < parts.length; i++) cell = cell.children?.find((c) => c.name === parts[i]);
    if (cell) return cell;
  }
  return undefined;
}

const MAX_OPTIONS = 6;

/**
 * Build the question "where will `variable` point after this statement?".
 * `runStep` is the step that executes the statement; the student is asked at runStep - 1.
 */
export function buildPrediction(model: TraceModel, runStep: number, variable: string): Prediction | null {
  if (runStep < 1 || runStep >= model.length) return null;
  const before = model.trace.steps[runStep - 1];
  const after = model.trace.steps[runStep];
  const cell = findVariable(after, variable);
  if (!cell || cell.kind !== "pointer" || cell.dangling || cell.value === "?") return null;
  const answer = heapRootOf(cell.pointsTo);
  if (cell.pointsTo && !answer) return null; // points at a stack variable: not a node question

  // Options: the nodes on screen before the statement runs, plus nullptr.
  let ids = before.heap.filter((h) => h.kind === "object").map((h) => h.id);
  if (answer && !ids.includes(answer)) ids.push(answer);
  if (ids.length > MAX_OPTIONS) {
    const keep = new Set<string>(answer ? [answer] : []);
    const now = heapRootOf(findVariable(before, variable)?.pointsTo);
    if (now) keep.add(now);
    for (const id of ids) { if (keep.size >= MAX_OPTIONS) break; keep.add(id); }
    ids = ids.filter((id) => keep.has(id));
  }
  const options: PredictionOption[] = ids.map((id) => ({ id, label: model.nameOf(id) }));
  options.push({ id: null, label: "nullptr (nothing)" });

  const statement = (model.trace.source[after.sourceLine - 1] ?? "").trim();
  return {
    variable,
    statement,
    question: `Before this line runs: where will \`${variable}\` point after \`${statement}\`?`,
    options,
    answer,
    revealStep: runStep,
  };
}

/** Place every checkpoint of a lesson on the trace of its program. */
export function resolveLesson(lesson: Lesson, model: TraceModel): ResolvedLesson {
  const problems: string[] = [];
  const checkpoints: ResolvedCheckpoint[] = [];
  const source = model.trace.source.map((l) => l.trim());

  lesson.checkpoints.forEach((cp, index) => {
    const where = `checkpoint ${index + 1}`;
    let line = cp.line ?? 0;
    if (cp.at !== undefined) {
      const wanted = cp.at.trim();
      const matches = source.flatMap((l, i) => (l === wanted ? [i + 1] : []));
      const loose = matches.length > 0 ? matches : source.flatMap((l, i) => (l.includes(wanted) ? [i + 1] : []));
      if (loose.length === 0) { problems.push(`${where}: no line reads "${wanted}".`); return; }
      if (loose.length > 1) { problems.push(`${where}: "${wanted}" appears on lines ${loose.join(", ")}. Use "line" to choose one.`); return; }
      line = loose[0];
    }
    const runs = model.stepsOnLine(line).filter((s) => model.trace.steps[s].kind !== "call");
    const occurrence = cp.occurrence ?? 1;
    // A statement that calls a function has several steps on its line; its last one is when it is complete.
    const groups: number[][] = [];
    for (const s of runs) {
      const last = groups[groups.length - 1];
      const sameStatement = last && model.trace.steps.slice(last[last.length - 1] + 1, s).every((mid) => mid.stack.length > model.trace.steps[s].stack.length);
      if (sameStatement) last.push(s);
      else groups.push([s]);
    }
    const group = groups[occurrence - 1];
    if (!group) { problems.push(`${where}: line ${line} runs ${groups.length} time(s), so there is no run number ${occurrence}.`); return; }
    const done = group[group.length - 1];

    let prediction: Prediction | null = null;
    if (cp.predict) {
      prediction = buildPrediction(model, done, cp.predict);
      if (!prediction) { problems.push(`${where}: cannot ask about "${cp.predict}" on line ${line} (it is not a pointer to a node there).`); return; }
    }
    checkpoints.push({
      index,
      step: prediction ? done - 1 : done,
      line,
      title: cp.title ?? `Step ${index + 1} of ${lesson.checkpoints.length}`,
      text: cp.text,
      prediction,
    });
  });

  for (let i = 1; i < checkpoints.length; i++) {
    if (checkpoints[i].step < checkpoints[i - 1].step) {
      problems.push(`checkpoint ${checkpoints[i].index + 1} comes before checkpoint ${checkpoints[i - 1].index + 1} in the run. Put them in running order.`);
    }
  }
  return { lesson, checkpoints, problems };
}
