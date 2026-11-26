// The algorithms of <algorithm> and the heap of std::priority_queue, written step for step
// as libstdc++ (g++'s library) writes them. The order in which elements are compared and
// moved is the same, so a program whose comparator ties or prints shows what g++ shows.
//
// Every function works on a plain array of values and a `less(a, b)` callback (the
// comparator: true when a goes before b).

export type Less<T> = (a: T, b: T) => boolean;

const lg = (n: number) => 31 - Math.clz32(n);
const THRESHOLD = 16;

// ---- heap (bits/stl_heap.h) ------------------------------------------------

function pushHeapAt<T>(a: T[], first: number, hole: number, top: number, value: T, less: Less<T>) {
  let parent = Math.floor((hole - 1) / 2);
  while (hole > top && less(a[first + parent], value)) {
    a[first + hole] = a[first + parent];
    hole = parent;
    parent = Math.floor((hole - 1) / 2);
  }
  a[first + hole] = value;
}

function adjustHeap<T>(a: T[], first: number, hole: number, len: number, value: T, less: Less<T>) {
  const top = hole;
  let second = hole;
  while (second < Math.floor((len - 1) / 2)) {
    second = 2 * (second + 1);
    if (less(a[first + second], a[first + second - 1])) second--;
    a[first + hole] = a[first + second];
    hole = second;
  }
  if ((len & 1) === 0 && second === Math.floor((len - 2) / 2)) {
    second = 2 * (second + 1);
    a[first + hole] = a[first + second - 1];
    hole = second - 1;
  }
  pushHeapAt(a, first, hole, top, value, less);
}

/** std::push_heap(first, last): the element at last - 1 joins the heap. */
export function pushHeap<T>(a: T[], less: Less<T>, first = 0, last = a.length) {
  if (last - first < 2) return;
  pushHeapAt(a, first, last - first - 1, 0, a[last - 1], less);
}

function popHeapAt<T>(a: T[], first: number, last: number, result: number, less: Less<T>) {
  const value = a[result];
  a[result] = a[first];
  adjustHeap(a, first, 0, last - first, value, less);
}

/** std::pop_heap(first, last): the top moves to last - 1, the rest stays a heap. */
export function popHeap<T>(a: T[], less: Less<T>, first = 0, last = a.length) {
  if (last - first > 1) popHeapAt(a, first, last - 1, last - 1, less);
}

/** std::make_heap */
export function makeHeap<T>(a: T[], less: Less<T>, first = 0, last = a.length) {
  const len = last - first;
  if (len < 2) return;
  for (let parent = Math.floor((len - 2) / 2); ; parent--) {
    adjustHeap(a, first, parent, len, a[first + parent], less);
    if (parent === 0) return;
  }
}

/** std::sort_heap */
export function sortHeap<T>(a: T[], less: Less<T>, first = 0, last = a.length) {
  while (last - first > 1) {
    last--;
    popHeapAt(a, first, last, last, less);
  }
}

// ---- std::sort (bits/stl_algo.h: introsort, then insertion sort) ------------

function swap<T>(a: T[], i: number, j: number) {
  const t = a[i]; a[i] = a[j]; a[j] = t;
}

function moveMedianToFirst<T>(a: T[], result: number, x: number, y: number, z: number, less: Less<T>) {
  if (less(a[x], a[y])) {
    if (less(a[y], a[z])) swap(a, result, y);
    else if (less(a[x], a[z])) swap(a, result, z);
    else swap(a, result, x);
  } else if (less(a[x], a[z])) swap(a, result, x);
  else if (less(a[y], a[z])) swap(a, result, z);
  else swap(a, result, y);
}

function unguardedPartition<T>(a: T[], first: number, last: number, pivot: number, less: Less<T>): number {
  for (;;) {
    while (less(a[first], a[pivot])) first++;
    last--;
    while (less(a[pivot], a[last])) last--;
    if (!(first < last)) return first;
    swap(a, first, last);
    first++;
  }
}

