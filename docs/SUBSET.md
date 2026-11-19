# Supported C++ subset

HeapHop does not compile C++. It interprets a defined subset, chosen from the programs
in `tests/fixtures/`. Anything outside the subset must produce a readable error with a
line number, never a wrong picture (rule 7).

Status column: **yes** = works and is tested, **no** = not in v1 (gives an
"is not supported yet" error with the line number).

Version: v2 (16 Nov 2026). 28 fixtures print exactly what `g++` prints: 18 starter
programs, 9 taken from the team's real lab reports (labs 3, 6, 7 and 9) and the Lab 9
manual's own AVL listing.

## Program structure
| Construct | Example | Status |
| --- | --- | --- |
| `#include`, `using namespace std;` | `#include <iostream>` | yes (ignored) |
| `int main() { ... return 0; }` | | yes |
| Free functions, recursion | `int length(Node* n)` | yes |
| Pass by value and by reference | `void push(Node*& head, int v)` | yes |
| Function prototypes | `void display(Node* head);` | yes |
| Global variables | `Node* head = NULL;` at file level | yes |
| Multiple files, headers of your own | `#include "list.h"` | no |

## Types
| Construct | Example | Status |
| --- | --- | --- |
| `int`, `bool`, `char`, `double`, `float` | | yes |
| `string` | `string name;` | yes (assign, compare, print, `+`, `.length()`, `.size()`, `.empty()`, reading one character with `s[i]`; changing one character is not supported yet) |
| Pointers | `Node* p`, `Node *p`, `int* q` | yes |
| Pointer to pointer | `void push(Node** headRef, int v)`, `*headRef = n;` | yes |
| `#define SIZE 100` | used as an array size or a number | yes (numeric constants only) |
| `struct` with fields | `struct Node { int data; Node* next; };` | yes |
| `typedef struct { ... } Node;` | | yes |
| Constructors with initialiser list or body | `Node(int d) : data(d), next(nullptr) {}` | yes |
| `class`, `public:`, `private:`, `protected:` | `class LinkedList { ... };` | yes |
| Member functions, `this` | `list.insertAtEnd(5)`, `this->head` | yes |
| Methods defined outside the class | `void LinkedList::display() { ... }` | yes |
| Destructors | `~LinkedList() { ... }` | yes |
| Objects on the stack | `LinkedList list;` | yes |
| Fixed-size arrays, `new T[n]`, `delete[]` | `int a[5];` | yes |
| Arrays passed to functions, pointers set to an array | `void sort(int a[], int n)`, `int* p = arr;` | yes (the function works on the caller's array) |
| `const` | `const int MAX = 5;` | yes (accepted, not enforced) |
| Templates | `template <class T> class Node` | no (none of the lab files use them) |
| `public:` / `private:` access rules | | accepted, not enforced (HeapHop assumes the code already compiles) |
| Member objects that have their own constructor | `class A { B b; };` | no (use a pointer member) |
| Inheritance, virtual functions | | no |
| Operator overloading, friend functions | | no |
| STL containers | `vector`, `list`, `stack`, `queue` | no |
| References as variables | `int& r = x;` | no (reference parameters work) |

## Statements
| Construct | Status |
| --- | --- |
| Declarations with or without initialiser | yes |
| Several declarators in one statement (`Node *a, *b;`) | yes |
| Assignment, `+=`, `-=` | yes, also `*=`, `/=`, `%=` |
| `if` / `else if` / `else` | yes |
| `while`, `for` | yes |
| `do ... while` | yes |
| `switch` / `case` / `default` | yes |
| `break`, `continue` | yes |
| `return` | yes |
| `new`, `delete` | yes |
| `cout << ... << endl;` | yes, with exact newlines |
| `cin >> x;`, `getline(cin, s);`, `cin.ignore();` | yes. The student types everything the program will read into the "Program input" box before running. Running out of input, or text where a number is expected, stops the trace with a notice |
| `goto`, exceptions (`try`/`catch`) | no |

## Expressions
| Construct | Status |
| --- | --- |
| `+ - * / %`, comparisons, `&& || !` | yes |
| `++x`, `x++`, `--x`, `x--` | yes |
| `p->field`, `obj.field`, `*p`, `&x`, `a[i]` | yes |
| `nullptr`, `NULL`, `true`, `false`, integers | yes |
| Library functions `max(a, b)`, `min(a, b)`, `abs(x)`, `swap(a, b)` | yes (a program's own function of the same name wins) |
| Character literals (`'a'`), decimal numbers (`3.5`) | yes |
| String literals with escapes (`"a\n"`) | yes |
| Ternary `c ? a : b` | yes |
| Chained assignment (`head = tail = n;`) | yes |
| Pointer arithmetic (`p++`, `p + 1`), comparing pointers with `<` | no (use `p[i]` or `p = p->next`) |
| `sizeof`, casts, bitwise operators, the comma operator | no |

## Runtime behaviour HeapHop shows on purpose
| Situation | What HeapHop does | Status |
| --- | --- | --- |
| Following a null pointer | Stops with an error step at that line; earlier steps stay | yes |
| Using an object after `delete` | Error step "use after delete" | yes |
| `delete` twice | Error step "double delete" | yes |
| A variable used before it has a value | Shown as `?`; following such a pointer is an error step | yes |
| A node no pointer can reach | Marked as leaked | yes |
| Very long runs or infinite loops | Trace is cut at a limit with a "trace truncated" notice | yes |

## Structures HeapHop recognises and draws specially
| Structure | How it is recognised | Drawn as |
| --- | --- | --- |
| Singly, doubly, circular linked list | one self-pointer; or two that mirror each other | one horizontal row |
| Binary tree (BST, AVL) | two self-pointers that do not mirror each other (`left` / `right`) | parents above children |
| Array-based stack or queue | not recognised as a structure | the array inside its object, in the stack panel |

## Step limits
A trace stops with a "trace truncated" notice at 2000 steps, 500 rounds of one loop,
64 nested calls, 500 live heap objects or 20000 printed characters.

## Known difference from a real compiler
Real C++ gives unpredictable results for the mistakes above (it may crash, or appear to
work). HeapHop always stops and explains, because that is more useful for learning.
