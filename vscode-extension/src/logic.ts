// The parts of the extension that do not need VS Code itself, so they can be tested alone.
import { randomBytes } from "node:crypto";
import type { RunSummary } from "./protocol";

/** Languages and file endings HeapHop offers to visualize. */
const CPP_LANGUAGES = new Set(["cpp", "c"]);
const CPP_FILE = /\.(cpp|cc|cxx|c\+\+|c|h|hpp|hh)$/i;

export function isCppDocument(languageId: string, fileName: string): boolean {
  return CPP_LANGUAGES.has(languageId) || CPP_FILE.test(fileName);
}

/** One entry for the Problems panel. Lines are 1-based, as HeapHop reports them. */
export interface Problem {
  line: number;
  message: string;
  severity: "error" | "warning" | "information";
}

/**
 * What a run should put in the Problems panel:
 *  - code HeapHop cannot run: an error on its line;
 *  - a crash while running (null pointer, use after delete...): a warning on that line;
 *  - a run cut short by a limit: an information note on the last line it reached.
 */
export function problemsFor(summary: RunSummary, lastLine: number | null): Problem[] {
  if (!summary.ok) {
    if (summary.kind === "cancelled") return [];
    const line = summary.line ?? 1;
    const message = summary.message.replace(/^Line \d+: /, "");
    return [{ line, message: `HeapHop: ${message}`, severity: summary.kind === "timeout" || summary.kind === "internal" ? "warning" : "error" }];
  }
  if (summary.status === "error" && summary.errorLine) {
    return [{ line: summary.errorLine, message: `HeapHop: the program stops here. ${summary.errorMessage ?? summary.notice ?? ""}`.trim(), severity: "warning" }];
  }
  if (summary.status === "truncated" && summary.notice) {
    const line = summary.errorLine ?? (lastLine && lastLine > 0 ? lastLine : 1);
    return [{ line, message: `HeapHop: ${summary.notice}`, severity: "information" }];
  }
  return [];
}

export function makeNonce(): string {
  return randomBytes(18).toString("base64").replace(/[+/=]/g, "");
}

/**
 * The panel's page. Nothing loads unless it is listed in the security policy: the
 * extension's own script and stylesheet, and the Worker started from a blob.
 */
export function panelHtml(o: { cspSource: string; nonce: string; scriptUri: string; styleUri: string }): string {
  const policy = [
    "default-src 'none'",
    `script-src 'nonce-${o.nonce}'`,
    `style-src ${o.cspSource}`,
    `font-src ${o.cspSource}`,
    `img-src ${o.cspSource} data:`,
    "worker-src blob:",
  ].join("; ");
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HeapHop</title>
<link rel="stylesheet" href="${o.styleUri}">
</head>
<body class="antialiased">
<div id="root"></div>
<script nonce="${o.nonce}" src="${o.scriptUri}"></script>
</body>
</html>
`;
}
