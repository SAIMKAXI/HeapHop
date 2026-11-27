// label: function templates and a class template (a generic stack and linked list)
#include <iostream>
#include <string>
using namespace std;

template <typename T>
T maxOf(T a, T b) {
    return a > b ? a : b;
}

template <typename T>
void printArray(T arr[], int n) {
    for (int i = 0; i < n; i++) cout << arr[i] << " ";
    cout << endl;
}

template <typename T>
void swapValues(T& a, T& b) {
    T temp = a;
    a = b;
    b = temp;
}

template <class T>
class Stack {
    T items[10];
    int top;
public:
    Stack() { top = -1; }
    void push(T x);
    T pop();
    bool isEmpty() { return top == -1; }
};

template <class T>
void Stack<T>::push(T x) {
    items[++top] = x;
}

template <class T>
T Stack<T>::pop() {
    return items[top--];
}

template <typename T>
struct Node {
    T data;
    Node<T>* next;
    Node(T d) : data(d), next(nullptr) {}
};

template <typename T>
class LinkedList {
    Node<T>* head;
public:
    LinkedList() : head(nullptr) {}
    ~LinkedList() {
        while (head) {
            Node<T>* t = head;
            head = head->next;
            delete t;
        }
    }
    void pushFront(T v) {
        Node<T>* n = new Node<T>(v);
        n->next = head;
        head = n;
    }
    void print() {
        for (Node<T>* p = head; p != nullptr; p = p->next) cout << p->data << " -> ";
        cout << "null" << endl;
    }
};

int main() {
    cout << maxOf(3, 7) << " " << maxOf(2.5, 1.5) << " " << maxOf<char>('a', 'z') << " " << maxOf(string("abc"), string("abd")) << endl;
    int nums[] = {1, 2, 3};
    double ds[] = {1.5, 2.5};
    printArray(nums, 3);
    printArray(ds, 2);
    int x = 1, y = 2;
    swapValues(x, y);
    cout << x << " " << y << endl;

    Stack<int> s;
    s.push(10);
    s.push(20);
    cout << s.pop() << " " << s.pop() << " " << s.isEmpty() << endl;
    Stack<string> words;
    words.push("hello");
    words.push("world");
    cout << words.pop() << " " << words.pop() << endl;

    LinkedList<int> list;
    list.pushFront(3);
    list.pushFront(2);
    list.pushFront(1);
    list.print();
    LinkedList<string> names;
    names.pushFront("Ali");
    names.pushFront("Sara");
    names.print();
    return 0;
}
