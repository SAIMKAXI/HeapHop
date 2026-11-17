// label: circular | class | circular list kept by its tail pointer, insert and delete
#include <iostream>
using namespace std;

class Node {
public:
    int data;
    Node* next;
    Node(int d) {
        data = d;
        next = NULL;
    }
};

class CircularList {
    Node* tail;

public:
    CircularList() { tail = NULL; }

    void insertAtEnd(int value) {
        Node* n = new Node(value);
        if (tail == NULL) {
            tail = n;
            tail->next = tail;
        } else {
            n->next = tail->next;
            tail->next = n;
            tail = n;
        }
    }

    void insertAtFront(int value) {
        Node* n = new Node(value);
        if (tail == NULL) {
            tail = n;
            tail->next = tail;
        } else {
            n->next = tail->next;
            tail->next = n;
        }
    }

    void deleteFront() {
        if (tail == NULL) return;
        Node* first = tail->next;
        if (first == tail) {
            delete first;
            tail = NULL;
            return;
        }
        tail->next = first->next;
        delete first;
    }

    void display() {
        if (tail == NULL) {
            cout << "List is empty" << endl;
            return;
        }
        Node* temp = tail->next;
        do {
            cout << temp->data << " ";
            temp = temp->next;
        } while (temp != tail->next);
        cout << endl;
    }
};

int main() {
    CircularList cl;
    cl.insertAtEnd(2);
    cl.insertAtEnd(3);
    cl.insertAtFront(1);
    cl.display();
    cl.deleteFront();
    cl.display();
    cl.deleteFront();
    cl.deleteFront();
    cl.display();
    return 0;
}
