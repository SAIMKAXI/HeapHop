// label: singly | struct | insert at a given position with a for loop
#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
};

Node* createNode(int value) {
    Node* n = new Node();
    n->data = value;
    n->next = NULL;
    return n;
}

void insertAtPosition(Node*& head, int value, int pos) {
    Node* newNode = createNode(value);
    if (pos == 1) {
        newNode->next = head;
        head = newNode;
        return;
    }
    Node* temp = head;
    for (int i = 1; i < pos - 1 && temp != NULL; i++) {
        temp = temp->next;
    }
    if (temp == NULL) {
        cout << "Position out of range" << endl;
        delete newNode;
        return;
    }
    newNode->next = temp->next;
    temp->next = newNode;
}

void display(Node* head) {
    while (head != NULL) {
        cout << head->data << " ";
        head = head->next;
    }
    cout << endl;
}

int main() {
    Node* head = NULL;
    insertAtPosition(head, 10, 1);
    insertAtPosition(head, 30, 2);
    insertAtPosition(head, 20, 2);
    insertAtPosition(head, 5, 1);
    insertAtPosition(head, 99, 9);
    display(head);
    return 0;
}
