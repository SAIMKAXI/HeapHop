// Glossary: one-line definitions shown when the mouse rests on a word in the code panel.
export const GLOSSARY: Record<string, string> = {
  head: "head: the pointer that holds the address of the first node. Lose it and the whole list is unreachable.",
  tail: "tail: a pointer kept on the last node so that adding at the end does not need a walk.",
  next: "next: the field inside a node that holds the address of the node after it.",
  prev: "prev: the field inside a node that holds the address of the node before it.",
  nullptr: "nullptr: the value of a pointer that points at nothing. Following it is an error.",
  NULL: "NULL: the older spelling of nullptr. A pointer that points at nothing.",
  new: "new: creates an object on the heap and gives back its address. It lives until it is deleted.",
  delete: "delete: gives an object's memory back. Pointers to it keep the old address and become dangling.",
  temp: "temp: a helper pointer, usually used to walk the list or to remember a node before unlinking it.",
  cur: "cur: the pointer that marks the current node during a walk.",
};
