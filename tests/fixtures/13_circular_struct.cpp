// label: circular | struct | circular singly list, traversal with do-while
#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
};

void insertEnd(Node*& head, int value) {
    Node* n = new Node();
    n->data = value;
    if (head == NULL) {
        head = n;
        n->next = head;
        return;
    }
    Node* temp = head;
    while (temp->next != head) {
        temp = temp->next;
    }
    temp->next = n;
    n->next = head;
}

void display(Node* head) {
    if (head == NULL) {
        cout << "Empty" << endl;
        return;
    }
    Node* temp = head;
    do {
        cout << temp->data << " ";
        temp = temp->next;
    } while (temp != head);
    cout << "(back to " << head->data << ")" << endl;
}

int main() {
    Node* head = NULL;
    display(head);
    insertEnd(head, 1);
    insertEnd(head, 2);
    insertEnd(head, 3);
    insertEnd(head, 4);
    display(head);
    return 0;
}
