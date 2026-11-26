// label: std::stack, std::queue and std::priority_queue
#include <iostream>
#include <stack>
#include <queue>
#include <string>
#include <vector>
using namespace std;

bool balanced(string s) {
    stack<char> st;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') st.push(c);
        else {
            if (st.empty()) return false;
            char top = st.top();
            st.pop();
            if ((c == ')' && top != '(') || (c == ']' && top != '[') || (c == '}' && top != '{')) return false;
        }
    }
    return st.empty();
}

int main() {
    stack<int> s;
    for (int i = 1; i <= 4; i++) s.push(i * i);
    cout << "top " << s.top() << " size " << s.size() << endl;
    while (!s.empty()) { cout << s.top() << " "; s.pop(); }
    cout << endl;
    cout << balanced("{[()]}") << balanced("([)]") << balanced("((") << endl;

    queue<string> q;
    q.push("Ali");
    q.push("Sara");
    q.push("Musa");
    cout << q.front() << " " << q.back() << " " << q.size() << endl;
    q.pop();
    cout << q.front() << endl;

    priority_queue<int> maxHeap;
    int vals[] = {5, 1, 9, 3, 7, 9, 2};
    for (int x : vals) maxHeap.push(x);
    while (!maxHeap.empty()) { cout << maxHeap.top() << " "; maxHeap.pop(); }
    cout << endl;

    priority_queue<int, vector<int>, greater<int>> minHeap;
    for (int x : vals) minHeap.push(x);
    cout << "min " << minHeap.top() << endl;
    minHeap.pop();
    cout << "next " << minHeap.top() << " size " << minHeap.size() << endl;

    priority_queue<pair<int, string>> tasks;
    tasks.push({2, "write"});
    tasks.push({5, "test"});
    tasks.push({2, "build"});
    tasks.push(make_pair(9, "ship"));
    while (!tasks.empty()) {
        auto t = tasks.top();
        tasks.pop();
        cout << t.first << ":" << t.second << " ";
    }
    cout << endl;
    return 0;
}
