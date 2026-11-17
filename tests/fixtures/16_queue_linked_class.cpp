// label: singly | class | queue built on a linked list (front and rear pointers)
#include <iostream>
using namespace std;

class Node {
public:
    int data;
    Node* next;
    Node(int d) : data(d), next(NULL) {}
};

class Queue {
    Node* front;
    Node* rear;

public:
    Queue() : front(NULL), rear(NULL) {}

    void enqueue(int value) {
        Node* n = new Node(value);
        if (rear == NULL) {
            front = rear = n;
            return;
        }
        rear->next = n;
        rear = n;
    }

    void dequeue() {
        if (front == NULL) {
            cout << "Queue is empty" << endl;
            return;
        }
        Node* temp = front;
        front = front->next;
        if (front == NULL) rear = NULL;
        cout << "Dequeued " << temp->data << endl;
        delete temp;
    }

    void display() {
        Node* t = front;
        cout << "Queue: ";
        while (t != NULL) {
            cout << t->data << " ";
            t = t->next;
        }
        cout << endl;
    }
};

int main() {
    Queue q;
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    q.display();
    q.dequeue();
    q.display();
    q.dequeue();
    q.dequeue();
    q.dequeue();
    return 0;
}
