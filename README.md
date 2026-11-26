# HeapHop

HeapHop shows what a C++ program does to memory, one statement at a time. Paste a
linked-list program, press Run, and step through it: the stack frames, every node on the
heap and every pointer between them change as the program runs. Click a node or a pointer
to read its story: where it was created, who points at it now, and which line changed it.

It runs entirely in the browser. Nothing is sent to a server.

**Use HeapHop here: [heaphop.vercel.app](https://heaphop.vercel.app)**. It is free and needs no account.

HeapHop is a Data Structures semester project at Air University (BS Cybersecurity,
3rd semester). It is also a **VS Code extension** that shows the same view next to your code
(see [The VS Code extension](#the-vs-code-extension)).

## The site

| Page | What it is for |
| --- | --- |
| `/` | What HeapHop does, with a live demo, and the way into Learn or the Editor |
| `/learn` | Guided lessons on linked lists and trees, and ready-made programs to step through. A lesson has its own address, such as `/learn?lesson=build-a-bst`, so it can be shared |
| `/editor` | Your own programs: write, run, and step through them. Starts with a blank starter program, then remembers your work in the browser |
| `/faq`, `/about`, `/privacy` | Questions and answers, the team, and what is (and is not) stored |
| `/supported` | The part of C++ HeapHop runs, built from `docs/SUBSET.md` |

## The VS Code extension

The extension opens the HeapHop picture in a panel beside any C++ file. It has the
visualizer only: no lessons and no account.

- **HeapHop: Visualize Current File** (Ctrl+Alt+H, or the button at the top right of a `.cpp`
  editor) runs the file and opens the panel. Saving the file runs it again.
- The editor follows the panel: the line of the current step and the line that called it are
  highlighted, and putting the cursor on a line marks the steps that ran it.
- Code HeapHop cannot run and the line where a program crashed are underlined and listed in
  the Problems panel.
- A **Program input** box for `cin`. It follows the VS Code theme (light, dark, high contrast).
- On top of everything the website runs, the extension runs the rest of the C++ that
  data-structure courses use: the standard containers (`vector`, `list`, `deque`, `stack`,
  `queue`, `priority_queue`, `pair`, `map`, `set`) and `<algorithm>`, templates, inheritance
  and `virtual` functions, operator overloading, `try` / `catch`, lambdas, pointer
  arithmetic, classes declared inside a class, `long long` / `unsigned` / `size_t`, `enum`,
  `static`, default arguments, `<cmath>`, `<cctype>`, `rand()` and `<iomanip>`. A program may
  print 50,000 characters there (20,000 on the website). A `std::list` is drawn as the doubly
  linked list of nodes it really is, an adjacency list (`vector<int> adj[V]`) as a graph, a
  `priority_queue` with its heap tree.
- None of this changes the website: the extra C++ is switched on only by the extension.

Its code lives in [`vscode-extension/`](vscode-extension/). Building, trying and publishing
it are explained in [vscode-extension/PUBLISHING.md](vscode-extension/PUBLISHING.md).

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
- **A robot helper.** Stepping one line at a time, a small robot acts out what the line did:
  it drags a pointer's arrow to its new node, brings new nodes in, carries deleted ones
  away, and follows `cur` from node to node. In trees it flies on rocket boots and returns to its corner after each move.
- **Zoom, pan and fullscreen** on the heap, and a layout that also works on a phone.

The supported part of C++ is listed in [docs/SUBSET.md](docs/SUBSET.md) and on the site's
"What C++ is supported" page. Anything outside it stops with a message that names the line.

## How it is built

```
src/core/        the interpreter, the trace model, list and tree recognition,
                 explanations and lessons. Plain TypeScript: no React, no browser APIs
src/layout/      pure functions: one step in, node positions and arrow paths out
src/runtime/     runs the interpreter in a Web Worker, with a time limit
src/ui/          React components
src/app/         the Next.js website: landing, Learn, Editor, FAQ, About, Privacy, Supported
src/standalone/  the same interface as one script file, used to check it in a locked-down page
content/         examples, lessons (linked lists and trees), glossary
vscode-extension/ the VS Code extension: its commands, editor highlights and panel. The
                 engine and the picture come from src/, so both always show the same thing
tests/           unit tests, browser tests, and the C++ test programs with their g++ output
docs/SUBSET.md   the supported part of C++ (also shown on the site)
```

The program is interpreted once, in a Web Worker, into a list of snapshots. After that,
stepping only moves an index, so the page never waits.

Built with Next.js 16, React 19, TypeScript 6 and Tailwind CSS 4.

## Inspiration

Design ideas were taken from [See++](https://seepluspl.us) and Python Tutor.

## License

Copyright © 2026 the HeapHop team: M. Saim, Yemna Khan, Muhammad Musa, Eeman Athar Malik
and Syeda Nazalia Zehra. All rights reserved.

HeapHop is **not open source**. The code is public so that it can be read, but no license
is granted to use it. Without written permission from the team, you may not:

- download, copy or reuse this code, in whole or in part, in your own projects;
- modify it, or publish, host or distribute it, or anything made from it;
- sell it, submit it as your own work, or claim it as your own.

**To use HeapHop, use the website: [heaphop.vercel.app](https://heaphop.vercel.app).** It is
free for everyone.

Because this repository is public on GitHub, GitHub's Terms of Service let other GitHub users
view it and fork it on GitHub. A fork gives no other rights: everything above still applies
to it.

To ask for permission, contact the team through this repository.
