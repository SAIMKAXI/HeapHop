// label: a queue of customer numbers read with cin
#include <iostream>
#include <list>
using namespace std;

int main() {
    list<int> queue;
    int n;
    cout << "How many customers? ";
    cin >> n;
    for (int i = 0; i < n; i++) {
        int id;
        cin >> id;
        queue.push_back(id);
    }
    cout << endl;
    while (!queue.empty()) {
        cout << "Serving " << queue.front() << endl;
        queue.pop_front();
    }
    return 0;
}
