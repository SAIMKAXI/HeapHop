// label: bits/stdc++.h, find, a fill constructor and auto
#include <bits/stdc++.h>
using namespace std;

int main() {
    list<int> zeros(3);
    list<int> sevens(2, 7);
    for (auto z : zeros) cout << z << " ";
    for (auto s : sevens) cout << s << " ";
    cout << endl;
    list<string> words = {"tree", "list", "graph", "heap"};
    auto pos = find(words.begin(), words.end(), "graph");
    if (pos != words.end()) {
        words.insert(pos, "stack");
    }
    auto missing = find(words.begin(), words.end(), "queue");
    cout << (missing == words.end() ? "queue not found" : "queue found") << endl;
    for (const string& w : words) cout << w << " ";
    cout << endl;
    auto count = words.size();
    cout << count << " words" << endl;
    return 0;
}
