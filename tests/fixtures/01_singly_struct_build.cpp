// label: singly | struct | build three nodes by hand and print
#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
};

int main() {
    Node* head = new Node();
    head->data = 10;
    head->next = NULL;

    Node* second = new Node();
    second->data = 20;
    second->next = NULL;
    head->next = second;

    Node* third = new Node();
    third->data = 30;
    third->next = NULL;
    second->next = third;

    Node* temp = head;
    while (temp != NULL) {
        cout << temp->data << " -> ";
        temp = temp->next;
    }
    cout << "NULL" << endl;
    return 0;
}
