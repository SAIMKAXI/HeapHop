// label: a list created with new, used through a pointer, then deleted
#include <iostream>
#include <list>
using namespace std;

int main() {
    list<double>* prices = new list<double>();
    prices->push_back(2.5);
    prices->push_back(10.25);
    prices->push_front(1.0);
    double total = 0;
    for (double p : *prices) total += p;
    cout << "items: " << prices->size() << ", total: " << total << endl;
    delete prices;
    prices = nullptr;
    cout << "deleted" << endl;
    return 0;
}
