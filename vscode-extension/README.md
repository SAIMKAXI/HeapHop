# HeapHop: C++ Memory Visualizer

See what your C++ program does to memory, one statement at a time, right next to your code.
Open a `.cpp` file, press the HeapHop button, and step through the program: the stack frames,
every node on the heap and every pointer between them change as it runs, and the line that is
running is highlighted in your editor.

Made for data-structures courses: linked lists (singly, doubly, circular), stacks and queues,
binary trees and AVL trees, heaps, adjacency lists and graphs, and the standard containers
(`vector`, `list`, `stack`, `queue`, `priority_queue`, `map`, `set`, `pair`).

![A std::list drawn as nodes with prev and next arrows](media/readme/std-list.png)

## How to use it

1. Open a C++ file.
2. Press the **HeapHop** button at the top right of the editor, or press **Ctrl+Alt+H**
   (**Cmd+Alt+H** on a Mac), or run **HeapHop: Visualize Current File** from the Command Palette.
3. The HeapHop panel opens beside your code. Step with **←** and **→**, play it, or drag the timeline.

Every time you save the file, HeapHop runs it again and keeps your place.

## What you get

- **The memory picture.** Stack frames on the left; heap objects and pointer arrows on the
  canvas. Lists are drawn in one row the way they are taught, trees as trees, arrays as rows
  of cells. Zoom, pan and fullscreen.
- **Your editor follows along.** The line of the current step is highlighted, and so is the
  line that called the current function. Put the cursor on a line to mark, on the timeline,
  every step that ran it.
- **Every step explained** in plain words, built from what the program actually did:
  "`it` moves forward along `next` from node #1 to node #2."
- **Click to inspect.** Click a node or a pointer to see who points at it, where it was
  created and which line last changed it, and jump to any of those moments.
- **Mistakes shown honestly.** A null pointer, a use after `delete`, a double `delete`, an
  iterator used after `erase`: the run stops on that line with an explanation, which also
  appears in the Problems panel. Nodes nothing can reach any more are marked as leaked.
- **`cin` works.** Type what the program should read into **Program input**, then run.
- **The standard containers.** A `std::list` is drawn as what it really is: a doubly linked
  list of nodes with `prev` and `next` pointers. A `vector` is a row of cells, a 2-D vector a
  grid, and an adjacency list (`vector<int> adj[V]`, `list<int> adj[V]`) is drawn as a graph
  too. A `stack` stands upright, a `priority_queue` shows its heap as a tree, a `map` shows
  `key: value` cells.
- **Prints what g++ prints.** `sort` compares in the same order as g++'s library, a
  `priority_queue` keeps the same heap, `rand()` gives the same numbers as on Linux, and
  `fixed` / `setprecision` round the same way.

![A graph's adjacency list made of std::list, with the graph drawn beside it](media/readme/graph.png)

## Supported C++

HeapHop does not compile your code. It runs the C++ that data-structure courses use:

- `struct` and `class`: constructors (with initialiser lists and default arguments),
  destructors, member functions, `this`, `static` members, classes declared inside a class
  (`class AVLTree { struct Node { ... }; }`), operator overloading (`<`, `==`, `+`, `()` ...)
- inheritance: base-class constructors, `virtual` functions, `override`, pure virtual
  functions and abstract classes, virtual destructors
- templates: function templates and class templates (`template <typename T> class Stack`)
- pointers, pointer arithmetic on arrays (`*(p + 2)`, `p++`, `p - arr`), references,
  `new` / `delete`, `new[]` / `delete[]`
- arrays (one and two dimensions), `sizeof(arr) / sizeof(arr[0])`, recursion, `if` / `switch` /
  loops, `enum` and `enum class`, `static` variables
- `int`, `long long`, `unsigned`, `size_t`, `short`, `double`, `char`, `bool`, casts
  (`(double)x`, `static_cast<int>(x)`), `INT_MAX` / `INT_MIN` and `numeric_limits`, `typedef` / `using`
- `string` (including `s[i] = 'x'`, `push_back`, `substr`, `find`...), `<cmath>` (`sqrt`, `pow`...),
  `<cctype>` (`isdigit`, `toupper`...), `rand` / `srand`, `exit`
- `cout` with `fixed`, `setprecision`, `setw`; `cin` / `getline` with typed-in input, and
  `while (cin >> x)`
- `try` / `catch` / `throw`, with the standard exceptions (`runtime_error`, `out_of_range`...)
- `vector`, `list`, `deque`, `stack`, `queue`, `priority_queue` (with `greater<T>` or a
  comparator struct), `pair`, `map`, `set`, their iterators, `auto`, range-based `for` and
  structured bindings (`auto [u, w] = edge;`)
- `<algorithm>`: `sort`, `stable_sort`, `reverse`, `find`, `count`, `min_element` /
  `max_element`, `binary_search`, `lower_bound` / `upper_bound`, `next_permutation`,
  `accumulate`, `fill` ... with functions, lambdas or `greater<T>()` as comparators

Not supported yet: `unordered_map` / `unordered_set` (use `map` / `set`), printing an object
with your own `operator<<`, multiple inheritance, namespaces, bitwise operators, smart pointers,
`printf` / `scanf`. Code like this stops with a message that names the line, and that line is
underlined in the editor.

![An AVL tree whose Node struct is declared inside the AVLTREE class](media/readme/avl.png)

![A program stopped where an iterator is used after erase](media/readme/crash.png)

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `heaphop.runOnSave` | on | Run again and redraw every time the file is saved |
| `heaphop.highlightLines` | on | Highlight the current step's line (and its caller's line) in the editor |
| `heaphop.followCursor` | on | Mark on the timeline the steps that ran the line your cursor is on |
| `heaphop.showProblems` | on | Underline unsupported code and crash lines, and list them in the Problems panel |

The highlight colours can be changed in your settings with `workbench.colorCustomizations`:
`heaphop.currentLineBackground`, `heaphop.callerLineBackground` and `heaphop.errorLineBackground`.

## Privacy

Your code never leaves your computer. HeapHop runs it inside VS Code, in the panel, with no
network access and no account.

## The website

HeapHop is also a website, with guided lessons on lists and trees:
[heaphop.vercel.app](https://heaphop.vercel.app).

## About

HeapHop is a Data Structures semester project at Air University, Islamabad (BS Cybersecurity),
by M. Saim, Yemna Khan, Muhammad Musa, Eeman Athar Malik and Syeda Nazalia Zehra.

Copyright © 2026 the HeapHop team. All rights reserved. The extension is free to install and
use; its code may not be copied, modified or redistributed. See [LICENSE.txt](LICENSE.txt).
