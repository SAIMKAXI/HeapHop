// label: a list made from two iterators, and a range-for loop over an array
#include <iostream>
#include <list>
using namespace std;
int main() {
    list<int> a = {5, 6, 7, 8};
    list<int> b(a.begin(), a.end());
    b.pop_back();
    int arr[] = {1, 2, 3};
    int sum = 0;
    for (int x : arr) sum += x;
    cout << b.size() << " " << sum << endl;
    for (int x : b) cout << x;
    cout << endl;
    return 0;
}
