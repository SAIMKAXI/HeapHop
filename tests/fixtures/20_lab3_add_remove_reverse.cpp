// label: singly | struct | REAL LAB 3 task 4: add, remove and reverse with Node** headRef
#include <iostream>

using namespace std;

struct Node {

int data;

Node* next;

};

// Add node at the end

void append(Node** headRef, int newData) {

Node* newNode = new Node();

newNode->data = newData;

newNode->next = nullptr;

if (*headRef == nullptr) {

*headRef = newNode;

return;

}

Node* last = *headRef;

while (last->next != nullptr)

last = last->next;

last->next = newNode;

}

// Add node at the beginning

void push(Node** headRef, int newData) {

Node* newNode = new Node();

newNode->data = newData;

newNode->next = *headRef;

*headRef = newNode;

}

// Add node in the middle at a given position

// Position starts from 1

void insertAtPosition(Node** headRef, int newData, int position) {

Node* newNode = new Node();

newNode->data = newData;

newNode->next = nullptr;

// Insert at beginning

if (position == 1) {

newNode->next = *headRef;

*headRef = newNode;

return;

}

Node* current = *headRef;

// Move to the node before the required position

for (int i = 1; i < position - 1 && current != nullptr; i++) {

current = current->next;

}

if (current == nullptr) {

cout << "Invalid position!" << endl;

delete newNode;

return;

}

newNode->next = current->next;

current->next = newNode;

}

// Remove a node by value

void deleteNode(Node** headRef, int value) {

if (*headRef == nullptr) {

cout << "List is empty!" << endl;

return;

}

if ((*headRef)->data == value) {

Node* temp = *headRef;

*headRef = (*headRef)->next;

delete temp;

return;

}

Node* current = *headRef;

// Find the node before the node to delete

while (current->next != nullptr &&

current->next->data != value) {

current = current->next;

}

if (current->next == nullptr) {

cout << "Value not found!" << endl;

return;

}

Node* temp = current->next;

current->next = current->next->next;

delete temp;

}

// Reverse the linked list

void reverse(Node** headRef) {

Node* prev = nullptr;

Node* current = *headRef;

Node* next = nullptr;

while (current != nullptr) {

next = current->next;

current->next = prev;

prev = current;

current = next;

}

*headRef = prev;

}

// Print the linked list

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

// Add at beginning

push(&head, 10);

push(&head, 5);

// Add at end

append(&head, 20);

append(&head, 30);

cout << "Original list:" << endl;

printList(head);

// Add in the middle

insertAtPosition(&head, 15, 3);

cout << "\nAfter inserting 15 at position 3:" << endl;

printList(head);

// Remove by value

deleteNode(&head, 20);

cout << "\nAfter deleting 20:" << endl;

printList(head);

// Reverse the list

reverse(&head);

cout << "\nAfter reversing:" << endl;

printList(head);

return 0;

}
