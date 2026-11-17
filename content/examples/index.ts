// Example library. Each example has a two-line intro (`description`).
//   group "lists"     the 12 linked-list operations, plus the class version
//   group "mistakes"  common-mistake demos: HeapHop stops and explains
//   group "pointers"  general pointer examples: variables, arrays, recursion

export interface Example {
  id: string;
  group: "lists" | "mistakes" | "pointers";
  title: string;
  /** Two lines: what happens, and what to watch for. */
  description: string;
  code: string;
}

export const GROUP_TITLES: Record<Example["group"], string> = {
  lists: "Linked lists",
  mistakes: "Common mistakes",
  pointers: "Pointers and memory",
};

const OWN: Example[] = [
  {
    id: "build",
    group: "lists",
    title: "Build a list",
    description: "Three nodes created with new and linked by hand.\nWatch each next pointer get its target, then the walk that prints them.",
    code: "#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int data;\n    Node* next;\n};\n\nint main() {\n    Node* head = new Node();\n    head->data = 10;\n    head->next = NULL;\n\n    Node* second = new Node();\n    second->data = 20;\n    second->next = NULL;\n    head->next = second;\n\n    Node* third = new Node();\n    third->data = 30;\n    third->next = NULL;\n    second->next = third;\n\n    Node* temp = head;\n    while (temp != NULL) {\n        cout << temp->data << \" -> \";\n        temp = temp->next;\n    }\n    cout << \"NULL\" << endl;\n    return 0;\n}\n",
  },
  {
    id: "traverse",
    group: "lists",
    title: "Traverse",
    description: "A pointer cur starts at head and follows next until it reaches NULL.\nThe list itself never changes; only cur moves.",
    code: "#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int data;\n    Node* next;\n};\n\nint main() {\n    Node* head = new Node();\n    head->data = 10;\n    head->next = new Node();\n    head->next->data = 20;\n    head->next->next = new Node();\n    head->next->next->data = 30;\n    head->next->next->next = NULL;\n\n    Node* cur = head;\n    while (cur != NULL) {\n        cout << cur->data << \" \";\n        cur = cur->next;\n    }\n    cout << endl;\n    return 0;\n}\n",
  },
  {
    id: "insert-front",
    group: "lists",
    title: "Insert at the front",
    description: "The new node points at the old head, then head moves to the new node.\nhead is passed by reference, so the change is seen in main.",
    code: "#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int data;\n    Node* next;\n};\n\nvoid insertAtBeginning(Node*& head, int value) {\n    Node* newNode = new Node();\n    newNode->data = value;\n    newNode->next = head;\n    head = newNode;\n}\n\nvoid display(Node* head) {\n    Node* temp = head;\n    while (temp != NULL) {\n        cout << temp->data << \" \";\n        temp = temp->next;\n    }\n    cout << endl;\n}\n\nint main() {\n    Node* head = NULL;\n    insertAtBeginning(head, 30);\n    insertAtBeginning(head, 20);\n    insertAtBeginning(head, 10);\n    display(head);\n    return 0;\n}\n",
  },
  {
    id: "insert-end",
    group: "lists",
    title: "Insert at the end",
    description: "A temp pointer walks to the last node and links the new one after it.\nAn empty list is a special case: head itself must change.",
    code: "#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int data;\n    Node* next;\n};\n\nvoid insertAtEnd(Node*& head, int value) {\n    Node* newNode = new Node();\n    newNode->data = value;\n    newNode->next = NULL;\n    if (head == NULL) {\n        head = newNode;\n        return;\n    }\n    Node* temp = head;\n    while (temp->next != NULL) {\n        temp = temp->next;\n    }\n    temp->next = newNode;\n}\n\nvoid display(Node* head) {\n    if (head == NULL) {\n        cout << \"List is empty\" << endl;\n        return;\n    }\n    Node* temp = head;\n    while (temp != NULL) {\n        cout << temp->data << \" -> \";\n        temp = temp->next;\n    }\n    cout << \"NULL\\n\";\n}\n\nint main() {\n    Node* head = NULL;\n    display(head);\n    insertAtEnd(head, 5);\n    insertAtEnd(head, 15);\n    insertAtEnd(head, 25);\n    insertAtEnd(head, 35);\n    display(head);\n    return 0;\n}\n",
  },
  {
    id: "insert-position",
    group: "lists",
    title: "Insert at a position",
    description: "Stop one node before the position, then relink two pointers.\nThe order of those two assignments matters.",
    code: "#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int data;\n    Node* next;\n};\n\nNode* createNode(int value) {\n    Node* n = new Node();\n    n->data = value;\n    n->next = NULL;\n    return n;\n}\n\nvoid insertAtPosition(Node*& head, int value, int pos) {\n    Node* newNode = createNode(value);\n    if (pos == 1) {\n        newNode->next = head;\n        head = newNode;\n        return;\n    }\n    Node* temp = head;\n    for (int i = 1; i < pos - 1 && temp != NULL; i++) {\n        temp = temp->next;\n    }\n    if (temp == NULL) {\n        cout << \"Position out of range\" << endl;\n        delete newNode;\n        return;\n    }\n    newNode->next = temp->next;\n    temp->next = newNode;\n}\n\nvoid display(Node* head) {\n    while (head != NULL) {\n        cout << head->data << \" \";\n        head = head->next;\n    }\n    cout << endl;\n}\n\nint main() {\n    Node* head = NULL;\n    insertAtPosition(head, 10, 1);\n    insertAtPosition(head, 30, 2);\n    insertAtPosition(head, 20, 2);\n    insertAtPosition(head, 5, 1);\n    insertAtPosition(head, 99, 9);\n    display(head);\n    return 0;\n}\n",
  },
  {
    id: "delete-front",
    group: "lists",
    title: "Delete at the front",
    description: "Keep the first node in temp, move head forward, then delete temp.\nWithout temp the first node would be lost.",
    code: "#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int data;\n    Node* next;\n};\n\nvoid push(Node*& head, int value) {\n    Node* n = new Node();\n    n->data = value;\n    n->next = head;\n    head = n;\n}\n\nvoid deleteFront(Node*& head) {\n    if (head == NULL) return;\n    Node* temp = head;\n    head = head->next;\n    delete temp;\n}\n\nint main() {\n    Node* head = NULL;\n    push(head, 30);\n    push(head, 20);\n    push(head, 10);\n    deleteFront(head);\n    deleteFront(head);\n    return 0;\n}\n",
  },
  {
    id: "delete-end",
    group: "lists",
    title: "Delete at the end",
    description: "Walk to the node before the last, delete the last, set next to NULL.\nA one-node list is handled separately.",
    code: "#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int data;\n    Node* next;\n};\n\nvoid push(Node*& head, int value) {\n    Node* n = new Node();\n    n->data = value;\n    n->next = head;\n    head = n;\n}\n\nvoid deleteEnd(Node*& head) {\n    if (head == NULL) return;\n    if (head->next == NULL) {\n        delete head;\n        head = NULL;\n        return;\n    }\n    Node* temp = head;\n    while (temp->next->next != NULL) {\n        temp = temp->next;\n    }\n    delete temp->next;\n    temp->next = NULL;\n}\n\nint main() {\n    Node* head = NULL;\n    push(head, 30);\n    push(head, 20);\n    push(head, 10);\n    deleteEnd(head);\n    deleteEnd(head);\n    return 0;\n}\n",
  },
  {
    id: "delete-value",
    group: "lists",
    title: "Delete by value",
    description: "prev and cur walk together until cur holds the value.\nprev->next then skips over cur before it is deleted.",
    code: "#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int data;\n    Node* next;\n};\n\nvoid append(Node*& head, int value) {\n    Node* n = new Node();\n    n->data = value;\n    n->next = NULL;\n    if (head == NULL) { head = n; return; }\n    Node* t = head;\n    while (t->next != NULL) t = t->next;\n    t->next = n;\n}\n\nvoid deleteByValue(Node*& head, int key) {\n    if (head == NULL) return;\n    if (head->data == key) {\n        Node* del = head;\n        head = head->next;\n        delete del;\n        return;\n    }\n    Node* prev = head;\n    Node* cur = head->next;\n    while (cur != NULL && cur->data != key) {\n        prev = cur;\n        cur = cur->next;\n    }\n    if (cur == NULL) {\n        cout << key << \" not found\" << endl;\n        return;\n    }\n    prev->next = cur->next;\n    delete cur;\n}\n\nvoid display(Node* head) {\n    for (Node* t = head; t != NULL; t = t->next) {\n        cout << t->data << \" \";\n    }\n    cout << endl;\n}\n\nint main() {\n    Node* head = NULL;\n    append(head, 10);\n    append(head, 20);\n    append(head, 30);\n    append(head, 40);\n    deleteByValue(head, 30);\n    display(head);\n    deleteByValue(head, 10);\n    display(head);\n    deleteByValue(head, 77);\n    display(head);\n    return 0;\n}\n",
  },
  {
    id: "search",
    group: "lists",
    title: "Search and count",
    description: "Walks the list to find a value, count the nodes and add them up.\nEach function gets its own copy of the head pointer.",
    code: "#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int data;\n    Node* next;\n};\n\nvoid append(Node*& head, int value) {\n    Node* n = new Node();\n    n->data = value;\n    n->next = NULL;\n    if (head == NULL) { head = n; return; }\n    Node* t = head;\n    while (t->next != NULL) t = t->next;\n    t->next = n;\n}\n\nbool search(Node* head, int key) {\n    Node* temp = head;\n    while (temp != NULL) {\n        if (temp->data == key) return true;\n        temp = temp->next;\n    }\n    return false;\n}\n\nint countNodes(Node* head) {\n    int count = 0;\n    while (head != NULL) {\n        count++;\n        head = head->next;\n    }\n    return count;\n}\n\nint sum(Node* head) {\n    int total = 0;\n    for (Node* t = head; t != NULL; t = t->next) total += t->data;\n    return total;\n}\n\nint main() {\n    Node* head = NULL;\n    append(head, 3);\n    append(head, 7);\n    append(head, 11);\n    if (search(head, 7)) cout << \"7 found\" << endl;\n    else cout << \"7 not found\" << endl;\n    if (search(head, 8)) cout << \"8 found\" << endl;\n    else cout << \"8 not found\" << endl;\n    cout << \"Nodes: \" << countNodes(head) << endl;\n    cout << \"Sum: \" << sum(head) << endl;\n    return 0;\n}\n",
  },
  {
    id: "reverse",
    group: "lists",
    title: "Reverse",
    description: "Three pointers, prev, cur and next, flip one arrow per round.\nThe nodes stay where they are; only the arrows turn around.",
    code: "#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int data;\n    Node* next;\n    Node(int d) : data(d), next(nullptr) {}\n};\n\nNode* reverse(Node* head) {\n    Node* prev = nullptr;\n    Node* cur = head;\n    Node* next = nullptr;\n    while (cur != nullptr) {\n        next = cur->next;\n        cur->next = prev;\n        prev = cur;\n        cur = next;\n    }\n    return prev;\n}\n\nvoid display(Node* head) {\n    while (head != nullptr) {\n        cout << head->data << \" \";\n        head = head->next;\n    }\n    cout << endl;\n}\n\nint main() {\n    Node* head = new Node(1);\n    head->next = new Node(2);\n    head->next->next = new Node(3);\n    head->next->next->next = new Node(4);\n    display(head);\n    head = reverse(head);\n    display(head);\n    return 0;\n}\n",
  },
  {
    id: "doubly",
    group: "lists",
    title: "Doubly linked: insert and delete",
    description: "Every node has prev and next, and the list keeps head and tail.\nEach insert or delete must repair links in both directions.",
    code: "#include <iostream>\nusing namespace std;\n\nclass Node {\npublic:\n    int data;\n    Node* prev;\n    Node* next;\n    Node(int d) {\n        data = d;\n        prev = nullptr;\n        next = nullptr;\n    }\n};\n\nclass DoublyLinkedList {\nprivate:\n    Node* head;\n    Node* tail;\n\npublic:\n    DoublyLinkedList() {\n        head = nullptr;\n        tail = nullptr;\n    }\n\n    void insertFront(int value) {\n        Node* n = new Node(value);\n        if (head == nullptr) {\n            head = tail = n;\n            return;\n        }\n        n->next = head;\n        head->prev = n;\n        head = n;\n    }\n\n    void insertEnd(int value) {\n        Node* n = new Node(value);\n        if (tail == nullptr) {\n            head = tail = n;\n            return;\n        }\n        tail->next = n;\n        n->prev = tail;\n        tail = n;\n    }\n\n    void deleteNode(int key) {\n        Node* cur = head;\n        while (cur != nullptr && cur->data != key) cur = cur->next;\n        if (cur == nullptr) {\n            cout << key << \" not found\" << endl;\n            return;\n        }\n        if (cur->prev != nullptr) cur->prev->next = cur->next;\n        else head = cur->next;\n        if (cur->next != nullptr) cur->next->prev = cur->prev;\n        else tail = cur->prev;\n        delete cur;\n    }\n\n    void displayForward() {\n        Node* t = head;\n        while (t != nullptr) {\n            cout << t->data << \" <-> \";\n            t = t->next;\n        }\n        cout << \"NULL\" << endl;\n    }\n\n    void displayBackward() {\n        Node* t = tail;\n        while (t != nullptr) {\n            cout << t->data << \" <-> \";\n            t = t->prev;\n        }\n        cout << \"NULL\" << endl;\n    }\n};\n\nint main() {\n    DoublyLinkedList dll;\n    dll.insertEnd(20);\n    dll.insertEnd(30);\n    dll.insertFront(10);\n    dll.insertEnd(40);\n    dll.displayForward();\n    dll.displayBackward();\n    dll.deleteNode(30);\n    dll.deleteNode(10);\n    dll.deleteNode(40);\n    dll.deleteNode(99);\n    dll.displayForward();\n    return 0;\n}\n",
  },
  {
    id: "circular",
    group: "lists",
    title: "Circular: traverse",
    description: "The last node points back to the first, so there is no NULL to stop at.\nA do-while loop stops when the walk returns to head.",
    code: "#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int data;\n    Node* next;\n};\n\nvoid insertEnd(Node*& head, int value) {\n    Node* n = new Node();\n    n->data = value;\n    if (head == NULL) {\n        head = n;\n        n->next = head;\n        return;\n    }\n    Node* temp = head;\n    while (temp->next != head) {\n        temp = temp->next;\n    }\n    temp->next = n;\n    n->next = head;\n}\n\nvoid display(Node* head) {\n    if (head == NULL) {\n        cout << \"Empty\" << endl;\n        return;\n    }\n    Node* temp = head;\n    do {\n        cout << temp->data << \" \";\n        temp = temp->next;\n    } while (temp != head);\n    cout << \"(back to \" << head->data << \")\" << endl;\n}\n\nint main() {\n    Node* head = NULL;\n    display(head);\n    insertEnd(head, 1);\n    insertEnd(head, 2);\n    insertEnd(head, 3);\n    insertEnd(head, 4);\n    display(head);\n    return 0;\n}\n",
  },
  {
    id: "class-list",
    group: "lists",
    title: "LinkedList class",
    description: "The same operations wrapped in a class with a constructor and a destructor.\nThe destructor frees every node when main ends.",
    code: "#include <iostream>\nusing namespace std;\n\nclass Node {\npublic:\n    int data;\n    Node* next;\n    Node(int d) : data(d), next(nullptr) {}\n};\n\nclass LinkedList {\n    Node* head;\n    int size;\n\npublic:\n    LinkedList() : head(nullptr), size(0) {}\n\n    ~LinkedList() {\n        Node* cur = head;\n        while (cur != nullptr) {\n            Node* nxt = cur->next;\n            delete cur;\n            cur = nxt;\n        }\n    }\n\n    bool isEmpty() {\n        return head == nullptr;\n    }\n\n    void insertAtHead(int value) {\n        Node* n = new Node(value);\n        n->next = head;\n        head = n;\n        size++;\n    }\n\n    void insertAtEnd(int value) {\n        Node* n = new Node(value);\n        if (isEmpty()) {\n            head = n;\n        } else {\n            Node* temp = head;\n            while (temp->next != nullptr) temp = temp->next;\n            temp->next = n;\n        }\n        size++;\n    }\n\n    void insertAtPosition(int value, int pos) {\n        if (pos <= 1) {\n            insertAtHead(value);\n            return;\n        }\n        if (pos > size) {\n            insertAtEnd(value);\n            return;\n        }\n        Node* n = new Node(value);\n        Node* temp = head;\n        for (int i = 1; i < pos - 1; i++) temp = temp->next;\n        n->next = temp->next;\n        temp->next = n;\n        size++;\n    }\n\n    void deleteByValue(int key) {\n        if (isEmpty()) return;\n        if (head->data == key) {\n            Node* del = head;\n            head = head->next;\n            delete del;\n            size--;\n            return;\n        }\n        Node* prev = head;\n        while (prev->next != nullptr && prev->next->data != key) prev = prev->next;\n        if (prev->next == nullptr) {\n            cout << key << \" is not in the list\" << endl;\n            return;\n        }\n        Node* del = prev->next;\n        prev->next = del->next;\n        delete del;\n        size--;\n    }\n\n    int search(int key) {\n        int index = 1;\n        Node* temp = head;\n        while (temp != nullptr) {\n            if (temp->data == key) return index;\n            temp = temp->next;\n            index++;\n        }\n        return -1;\n    }\n\n    void display() {\n        cout << \"[\" << size << \"] \";\n        Node* temp = head;\n        while (temp != nullptr) {\n            cout << temp->data;\n            if (temp->next != nullptr) cout << \" -> \";\n            temp = temp->next;\n        }\n        cout << endl;\n    }\n};\n\nint main() {\n    LinkedList list;\n    list.insertAtEnd(20);\n    list.insertAtHead(10);\n    list.insertAtEnd(40);\n    list.insertAtPosition(30, 3);\n    list.display();\n    cout << \"30 is at position \" << list.search(30) << endl;\n    cout << \"55 is at position \" << list.search(55) << endl;\n    list.deleteByValue(10);\n    list.deleteByValue(55);\n    list.display();\n    return 0;\n}\n",
  },
  {
    id: "lost-head",
    group: "mistakes",
    title: "Mistake: losing the head",
    description: "head moves forward and nothing else points at the first node.\nIt is not deleted, so its memory is leaked.",
    code: "#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int data;\n    Node* next;\n};\n\nint main() {\n    Node* head = new Node();\n    head->data = 1;\n    head->next = new Node();\n    head->next->data = 2;\n    head->next->next = NULL;\n\n    // Mistake: moving head forward without keeping or deleting the first node.\n    head = head->next;\n\n    cout << head->data << endl;\n    delete head;\n    return 0;\n}\n",
  },
  {
    id: "dangling",
    group: "mistakes",
    title: "Mistake: dangling pointer",
    description: "Two pointers share one node and the node is deleted through one of them.\nThe other still holds the old address, and using it is an error.",
    code: "#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int data;\n    Node* next;\n};\n\nint main() {\n    Node* head = new Node();\n    head->data = 1;\n    head->next = NULL;\n\n    Node* other = head;   // two pointers, one node\n    delete head;          // the node is gone, but both pointers keep its address\n\n    // Mistake: using the node through the second pointer after it was deleted.\n    cout << other->data << endl;\n    return 0;\n}\n",
  },
  {
    id: "forgot-null",
    group: "mistakes",
    title: "Mistake: forgetting next = NULL",
    description: "A node made with new Node has no values in its fields.\nThe walk follows a next pointer that was never set.",
    code: "#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int data;\n    Node* next;\n};\n\nint main() {\n    Node* head = new Node;   // no parentheses: the fields have no value yet\n    head->data = 1;\n    // Mistake: head->next was never set to NULL.\n\n    Node* cur = head;\n    while (cur != NULL) {\n        cout << cur->data << \" \";\n        cur = cur->next;     // follows a pointer that was never given a value\n    }\n    return 0;\n}\n",
  },
];

