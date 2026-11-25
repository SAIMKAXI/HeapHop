// The panel's link to the extension. VS Code gives each webview one API object.
import type { FromPanel } from "../src/protocol";

interface VsCodeApi {
  postMessage(message: FromPanel): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/** Outside VS Code (the panel's own browser check) a stand-in records the messages instead. */
export const host: VsCodeApi = typeof acquireVsCodeApi === "function"
  ? acquireVsCodeApi()
  : { postMessage: () => {}, getState: () => undefined, setState: () => {} };
