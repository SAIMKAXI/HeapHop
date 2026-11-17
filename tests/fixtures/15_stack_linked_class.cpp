// label: singly | class | stack built on a linked list (push, pop, peek)
#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
};

class Stack {
private:
    Node* top;

public:
    Stack() { top = NULL; }

    bool isEmpty() { return top == NULL; }

    void push(int value) {
        Node* n = new Node();
        n->data = value;
        n->next = top;
        top = n;
        cout << value << " pushed" << endl;
    }

    int pop() {
        if (isEmpty()) {
            cout << "Stack underflow" << endl;
            return -1;
        }
        Node* temp = top;
        int value = temp->data;
        top = top->next;
        delete temp;
        return value;
    }

    int peek() {
        if (isEmpty()) return -1;
        return top->data;
    }
};

int main() {
    Stack s;
    s.push(5);
    s.push(10);
    s.push(15);
    cout << "Top is " << s.peek() << endl;
    cout << "Popped " << s.pop() << endl;
    cout << "Popped " << s.pop() << endl;
    cout << "Popped " << s.pop() << endl;
    cout << "Popped " << s.pop() << endl;
    return 0;
}
