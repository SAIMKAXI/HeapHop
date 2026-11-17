// label: singly | class | insert head/end/position, delete by value, search, destructor
#include <iostream>
using namespace std;

class Node {
public:
    int data;
    Node* next;
    Node(int d) : data(d), next(nullptr) {}
};

class LinkedList {
    Node* head;
    int size;

public:
    LinkedList() : head(nullptr), size(0) {}

    ~LinkedList() {
        Node* cur = head;
        while (cur != nullptr) {
            Node* nxt = cur->next;
            delete cur;
            cur = nxt;
        }
    }

    bool isEmpty() {
        return head == nullptr;
    }

    void insertAtHead(int value) {
        Node* n = new Node(value);
        n->next = head;
        head = n;
        size++;
    }

    void insertAtEnd(int value) {
        Node* n = new Node(value);
        if (isEmpty()) {
            head = n;
        } else {
            Node* temp = head;
            while (temp->next != nullptr) temp = temp->next;
            temp->next = n;
        }
        size++;
    }

    void insertAtPosition(int value, int pos) {
        if (pos <= 1) {
            insertAtHead(value);
            return;
        }
        if (pos > size) {
            insertAtEnd(value);
            return;
        }
        Node* n = new Node(value);
        Node* temp = head;
        for (int i = 1; i < pos - 1; i++) temp = temp->next;
        n->next = temp->next;
        temp->next = n;
        size++;
    }

    void deleteByValue(int key) {
        if (isEmpty()) return;
        if (head->data == key) {
            Node* del = head;
            head = head->next;
            delete del;
            size--;
            return;
        }
        Node* prev = head;
        while (prev->next != nullptr && prev->next->data != key) prev = prev->next;
        if (prev->next == nullptr) {
            cout << key << " is not in the list" << endl;
            return;
        }
        Node* del = prev->next;
        prev->next = del->next;
        delete del;
        size--;
    }

    int search(int key) {
        int index = 1;
        Node* temp = head;
        while (temp != nullptr) {
            if (temp->data == key) return index;
            temp = temp->next;
            index++;
        }
        return -1;
    }

    void display() {
        cout << "[" << size << "] ";
        Node* temp = head;
        while (temp != nullptr) {
            cout << temp->data;
            if (temp->next != nullptr) cout << " -> ";
            temp = temp->next;
        }
        cout << endl;
    }
};

int main() {
    LinkedList list;
    list.insertAtEnd(20);
    list.insertAtHead(10);
    list.insertAtEnd(40);
    list.insertAtPosition(30, 3);
    list.display();
    cout << "30 is at position " << list.search(30) << endl;
    cout << "55 is at position " << list.search(55) << endl;
    list.deleteByValue(10);
    list.deleteByValue(55);
    list.display();
    return 0;
}
