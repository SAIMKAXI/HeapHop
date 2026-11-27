// label: try, catch and throw: a stack that throws when it is empty
#include <iostream>
#include <stdexcept>
#include <string>
using namespace std;

class Stack {
    int data[5];
    int top;
public:
    Stack() : top(-1) {}
    void push(int x) {
        if (top == 4) throw overflow_error("stack is full");
        data[++top] = x;
    }
    int pop() {
        if (top == -1) throw runtime_error("stack is empty");
        return data[top--];
    }
};

class Guard {
    string name;
public:
    Guard(string n) : name(n) { cout << "open " << name << endl; }
    ~Guard() { cout << "close " << name << endl; }
};

int divide(int a, int b) {
    Guard g("divide");
    if (b == 0) throw "division by zero";
    return a / b;
}

int parse(string s) {
    if (s.empty()) throw invalid_argument("empty text");
    return stoi(s);
}

int main() {
    Stack s;
    try {
        s.push(1);
        s.push(2);
        cout << s.pop() << " " << s.pop() << endl;
        cout << s.pop() << endl;
        cout << "not printed" << endl;
    } catch (const runtime_error& e) {
        cout << "caught: " << e.what() << endl;
    }
    try {
        for (int i = 0; i < 10; i++) s.push(i);
    } catch (exception& e) {
        cout << "caught exception: " << e.what() << endl;
    }
    try {
        cout << divide(10, 2) << endl;
        cout << divide(1, 0) << endl;
    } catch (const char* msg) {
        cout << "error: " << msg << endl;
    }
    try {
        throw 42;
    } catch (double d) {
        cout << "double" << endl;
    } catch (int n) {
        cout << "int " << n << endl;
    }
    try {
        parse("");
    } catch (const invalid_argument& e) {
        cout << "invalid: " << e.what() << endl;
    }
    try {
        string t = "abc";
        cout << t.at(5) << endl;
    } catch (out_of_range& e) {
        cout << "out of range" << endl;
    }
    try {
        try {
            throw logic_error("inner");
        } catch (logic_error& e) {
            cout << "rethrowing " << e.what() << endl;
            throw;
        }
    } catch (...) {
        cout << "caught anything" << endl;
    }
    cout << "done" << endl;
    return 0;
}
