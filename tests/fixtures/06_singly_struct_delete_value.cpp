// label: singly | struct | delete the first node holding a value
#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
};

void append(Node*& head, int value) {
    Node* n = new Node();
    n->data = value;
    n->next = NULL;
    if (head == NULL) { head = n; return; }
    Node* t = head;
    while (t->next != NULL) t = t->next;
    t->next = n;
}

void deleteByValue(Node*& head, int key) {
    if (head == NULL) return;
    if (head->data == key) {
        Node* del = head;
        head = head->next;
        delete del;
        return;
    }
    Node* prev = head;
    Node* cur = head->next;
    while (cur != NULL && cur->data != key) {
        prev = cur;
        cur = cur->next;
    }
    if (cur == NULL) {
        cout << key << " not found" << endl;
        return;
    }
    prev->next = cur->next;
    delete cur;
}

void display(Node* head) {
    for (Node* t = head; t != NULL; t = t->next) {
        cout << t->data << " ";
    }
    cout << endl;
}

int main() {
    Node* head = NULL;
    append(head, 10);
    append(head, 20);
    append(head, 30);
    append(head, 40);
    deleteByValue(head, 30);
    display(head);
    deleteByValue(head, 10);
    display(head);
    deleteByValue(head, 77);
    display(head);
    return 0;
}
