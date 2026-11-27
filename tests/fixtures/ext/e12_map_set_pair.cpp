// label: std::pair, std::map and std::set: counting words, structured bindings
#include <iostream>
#include <map>
#include <set>
#include <string>
#include <vector>
using namespace std;

int main() {
    pair<int, string> p = {1, "one"};
    pair<int, string> q = make_pair(2, "two");
    cout << p.first << " " << p.second << " " << (p < q) << endl;
    auto [num, word] = q;
    cout << num << word << endl;

    string text[] = {"to", "be", "or", "not", "to", "be"};
    map<string, int> count;
    for (string w : text) count[w]++;
    for (auto& entry : count) cout << entry.first << "=" << entry.second << " ";
    cout << endl;
    cout << count.size() << " " << count["to"] << " " << count.count("xyz") << " " << count.size() << endl;
    if (count.find("or") != count.end()) cout << "found or" << endl;
    count.erase("not");
    for (auto [k, v] : count) cout << k << v << " ";
    cout << endl;
    map<int, vector<int>> groups;
    for (int i = 1; i <= 6; i++) groups[i % 3].push_back(i);
    for (auto& [key, list] : groups) {
        cout << key << ":";
        for (int x : list) cout << " " << x;
        cout << endl;
    }

    set<int> seen;
    int data[] = {4, 1, 4, 3, 1, 5};
    for (int x : data) seen.insert(x);
    for (int x : seen) cout << x << " ";
    cout << "| size " << seen.size() << " has3 " << seen.count(3) << " has7 " << seen.count(7) << endl;
    seen.erase(4);
    cout << *seen.begin() << " " << seen.size() << endl;
    vector<pair<int, int>> edges = {{1, 2}, {0, 5}, {1, 1}};
    for (auto& e : edges) cout << "(" << e.first << "," << e.second << ")";
    cout << endl;
    return 0;
}
