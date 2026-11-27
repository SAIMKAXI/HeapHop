// label: a stack class built on a list member, and a copy of it
#include <iostream>
#include <list>
using namespace std;
class Stack {
    list<int> items;
public:
    void push(int x) { items.push_front(x); }
    int pop() { int t = items.front(); items.pop_front(); return t; }
    bool isEmpty() { return items.empty(); }
    int size() { return items.size(); }
};
int main() {
    Stack s;
    for (int i = 1; i <= 4; i++) s.push(i * 10);
    cout << "size " << s.size() << endl;
    while (!s.isEmpty()) cout << s.pop() << " ";
    cout << endl;
    Stack t = s;
    t.push(5);
    cout << t.size() << " " << s.size() << endl;
    return 0;
}
