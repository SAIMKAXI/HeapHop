// HeapHop for VS Code: the extension side. It opens the HeapHop panel beside a C++ file,
// sends the file's code to it, and shows in the real editor what the panel is showing:
// the line of the current step, the line that called it, and problems.
//
// The program itself is run inside the panel (in a Web Worker), never here.
import * as vscode from "vscode";
import { isFromPanel, type FromPanel, type RunSummary, type ToPanel } from "./protocol";
import { isCppDocument, makeNonce, panelHtml, problemsFor } from "./logic";

const VIEW_TYPE = "heaphop.visualizer";
const INPUT_KEY = (uri: vscode.Uri) => `heaphop.input:${uri.toString()}`;

interface StepMark {
  line: number;
  callerLine: number | null;
  error: boolean;
}

const basename = (uri: vscode.Uri) => uri.path.split("/").pop() ?? "file";
const setting = <T>(name: string, fallback: T): T => vscode.workspace.getConfiguration("heaphop").get<T>(name, fallback);

class HeapHop implements vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;
  private panelDisposables: vscode.Disposable[] = [];
  /** The file the panel shows. */
  private uri: vscode.Uri | null = null;
  private ready = false;
  private runId = 0;
  /** A run asked for before the panel finished loading. */
  private pending: ToPanel | null = null;
  private step: StepMark | null = null;
  private lastFocus: number | null = null;
  private readonly problems = vscode.languages.createDiagnosticCollection("heaphop");
  private readonly marks: { current: vscode.TextEditorDecorationType; caller: vscode.TextEditorDecorationType; error: vscode.TextEditorDecorationType };

  constructor(private readonly context: vscode.ExtensionContext) {
    const icon = (name: string) => vscode.Uri.joinPath(context.extensionUri, "media", name);
    this.marks = {
      current: vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: new vscode.ThemeColor("heaphop.currentLineBackground"),
        overviewRulerColor: new vscode.ThemeColor("heaphop.currentLineBackground"),
        overviewRulerLane: vscode.OverviewRulerLane.Full,
        gutterIconPath: icon("current-line.png"),
        gutterIconSize: "contain",
      }),
      caller: vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: new vscode.ThemeColor("heaphop.callerLineBackground"),
        after: { contentText: "   ← called from here", color: new vscode.ThemeColor("editorCodeLens.foreground"), fontStyle: "italic" },
      }),
      error: vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: new vscode.ThemeColor("heaphop.errorLineBackground"),
        overviewRulerColor: new vscode.ThemeColor("editorError.foreground"),
        overviewRulerLane: vscode.OverviewRulerLane.Full,
        gutterIconPath: icon("error-line.png"),
        gutterIconSize: "contain",
      }),
    };
  }

  // ---- commands -------------------------------------------------------------

  visualizeActive() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("Open a C++ file first, then run \"HeapHop: Visualize Current File\".");
      return;
    }
    const doc = editor.document;
    if (!isCppDocument(doc.languageId, doc.fileName)) {
      void vscode.window.showWarningMessage(`HeapHop visualizes C++ programs, and ${basename(doc.uri)} is not a C++ file.`);
      return;
    }
    this.show(doc);
  }

  async rerun() {
    const doc = await this.document();
    if (doc) this.run(doc);
    else void vscode.window.showInformationMessage("Open the HeapHop panel first with \"HeapHop: Visualize Current File\".");
  }

  /** Called by VS Code after a reload, for a panel that was open before. */
  async restore(panel: vscode.WebviewPanel, state: unknown) {
    this.attach(panel);
    const saved = typeof state === "object" && state !== null ? (state as { uri?: unknown }).uri : undefined;
    if (typeof saved !== "string") return;
    try {
      this.uri = vscode.Uri.parse(saved, true);
      const doc = await vscode.workspace.openTextDocument(this.uri);
      panel.title = `HeapHop: ${basename(doc.uri)}`;
      this.run(doc);
    } catch {
      this.uri = null; // the file is gone; the panel shows its waiting message
    }
  }

  // ---- the panel --------------------------------------------------------------

  private show(doc: vscode.TextDocument) {
    if (this.uri && this.uri.toString() !== doc.uri.toString()) this.clearFile();
    this.uri = doc.uri;
    if (this.panel) {
      this.panel.reveal(undefined, true);
    } else {
      const panel = vscode.window.createWebviewPanel(VIEW_TYPE, "HeapHop", { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.webviewRoot()],
      });
      this.attach(panel);
    }
    this.panel!.title = `HeapHop: ${basename(doc.uri)}`;
    this.run(doc);
  }

  private webviewRoot() {
    return vscode.Uri.joinPath(this.context.extensionUri, "media", "webview");
  }

  private attach(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.ready = false;
    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "media", "icon.png");
    panel.webview.options = { enableScripts: true, localResourceRoots: [this.webviewRoot()] };
    const asset = (name: string) => panel.webview.asWebviewUri(vscode.Uri.joinPath(this.webviewRoot(), name)).toString();
    panel.webview.html = panelHtml({ cspSource: panel.webview.cspSource, nonce: makeNonce(), scriptUri: asset("main.js"), styleUri: asset("main.css") });
    this.panelDisposables.push(
      panel.webview.onDidReceiveMessage((m) => this.onMessage(m)),
      panel.onDidDispose(() => this.detach()),
    );
    void vscode.commands.executeCommand("setContext", "heaphop.panelOpen", true);
  }

  private detach() {
    this.panel = null;
    this.ready = false;
    this.pending = null;
    this.panelDisposables.forEach((d) => d.dispose());
    this.panelDisposables = [];
    this.clearFile();
    this.uri = null;
    void vscode.commands.executeCommand("setContext", "heaphop.panelOpen", false);
  }

  /** Forget the marks and problems shown for the current file. */
  private clearFile() {
    this.step = null;
    this.lastFocus = null;
    if (this.uri) this.problems.delete(this.uri);
    this.decorate();
  }

  private post(message: ToPanel) {
    if (!this.panel) return;
    if (!this.ready) {
      if (message.type === "run") this.pending = message;
      return;
    }
    void this.panel.webview.postMessage(message);
  }

  private run(doc: vscode.TextDocument) {
    this.runId++;
    this.step = null;
    this.decorate();
    const input = this.context.workspaceState.get<string>(INPUT_KEY(doc.uri), "");
    this.post({ type: "run", runId: this.runId, code: doc.getText(), input, fileName: basename(doc.uri), fileUri: doc.uri.toString() });
  }

  private async document(): Promise<vscode.TextDocument | null> {
    if (!this.uri) return null;
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === this.uri!.toString());
    if (open) return open;
    try { return await vscode.workspace.openTextDocument(this.uri); } catch { return null; }
  }

  private onMessage(raw: unknown) {
    if (!isFromPanel(raw)) return;
    const m: FromPanel = raw;
    switch (m.type) {
      case "ready":
        this.ready = true;
        if (this.pending) { const p = this.pending; this.pending = null; this.post(p); }
        return;
      case "step":
        if (m.runId !== this.runId) return;
        this.step = { line: m.line, callerLine: m.callerLine, error: m.error };
        this.decorate();
        this.revealStep();
        return;
      case "result":
        if (m.runId === this.runId) this.report(m.summary);
        return;
      case "input":
        if (this.uri) void this.context.workspaceState.update(INPUT_KEY(this.uri), m.text);
        return;
      case "rerun":
        void this.rerun();
        return;
      case "reveal":
        void this.reveal(m.line);
        return;
    }
  }

  // ---- the editor -------------------------------------------------------------

  private editorsOfFile(): readonly vscode.TextEditor[] {
    if (!this.uri) return [];
    const key = this.uri.toString();
    return vscode.window.visibleTextEditors.filter((e) => e.document.uri.toString() === key);
  }

  private lineRange(doc: vscode.TextDocument, line: number): vscode.Range | null {
    if (line < 1 || line > doc.lineCount) return null;
    return doc.lineAt(line - 1).range;
  }

  /** Mark the current step's line, its caller's line and a crash line in every editor showing the file. */
  decorate() {
    const on = setting("highlightLines", true);
    for (const editor of vscode.window.visibleTextEditors) {
      const mine = on && this.step && this.uri && editor.document.uri.toString() === this.uri.toString();
      const at = (line: number | null | undefined) => {
        const r = mine && line ? this.lineRange(editor.document, line) : null;
        return r ? [r] : [];
      };
      const s = mine ? this.step! : null;
      editor.setDecorations(this.marks.current, s && !s.error ? at(s.line) : []);
      editor.setDecorations(this.marks.error, s && s.error ? at(s.line) : []);
      editor.setDecorations(this.marks.caller, s && s.callerLine && s.callerLine !== s.line ? at(s.callerLine) : []);
    }
  }

  /** Scroll an editor only when the current line is out of sight. Focus stays where it is. */
  private revealStep() {
    if (!this.step || !setting("highlightLines", true)) return;
    for (const editor of this.editorsOfFile()) {
      const r = this.lineRange(editor.document, this.step.line);
      if (r && !editor.visibleRanges.some((v) => v.contains(r))) editor.revealRange(r, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
  }

  private async reveal(line: number) {
    const doc = await this.document();
    if (!doc) return;
    const r = this.lineRange(doc, line);
    if (!r) return;
    const visible = this.editorsOfFile()[0];
    const editor = await vscode.window.showTextDocument(doc, { viewColumn: visible?.viewColumn ?? vscode.ViewColumn.One, preserveFocus: false });
    editor.selection = new vscode.Selection(r.start, r.start);
    editor.revealRange(r, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  /** The editor's cursor moved in the visualized file: mark the steps of that line. */
  onCursor(e: vscode.TextEditorSelectionChangeEvent) {
    if (!this.panel || !this.uri || e.textEditor.document.uri.toString() !== this.uri.toString()) return;
    if (e.kind !== vscode.TextEditorSelectionChangeKind.Mouse && e.kind !== vscode.TextEditorSelectionChangeKind.Keyboard) return;
    if (!setting("followCursor", true)) return;
    const line = e.selections[0].active.line + 1;
    if (line === this.lastFocus) return;
    this.lastFocus = line;
    this.post({ type: "focusLine", line });
  }

  onSave(doc: vscode.TextDocument) {
    if (this.panel && this.uri && doc.uri.toString() === this.uri.toString() && setting("runOnSave", true)) this.run(doc);
  }

  /** Put the run's problems (unsupported code, a crash, a cut-off run) in the Problems panel. */
  private async report(summary: RunSummary) {
    const uri = this.uri;
    if (!uri) return;
    if (!setting("showProblems", true)) { this.problems.delete(uri); return; }
    const doc = await this.document();
    if (!doc || this.uri?.toString() !== uri.toString()) return;
    const severity = { error: vscode.DiagnosticSeverity.Error, warning: vscode.DiagnosticSeverity.Warning, information: vscode.DiagnosticSeverity.Information };
    const list = problemsFor(summary, this.step?.line ?? null).flatMap((p) => {
      const line = this.lineRange(doc, p.line);
      if (!line) return [];
      const text = doc.lineAt(p.line - 1);
      const range = new vscode.Range(p.line - 1, text.firstNonWhitespaceCharacterIndex, p.line - 1, line.end.character);
      const d = new vscode.Diagnostic(range, p.message, severity[p.severity]);
      d.source = "HeapHop";
      return [d];
    });
    this.problems.set(uri, list);
  }

  onSettingsChanged(e: vscode.ConfigurationChangeEvent) {
    if (!e.affectsConfiguration("heaphop")) return;
    this.decorate();
    if (!setting("showProblems", true) && this.uri) this.problems.delete(this.uri);
  }

  dispose() {
    this.panel?.dispose();
    this.problems.dispose();
    Object.values(this.marks).forEach((d) => d.dispose());
  }
}

export function activate(context: vscode.ExtensionContext) {
  const heaphop = new HeapHop(context);
  context.subscriptions.push(
    heaphop,
    vscode.commands.registerCommand("heaphop.visualize", () => heaphop.visualizeActive()),
    vscode.commands.registerCommand("heaphop.rerun", () => heaphop.rerun()),
    vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, { deserializeWebviewPanel: (panel, state) => heaphop.restore(panel, state) }),
    vscode.workspace.onDidSaveTextDocument((doc) => heaphop.onSave(doc)),
    vscode.window.onDidChangeTextEditorSelection((e) => heaphop.onCursor(e)),
    vscode.window.onDidChangeVisibleTextEditors(() => heaphop.decorate()),
    vscode.workspace.onDidChangeConfiguration((e) => heaphop.onSettingsChanged(e)),
  );
}

export function deactivate() {}
