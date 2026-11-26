# Changelog

## 1.1.1

- The pictures on the Marketplace page show again.

## 1.1.0

Much more of the C++ that data-structure courses use:

- `vector` (also 2-D, and `vector<int> adj[V]` drawn as a graph), `stack`, `queue`,
  `priority_queue` (drawn with its heap tree), `deque`, `pair`, `map` and `set`.
- `<algorithm>`: `sort` (comparing in exactly the order g++'s library does), `reverse`,
  `find`, `max_element`, `binary_search`, `lower_bound`, `next_permutation`, `accumulate`...
  with functions, lambdas and `greater<T>()`.
- Templates (function and class templates), inheritance with `virtual` functions and
  abstract classes, operator overloading, `try` / `catch` / `throw`.
- Classes declared inside a class, such as `class AVLTREE { struct Node { ... }; ... }`;
  their nodes are called `Node #1`, `Node #2`...
- Pointer arithmetic on arrays, `sizeof`, casts, `INT_MAX` / `INT_MIN`, `long long`,
  `unsigned`, `size_t`, `enum`, `static` variables, default arguments, `while (cin >> x)`,
  changing a character of a string, `<cmath>`, `<cctype>`, `rand()` (the same numbers as g++ on
  Linux), `exit()`, `fixed` / `setprecision` / `setw`.
- A program may print up to 50,000 characters (the website keeps 20,000).

## 1.0.0

First release.

- The HeapHop panel beside any C++ file: stack, heap, nodes and pointer arrows, step by step,
  with explanations, the inspector, zoom, pan and fullscreen.
- The editor follows the panel: the current line and its caller's line are highlighted, and
  the cursor's line marks its steps on the timeline.
- Runs again on every save and keeps your place.
- Program input for `cin`.
- Unsupported code and crash lines are underlined and listed in the Problems panel.
- `std::list`, its iterators, `auto` and range-based `for`. Arrays of lists are drawn as
  adjacency lists and graphs.
- Follows the VS Code theme (light, dark and high contrast).
