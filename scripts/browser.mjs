// Shared by the webview check, the end-to-end tests and the performance script: find a
// browser, serve a folder of static files on a free local port, and drive the editor.
//
// The end-to-end tests run in Chrome by default. Other browsers:
//   BROWSER=firefox npm run e2e                      Firefox (FIREFOX_PATH if it is not found)
//   CHROME_PATH="C:\\...\\msedge.exe" npm run e2e     Microsoft Edge
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import puppeteer from "puppeteer-core";

const FIREFOX_CANDIDATES = [
  process.env.FIREFOX_PATH,
  "/usr/bin/firefox", "/usr/bin/firefox-esr", "/snap/bin/firefox",
  "/Applications/Firefox.app/Contents/MacOS/firefox",
  "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
  "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe",
].filter(Boolean);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".woff2": "font/woff2", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain",
  ".mp4": "video/mp4", ".webp": "image/webp", ".png": "image/png",
};

export function chromePath() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) throw new Error("Chrome was not found. Install Chrome or set CHROME_PATH to its executable.");
  return found;
}

/** Which browser to test in: BROWSER=firefox selects Firefox, anything else Chrome (or Edge via CHROME_PATH). */
const useFirefox = process.env.BROWSER === "firefox";

/** Serve `dir` on 127.0.0.1. Resolves with its origin and a function that stops it. */
export async function serveStatic(dir) {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let path = normalize(join(dir, url));
    if (!path.startsWith(dir)) { res.writeHead(403).end(); return; }
    // Same order as the host: "/supported" is supported.html even though a supported/ folder exists.
    if (existsSync(`${path}.html`)) path = `${path}.html`;
    else if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
    if (!existsSync(path)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

export function launchBrowser() {
  if (useFirefox) {
    const executablePath = FIREFOX_CANDIDATES.find((p) => existsSync(p));
    if (!executablePath) throw new Error("Firefox was not found. Install it or set FIREFOX_PATH to its executable.");
    return puppeteer.launch({ browser: "firefox", executablePath, headless: true });
  }
  return puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox", "--disable-gpu"] });
}

/** Replace the editor's text the way React sees a user edit. */
export async function setEditorCode(page, code) {
  await page.evaluate((text) => {
    const area = document.querySelector("textarea[data-code-input]");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(area, text);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }, code);
}

/** Press the Run button and wait for the visualizer or an error message. */
export async function clickRun(page) {
  await page.click("[data-run]");
  await page.waitForSelector(".hh-canvas, [data-run-error]", { timeout: 15000 });
}
