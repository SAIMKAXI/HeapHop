// label: array | class | REAL LAB 7 task 1: circular queue in a fixed array of 5 (typed in from the report's screenshot)
#include <iostream>
using namespace std;

class Queue {
private:
    int front, rear;
    int arr[5];
    int capacity;

public:
    Queue() {
        front = -1;
        rear = -1;
        capacity = 5;
    }

    bool isEmpty() {
        return (front == -1);
    }

    bool isFull() {
        return ((rear + 1) % capacity == front);
    }

    void Enqueue(int value) {
        if (isFull()) {
            cout << "Queue Overflow! Cannot add " << value << endl;
            return;
        }
        if (isEmpty()) {
            front = 0;
            rear = 0;
        } else {
            rear = (rear + 1) % capacity;
        }
        arr[rear] = value;
        cout << value << " added to the queue." << endl;
    }

    void Dequeue() {
        if (isEmpty()) {
            cout << "Queue Underflow! No elements to remove." << endl;
            return;
        }
        cout << arr[front] << " removed from the queue." << endl;
        if (front == rear) { // Queue becomes empty after removal
            front = -1;
            rear = -1;
        } else {
            front = (front + 1) % capacity;
        }
    }

    int Front() {
        if (isEmpty()) {
            cout << "Queue is empty." << endl;
            return -1;
        }
        return arr[front];
    }
};

int main() {
    Queue q;

    // Enqueue 5 elements to fill the capacity of 5
    q.Enqueue(10);
    q.Enqueue(20);
    q.Enqueue(30);
    q.Enqueue(40);
    q.Enqueue(50);

    cout << "\n--- Dequeuing 2 elements ---" << endl;
    q.Dequeue(); // 10 removed
    q.Dequeue(); // 20 removed

    cout << "\n--- Enqueuing 1 new element ---" << endl;
    q.Enqueue(60); // 60 added (reusing space)

    cout << "\nFront element: " << q.Front() << endl; // Should be 30

    return 0;
}
