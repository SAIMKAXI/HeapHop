// label: singly | struct | delete from the beginning and from the end
#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
};

void push(Node*& head, int value) {
    Node* n = new Node();
    n->data = value;
    n->next = head;
    head = n;
}

void deleteFromBeginning(Node*& head) {
    if (head == NULL) {
        cout << "Nothing to delete" << endl;
        return;
    }
    Node* temp = head;
    head = head->next;
    delete temp;
}

void deleteFromEnd(Node*& head) {
    if (head == NULL) {
        cout << "Nothing to delete" << endl;
        return;
    }
    if (head->next == NULL) {
        delete head;
        head = NULL;
        return;
    }
    Node* temp = head;
    while (temp->next->next != NULL) {
        temp = temp->next;
    }
    delete temp->next;
    temp->next = NULL;
}

void display(Node* head) {
    Node* temp = head;
    while (temp != NULL) {
        cout << temp->data << " ";
        temp = temp->next;
    }
    cout << endl;
}

int main() {
    Node* head = NULL;
    push(head, 4);
    push(head, 3);
    push(head, 2);
    push(head, 1);
    display(head);
    deleteFromBeginning(head);
    display(head);
    deleteFromEnd(head);
    display(head);
    deleteFromEnd(head);
    deleteFromEnd(head);
    deleteFromEnd(head);
    return 0;
}