const POINTER_EXAMPLES: Omit<Example, "id" | "group">[] = [
  {
    title: "Simple Pointers",
    description: "Basic int pointers, new, dereference, and address-of.",
    code: `int* p = new int;
*p = 42;
int* q = p;
*q = 99;
int x = *p;
`,
  },
  {
    title: "Linked List — Build",
    description: "Build a singly-linked list with 3 nodes and traverse it.",
    code: `struct Node {
    int data;
    Node* next;
};

Node* head = new Node;
head->data = 1;
head->next = new Node;
head->next->data = 2;
head->next->next = new Node;
head->next->next->data = 3;
head->next->next->next = nullptr;

Node* curr = head;
`,
  },
  {
    title: "Linked List — Delete Node",
    description: "Remove the second node from a 3-node list.",
    code: `struct Node {
    int data;
    Node* next;
};

Node* head = new Node;
head->data = 10;
head->next = new Node;
head->next->data = 20;
head->next->next = new Node;
head->next->next->data = 30;
head->next->next->next = nullptr;

Node* toDelete = head->next;
head->next = toDelete->next;
delete toDelete;
`,
  },
  {
    title: "Cats Problem",
    description: "Classic Stanford CS106B pointer tracing with structs, arrays, and memory leaks.",
    code: `struct Lion {
    int roar;
    int* meow;
    int purr[2];
};

struct Savanna {
    int giraffe;
    Lion cat;
    Lion* kitten;
};

Lion* explore(Savanna* prairie) {
    Lion* leader = &(prairie->cat);
    leader->meow = new int;
    *(leader->meow) = 2;
    prairie = new Savanna;
    prairie->cat.roar = 6;
    prairie->kitten = leader;
    prairie->kitten->roar = 8;
    prairie->kitten->meow = &(prairie->kitten->purr[1]);
    leader->purr[0] = 4;
    return leader;
}

Savanna* habitat = new Savanna[3];
habitat[1].giraffe = 3;
habitat[1].kitten = nullptr;
habitat[0] = habitat[1];
habitat[2].kitten = explore(habitat);
habitat[2].kitten->roar = 4;
`,
  },
  {
    title: "Pointer Tracing — Functions",
    description: "Pass-by-value vs pass-by-reference with Node pointers.",
    code: `struct Node {
    int data;
    Node* next;
};

void changeData(Node* list) {
    list->data = 137;
}

void tryReassign(Node* list) {
    list = new Node;
    list->data = 42;
    list->next = nullptr;
}

void realReassign(Node*& list) {
    list->data = 99;
}

Node* head = new Node;
head->data = 1;
head->next = new Node;
head->next->data = 2;
head->next->next = nullptr;
changeData(head);
tryReassign(head);
realReassign(head);
`,
  },
  {
    title: "Reverse Linked List",
    description: "Recursive linked list reversal with struct constructors.",
    code: `struct ListNode {
    int val;
    ListNode* next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode* next) : val(x), next(next) {}
};

ListNode* reverseList(ListNode* head) {
    if (!head || !(head->next)) {
        return head;
    }
    ListNode* p = reverseList(head->next);
    head->next->next = head;
    head->next = nullptr;
    return p;
}

ListNode* a = new ListNode(1);
a->next = new ListNode(2);
a->next->next = new ListNode(3, nullptr);
ListNode* result = reverseList(a);
`,
  },
  {
    title: "Cats Problem (Mini)",
    description: "Pointer aliasing, memory leaks, and address-of through nested structs.",
    code: `struct Lion {
    int roar;
    int *meow;
};

struct Savanna {
    int giraffe;
    Lion cat;
};

void explore(Savanna *prairie) {
    Lion *leader = &(prairie->cat);
    (*leader).meow = new int(2);
    (*leader).roar = 2;
    (*leader).meow = new int(3);
}

Savanna* habitat = new Savanna[3];
habitat[1].giraffe = 3;
explore(habitat);
habitat[0].giraffe = 8;
`,
  },
  {
    title: "Array of Structs",
    description: "Allocate an array of structs and modify individual elements.",
    code: `struct Point {
    int x;
    int y;
};

Point* pts = new Point[3];
pts[0].x = 1;
pts[0].y = 2;
pts[1].x = 3;
pts[1].y = 4;
pts[2].x = 5;
pts[2].y = 6;
`,
  },
  {
    title: "Section Leaders",
    description: "Structs with strings, pointer sharing, and address-of through nested access.",
    code: `struct Beverage {
    string name;
    int mgCaffeine;
};

struct SectionLeader {
    string name;
    Beverage* favBeverage;
    int numQuartersSLing;
};

SectionLeader* SLs = new SectionLeader[3];
SLs[0].name = "Anushka";
SLs[1].name = "Tommy";
SLs[2].name = "Lucas";

SLs[0].numQuartersSLing = 2;
SLs[1].numQuartersSLing = 7;
SLs[2].numQuartersSLing = 3;

Beverage* matcha = new Beverage;
matcha->name = "matcha latte";
matcha->mgCaffeine = 65;

Beverage* coffee = new Beverage;
coffee->name = "Tokyo latte";

SLs[0].favBeverage = matcha;
SLs[1].favBeverage = coffee;
SLs[2].favBeverage = matcha;

coffee->mgCaffeine = 2 * (SLs[2].numQuartersSLing) + 3 * (matcha->mgCaffeine);

int* caffeine = &((SLs[0].favBeverage)->mgCaffeine);

// What does this print?
cout << "Today I have consumed " << *caffeine << " mg of caffeine." << endl;
`,
  },
];

export const EXAMPLES: Example[] = [
  ...OWN,
  ...POINTER_EXAMPLES.map((e, i): Example => ({ ...e, id: `pointers-${i + 1}`, group: "pointers" })),
];
