// label: singly | struct | REAL LAB 3 task 1: push through a pointer to pointer (Node** headRef), print, free
#include <iostream>

using namespace std;

struct Node {

int data;

Node* next;

};

void push(Node** headRef, int newData) {

Node* newNode = new Node();

newNode->data = newData;

newNode->next = *headRef;

*headRef = newNode;

}

void printList(Node* head) {

Node* current = head;

while (current != nullptr) {

cout << current->data;

if (current->next != nullptr) {

cout << " -> ";

}

current = current->next;

}

cout << " -> NULL" << endl;

}

int main() {

Node* head = nullptr;

push(&head, 3);

push(&head, 2);

push(&head, 1);

printList(head);

// Free allocated memory

Node* current = head;

while (current != nullptr) {

Node* nextNode = current->next;

delete current;

current = nextNode;

}

head = nullptr;

return 0;

}
