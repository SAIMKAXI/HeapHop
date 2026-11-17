/**
 * Import boundaries for HeapHop.
 *
 * Each folder has one job. These rules stop a file from reaching into a folder
 * it has no business knowing about, which is what keeps the modules loosely
 * coupled and easy to change one at a time.
 *
 *   src/core     pure TypeScript: interpreter, trace, indexes, structures, explanations
 *   src/layout   pure functions: a step in, coordinates out
 *   src/runtime  runProgram(code): runs the interpreter in a Web Worker
 *   src/ui       React components
 *   src/app      Next.js shell (website only)
 *   src/standalone  the same interface as one script, for the VS Code webview
 */
const FRAMEWORK = "^(react|react-dom|next)(/|$)|node_modules/(react|react-dom|next|lucide-react)/";

module.exports = {
  forbidden: [
    {
      name: "core-is-pure",
      comment: "src/core must stay plain TypeScript: no React, no Next, no other HeapHop layer.",
      severity: "error",
      from: { path: "^src/core/" },
      to: { path: [FRAMEWORK, "^src/(ui|app|standalone|runtime|layout)/"] },
    },
    {
      name: "layout-is-pure",
      comment: "src/layout is math only. It may read types and structures from src/core, nothing else.",
      severity: "error",
      from: { path: "^src/layout/" },
      to: { path: [FRAMEWORK, "^src/(ui|app|standalone|runtime)/", "^src/core/interpreter/"] },
    },
    {
      name: "runtime-has-no-ui",
      comment: "src/runtime talks to the Worker. It must not import React, Next or the interface.",
      severity: "error",
      from: { path: "^src/runtime/" },
      to: { path: [FRAMEWORK, "^src/(ui|app|standalone|layout)/"] },
    },
    {
      name: "ui-never-imports-interpreter",
      comment:
        "The interface gets traces through src/runtime and reads them through src/core/types " +
        "and the trace index. It never imports interpreter internals.",
      severity: "error",
      from: { path: "^src/(ui|app)/" },
      to: { path: "^src/core/interpreter/" },
    },
    {
      name: "interpreter-runs-only-in-the-worker",
      comment:
        "Rule 5: user code never runs on the main thread. Only the Worker entry and its " +
        "handler may import the interpreter. Everything else goes through runProgram().",
      severity: "error",
      from: { path: "^src/", pathNot: ["^src/core/interpreter/", "^src/runtime/(worker|handler)\\.ts$"] }, // includes src/core/trace
      to: { path: "^src/core/interpreter/" },
    },
    {
      name: "interpreter-is-entered-through-index",
      comment: "Outside the interpreter folder, only its index.ts (run) may be imported.",
      severity: "error",
      from: { pathNot: "^src/core/interpreter/" },
      to: { path: "^src/core/interpreter/", pathNot: "^src/core/interpreter/index\\.ts$" },
    },
    {
      name: "ui-does-not-import-app",
      comment: "Components must work in both shells (website and VS Code webview).",
      severity: "error",
      from: { path: "^src/ui/" },
      to: { path: ["^src/app/", "^src/standalone/", "^next(/|$)|node_modules/next/"] },
    },
    {
      name: "no-circular",
      comment: "A cycle between files means two modules cannot be understood or tested apart.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
