// label: classes that hold containers, a queue made of two stacks, a template list with a nested Node, deque
#include <iostream>
#include <vector>
#include <stack>
#include <deque>
#include <string>
using namespace std;

class Graph {
    int V;
    vector<vector<int>> adj;
public:
    Graph(int v) : V(v), adj(v) {}
    void addEdge(int u, int w) { adj[u].push_back(w); adj[w].push_back(u); }
    void dfs(int u, vector<bool>& seen) {
        seen[u] = true;
        cout << u << " ";
        for (int w : adj[u]) if (!seen[w]) dfs(w, seen);
    }
};

class MyQueue {
    stack<int> in, out;
public:
    void push(int x) { in.push(x); }
    int pop() {
        if (out.empty()) {
            while (!in.empty()) { out.push(in.top()); in.pop(); }
        }
        int x = out.top();
        out.pop();
        return x;
    }
};

template <typename T>
class List {
    struct Node {
        T data;
        Node* next;
        Node(T d) : data(d), next(nullptr) {}
    };
    Node* head;
    int count;
public:
    List() : head(nullptr), count(0) {}
    ~List() {
        while (head) { Node* t = head; head = head->next; delete t; }
    }
    void append(T value);
    void print() const {
        for (Node* p = head; p; p = p->next) cout << p->data << " ";
        cout << "(" << count << ")" << endl;
    }
};

template <typename T>
void List<T>::append(T value) {
    Node* n = new Node(value);
    count++;
    if (!head) { head = n; return; }
    Node* p = head;
    while (p->next) p = p->next;
    p->next = n;
}

int main() {
    Graph g(5);
    g.addEdge(0, 1);
    g.addEdge(0, 4);
    g.addEdge(1, 2);
    g.addEdge(1, 3);
    vector<bool> seen(5, false);
    g.dfs(0, seen);
    cout << endl;

    MyQueue q;
    q.push(1); q.push(2); q.push(3);
    cout << q.pop() << " ";
    q.push(4);
    cout << q.pop() << " " << q.pop() << " " << q.pop() << endl;

    List<int> nums;
    nums.append(5); nums.append(6); nums.append(7);
    nums.print();
    List<string> words;
    words.append("hi"); words.append("there");
    words.print();

    deque<int> dq;
    dq.push_back(2); dq.push_front(1); dq.push_back(3);
    cout << dq.front() << " " << dq.back() << " " << dq.size() << endl;
    dq.pop_front();
    for (int x : dq) cout << x << " ";
    cout << endl;
    return 0;
}
