// label: erasing while walking with it = erase(it), then reverse and unique
#include <iostream>
#include <list>
using namespace std;
int main() {
    list<int> l;
    for (int i = 0; i < 6; i++) l.push_back(i);
    auto it = l.begin();
    while (it != l.end()) {
        if (*it % 3 == 0) it = l.erase(it);
        else it++;
    }
    for (auto x : l) cout << x;
    cout << endl;
    auto back = l.end();
    back--;
    cout << *back << endl;
    l.reverse();
    l.unique();
    cout << l.size() << endl;
    return 0;
}