function introsortLoop<T>(a: T[], first: number, last: number, depth: number, less: Less<T>) {
  while (last - first > THRESHOLD) {
    if (depth === 0) {
      makeHeap(a, less, first, last); // partial_sort(first, last, last)
      sortHeap(a, less, first, last);
      return;
    }
    depth--;
    const mid = first + Math.floor((last - first) / 2);
    moveMedianToFirst(a, first, first + 1, mid, last - 1, less);
    const cut = unguardedPartition(a, first + 1, last, first, less);
    introsortLoop(a, cut, last, depth, less);
    last = cut;
  }
}

function unguardedLinearInsert<T>(a: T[], last: number, less: Less<T>) {
  const value = a[last];
  let next = last - 1;
  while (less(value, a[next])) {
    a[last] = a[next];
    last = next;
    next--;
  }
  a[last] = value;
}

function insertionSort<T>(a: T[], first: number, last: number, less: Less<T>) {
  if (first === last) return;
  for (let i = first + 1; i !== last; i++) {
    if (less(a[i], a[first])) {
      const value = a[i];
      for (let k = i; k > first; k--) a[k] = a[k - 1];
      a[first] = value;
    } else {
      unguardedLinearInsert(a, i, less);
    }
  }
}

/** std::sort(first, last, less) */
export function introsort<T>(a: T[], less: Less<T>, first = 0, last = a.length) {
  if (first === last) return;
  introsortLoop(a, first, last, lg(last - first) * 2, less);
  if (last - first > THRESHOLD) {
    insertionSort(a, first, first + THRESHOLD, less);
    for (let i = first + THRESHOLD; i !== last; i++) unguardedLinearInsert(a, i, less);
  } else {
    insertionSort(a, first, last, less);
  }
}

/** std::stable_sort: equal elements keep their order. */
export function stableSort<T>(a: T[], less: Less<T>, first = 0, last = a.length) {
  const part = a.slice(first, last);
  const sorted = mergeSort(part, less);
  for (let i = 0; i < sorted.length; i++) a[first + i] = sorted[i];
}

function mergeSort<T>(a: T[], less: Less<T>): T[] {
  if (a.length < 2) return a;
  const mid = a.length >> 1;
  const left = mergeSort(a.slice(0, mid), less);
  const right = mergeSort(a.slice(mid), less);
  const out: T[] = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) out.push(less(right[j], left[i]) ? right[j++] : left[i++]);
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return out;
}

// ---- searching and permutations ----------------------------------------------

/** std::lower_bound: the first position whose element is not less than `value`. */
export function lowerBound<T>(a: T[], value: T, less: Less<T>, first = 0, last = a.length): number {
  let len = last - first;
  while (len > 0) {
    const half = len >> 1;
    const mid = first + half;
    if (less(a[mid], value)) { first = mid + 1; len = len - half - 1; } else len = half;
  }
  return first;
}

/** std::upper_bound: the first position whose element is greater than `value`. */
export function upperBound<T>(a: T[], value: T, less: Less<T>, first = 0, last = a.length): number {
  let len = last - first;
  while (len > 0) {
    const half = len >> 1;
    const mid = first + half;
    if (less(value, a[mid])) len = half; else { first = mid + 1; len = len - half - 1; }
  }
  return first;
}

/** std::next_permutation (or prev_permutation with a reversed `less`). False when it wrapped around. */
export function nextPermutation<T>(a: T[], less: Less<T>, first = 0, last = a.length): boolean {
  if (last - first < 2) return false;
  let i = last - 1;
  for (;;) {
    const ii = i;
    i--;
    if (less(a[i], a[ii])) {
      let j = last - 1;
      while (!less(a[i], a[j])) j--;
      swap(a, i, j);
      reverse(a, ii, last);
      return true;
    }
    if (i === first) {
      reverse(a, first, last);
      return false;
    }
  }
}

export function reverse<T>(a: T[], first = 0, last = a.length) {
  for (let i = first, j = last - 1; i < j; i++, j--) swap(a, i, j);
}
