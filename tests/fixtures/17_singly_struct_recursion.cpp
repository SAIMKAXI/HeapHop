// label: singly | struct | recursive print in reverse and recursive count
#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
    Node(int d) : data(d), next(nullptr) {}
};

void printReverse(Node* node) {
    if (node == nullptr) return;
    printReverse(node->next);
    cout << node->data << " ";
}

int length(Node* node) {
    if (node == nullptr) return 0;
    return 1 + length(node->next);
}

int main() {
    Node* head = new Node(1);
    head->next = new Node(2);
    head->next->next = new Node(3);
    printReverse(head);
    cout << endl;
    cout << "Length = " << length(head) << endl;
    return 0;
}
