// label: doubly | class | DoublyLinkedList with head and tail, insert and delete
#include <iostream>
using namespace std;

class Node {
public:
    int data;
    Node* prev;
    Node* next;
    Node(int d) {
        data = d;
        prev = nullptr;
        next = nullptr;
    }
};

class DoublyLinkedList {
private:
    Node* head;
    Node* tail;

public:
    DoublyLinkedList() {
        head = nullptr;
        tail = nullptr;
    }

    void insertFront(int value) {
        Node* n = new Node(value);
        if (head == nullptr) {
            head = tail = n;
            return;
        }
        n->next = head;
        head->prev = n;
        head = n;
    }

    void insertEnd(int value) {
        Node* n = new Node(value);
        if (tail == nullptr) {
            head = tail = n;
            return;
        }
        tail->next = n;
        n->prev = tail;
        tail = n;
    }

    void deleteNode(int key) {
        Node* cur = head;
        while (cur != nullptr && cur->data != key) cur = cur->next;
        if (cur == nullptr) {
            cout << key << " not found" << endl;
            return;
        }
        if (cur->prev != nullptr) cur->prev->next = cur->next;
        else head = cur->next;
        if (cur->next != nullptr) cur->next->prev = cur->prev;
        else tail = cur->prev;
        delete cur;
    }

    void displayForward() {
        Node* t = head;
        while (t != nullptr) {
            cout << t->data << " <-> ";
            t = t->next;
        }
        cout << "NULL" << endl;
    }

    void displayBackward() {
        Node* t = tail;
        while (t != nullptr) {
            cout << t->data << " <-> ";
            t = t->prev;
        }
        cout << "NULL" << endl;
    }
};

int main() {
    DoublyLinkedList dll;
    dll.insertEnd(20);
    dll.insertEnd(30);
    dll.insertFront(10);
    dll.insertEnd(40);
    dll.displayForward();
    dll.displayBackward();
    dll.deleteNode(30);
    dll.deleteNode(10);
    dll.deleteNode(40);
    dll.deleteNode(99);
    dll.displayForward();
    return 0;
}
