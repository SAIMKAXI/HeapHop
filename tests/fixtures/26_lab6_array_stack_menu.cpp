// label: array | class | BASED ON LAB 6 task 1: array stack with a cin menu (class typed in from the report; menu completed in the same style)
#include <iostream>
using namespace std;

const int MAX_SIZE = 1000;

class ArrayStack {
private:
    int arr[MAX_SIZE];
    int topIndex;
public:
    ArrayStack() {
        topIndex = -1;
    }

    bool isEmpty() const {
        return topIndex == -1;
    }

    bool isFull() const {
        return topIndex == MAX_SIZE - 1;
    }

    void push(int value) {
        if (isFull()) {
            cout << "--> Stack Overflow! Cannot push " << value << "\n";
            return;
        }
        arr[++topIndex] = value;
        cout << "--> Successfully pushed " << value << " onto the stack.\n";
    }

    void pop() {
        if (isEmpty()) {
            cout << "--> Stack Underflow! Nothing to pop.\n";
            return;
        }
        cout << "--> Popped element: " << arr[topIndex--] << "\n";
    }

    void peek() const {
        if (isEmpty()) {
            cout << "--> Stack is empty! No top element.\n";
            return;
        }
        cout << "--> Top element (peek): " << arr[topIndex] << "\n";
    }
};

int main() {
    ArrayStack stack;
    int choice, value;

    do {
        cout << "\n------------------------------\n";
        cout << "    TASK 1: STACK MENU        \n";
        cout << "------------------------------\n";
        cout << "1. Push\n";
        cout << "2. Pop\n";
        cout << "3. Peek\n";
        cout << "0. Exit\n";
        cout << "Enter your choice: ";
        cin >> choice;

        switch (choice) {
            case 1:
                cout << "Enter value to push: ";
                cin >> value;
                stack.push(value);
                break;
            case 2:
                stack.pop();
                break;
            case 3:
                stack.peek();
                break;
            case 0:
                cout << "Exiting...\n";
                break;
            default:
                cout << "Invalid choice! Try again.\n";
        }
    } while (choice != 0);

    return 0;
}
