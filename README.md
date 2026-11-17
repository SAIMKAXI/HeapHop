# HeapHop

HeapHop shows what a C++ program does to memory, one statement at a time. Paste a
linked-list program, press Run, and step through it: the stack frames, every node on the
heap and every pointer between them change as the program runs. Click a node or a pointer
to read its story: where it was created, who points at it now, and which line changed it.

It runs entirely in the browser. Nothing is sent to a server.

HeapHop is a Data Structures semester project at Air University (BS Cybersecurity,
3rd semester). A VS Code extension that shows the same view next to your code is planned.

## The site

| Page | What it is for |
| --- | --- |
| `/` | What HeapHop does, with a live demo, and the way into Learn or the Editor |
| `/learn` | Guided lessons on linked lists and trees, and ready-made programs to step through. A lesson has its own address, such as `/learn?lesson=build-a-bst`, so it can be shared |
| `/editor` | Your own programs: write, run, and step through them. Starts with a blank starter program, then remembers your work in the browser |
| `/faq`, `/about`, `/privacy` | Questions and answers, the team, and what is (and is not) stored |
| `/supported` | The part of C++ HeapHop runs, built from `docs/SUBSET.md` |

## What it does

- **Runs real lab programs.** Structs and classes, constructors and destructors, pointers
  and pointers to pointers, `new` and `delete`, arrays, recursion, `switch`, `do while`,
  `cout`, and `cin` with typed-in input. 27 test programs print exactly what `g++` prints.
- **Draws linked lists the way they are taught.** Singly, doubly and circular lists are
  laid out in one row with `head`, `tail` and `cur` shown on the node they point at.
  Binary trees are drawn as trees. Nodes keep their place while a list is rewired, so
  reversing a list turns the arrows around instead of shuffling the boxes.
- **Explains every step** in plain words, built from what the program actually did:
  "head moves along next from Node #1 to Node #2."
- **Inspector.** Click a node, a pointer, or a line of code to see its history and jump to
  any moment in it.
- **Shows mistakes honestly.** A null dereference, a use after `delete`, a double
  `delete` or a pointer that was never set stops the trace at that line with an
  explanation. Every earlier step stays visible. Lost nodes are marked as leaked.
- **Steps both ways.** The whole run is recorded first, so going back is as reliable as
  going forward. A timeline, auto-play and "step over" are there too.
- **Guided lessons** on linked lists (walk, insert at the front, delete safely, reverse) and
  trees (build a BST, search it, in-order traversal, an AVL rotation), with prediction
  questions: "where will `cur` point after this line?" The right answer is read from the
  program's own run.
- **Zoom, pan and fullscreen** on the heap, and a layout that also works on a phone.

The supported part of C++ is listed in [docs/SUBSET.md](docs/SUBSET.md) and on the site's
"What C++ is supported" page. Anything outside it stops with a message that names the line.

## Run it on your computer

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm ci
npm run dev
```

Then open http://localhost:3000.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | The website with live reload |
| `npm run build` | The website as static files in `out/` |
| `npm run check` | Everything below, in order. Must pass before a change is merged |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run boundaries` | Checks that the folders only import what they are allowed to |
| `npm test` | 255 unit tests: interpreter, trace model, layout, explanations, lessons, editor |
| `npm run e2e` | 36 browser tests of every use case (run `npm run build` first; needs Chrome) |
| `npm run webview:check` | Loads the interface under the strict security rules of a VS Code webview |
| `npm run fixtures` | Compares the interpreter with the saved `g++` output of every test program |
| `npm run bench` | Interpreter speed against its time budgets |
| `npm run perf` | Stepping and zoom speed in Chrome; add `-- --headed` to use a visible window |

### Testing in other browsers

The browser tests use Chrome unless told otherwise.

| Browser | macOS / Linux | Windows (PowerShell) |
| --- | --- | --- |
| Firefox | `BROWSER=firefox npm run e2e` | `$env:BROWSER="firefox"; npm run e2e` |
| Edge | `CHROME_PATH=/path/to/msedge npm run e2e` | `$env:CHROME_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"; npm run e2e` |

Set `FIREFOX_PATH` or `CHROME_PATH` if the browser is installed somewhere unusual.

## Putting it online

The site is plain static files, so any free static host works. On Vercel: sign in with
GitHub, choose "Add New Project", import this repository and keep the detected Next.js
settings. Every push to `main` then updates the site.

## How it is built

```
src/core/        the interpreter, the trace model, list and tree recognition,
                 explanations and lessons. Plain TypeScript: no React, no browser APIs
src/layout/      pure functions: one step in, node positions and arrow paths out
src/runtime/     runs the interpreter in a Web Worker, with a time limit
src/ui/          React components
src/app/         the Next.js website: landing, Learn, Editor, FAQ, About, Privacy, Supported
src/standalone/  the same interface as one script file, for the VS Code webview
content/         examples, lessons (linked lists and trees), glossary
tests/           unit tests, browser tests, and the C++ test programs with their g++ output
docs/SUBSET.md   the supported part of C++ (also shown on the site)
```

The program is interpreted once, in a Web Worker, into a list of snapshots. After that,
stepping only moves an index, so the page never waits.

Built with Next.js 16, React 19, TypeScript 6 and Tailwind CSS 4.

## Inspiration

Design ideas were taken from [See++](https://seepluspl.us) and Python Tutor. No code
from them is used.
