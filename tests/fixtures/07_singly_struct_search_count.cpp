// label: singly | struct | search, count and sum
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

bool search(Node* head, int key) {
    Node* temp = head;
    while (temp != NULL) {
        if (temp->data == key) return true;
        temp = temp->next;
    }
    return false;
}

int countNodes(Node* head) {
    int count = 0;
    while (head != NULL) {
        count++;
        head = head->next;
    }
    return count;
}

int sum(Node* head) {
    int total = 0;
    for (Node* t = head; t != NULL; t = t->next) total += t->data;
    return total;
}

int main() {
    Node* head = NULL;
    append(head, 3);
    append(head, 7);
    append(head, 11);
    if (search(head, 7)) cout << "7 found" << endl;
    else cout << "7 not found" << endl;
    if (search(head, 8)) cout << "8 found" << endl;
    else cout << "8 not found" << endl;
    cout << "Nodes: " << countNodes(head) << endl;
    cout << "Sum: " << sum(head) << endl;
    return 0;
}
