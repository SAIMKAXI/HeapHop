// label: doubly | struct | insert at end, print forward and backward
#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* prev;
    Node* next;
};

void insertAtEnd(Node*& head, Node*& tail, int value) {
    Node* n = new Node();
    n->data = value;
    n->prev = NULL;
    n->next = NULL;
    if (head == NULL) {
        head = n;
        tail = n;
        return;
    }
    tail->next = n;
    n->prev = tail;
    tail = n;
}

void printForward(Node* head) {
    cout << "Forward: ";
    while (head != NULL) {
        cout << head->data << " ";
        head = head->next;
    }
    cout << endl;
}

void printBackward(Node* tail) {
    cout << "Backward: ";
    while (tail != NULL) {
        cout << tail->data << " ";
        tail = tail->prev;
    }
    cout << endl;
}

int main() {
    Node* head = NULL;
    Node* tail = NULL;
    insertAtEnd(head, tail, 1);
    insertAtEnd(head, tail, 2);
    insertAtEnd(head, tail, 3);
    printForward(head);
    printBackward(tail);
    return 0;
}
