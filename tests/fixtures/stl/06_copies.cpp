// label: copying a list, passing by value and by reference, returning a list
#include <iostream>
#include <list>
using namespace std;

list<int> makeRange(int from, int to) {
    list<int> r;
    for (int i = from; i <= to; i++) r.push_back(i);
    return r;
}

void addByValue(list<int> l) {
    l.push_back(999);
    cout << "inside by value: " << l.size() << endl;
}

void addByRef(list<int>& l) {
    l.push_back(777);
}

int sum(list<int> l) {
    int s = 0;
    for (int x : l) s += x;
    return s;
}

int main() {
    list<int> a = makeRange(1, 4);
    list<int> b = a;
    b.push_back(5);
    cout << "a has " << a.size() << ", b has " << b.size() << endl;
    addByValue(a);
    cout << "after by value: " << a.size() << endl;
    addByRef(a);
    cout << "after by reference: " << a.size() << " last " << a.back() << endl;
    a = b;
    cout << "after a = b: " << a.size() << " last " << a.back() << endl;
    cout << "sum of b: " << sum(b) << endl;
    a.clear();
    cout << "cleared: " << a.size() << " " << a.empty() << endl;
    return 0;
}
