// label: operator overloading for a struct used in sort and a priority_queue (Huffman-style)
#include <iostream>
#include <vector>
#include <queue>
#include <algorithm>
using namespace std;

struct Point {
    int x, y;
    Point(int x = 0, int y = 0) : x(x), y(y) {}
    Point operator+(const Point& o) const { return Point(x + o.x, y + o.y); }
    bool operator==(const Point& o) const { return x == o.x && y == o.y; }
    bool operator<(const Point& o) const { return x < o.x || (x == o.x && y < o.y); }
};

struct Node {
    char ch;
    int freq;
    Node* left;
    Node* right;
    Node(char c, int f) : ch(c), freq(f), left(nullptr), right(nullptr) {}
};

struct Compare {
    bool operator()(Node* a, Node* b) { return a->freq > b->freq; }
};

void codes(Node* n, string code) {
    if (!n) return;
    if (!n->left && !n->right) cout << n->ch << ":" << code << " ";
    codes(n->left, code + "0");
    codes(n->right, code + "1");
}

void destroy(Node* n) {
    if (!n) return;
    destroy(n->left);
    destroy(n->right);
    delete n;
}

int main() {
    Point a(1, 2), b(3, 4);
    Point c = a + b;
    cout << c.x << "," << c.y << " " << (a == b) << (a == Point(1, 2)) << (a < b) << endl;
    vector<Point> pts = {{3, 1}, {1, 5}, {3, 0}, {2, 2}};
    sort(pts.begin(), pts.end());
    for (auto& p : pts) cout << "(" << p.x << "," << p.y << ")";
    cout << endl;

    char chars[] = {'a', 'b', 'c', 'd'};
    int freq[] = {5, 9, 12, 13};
    priority_queue<Node*, vector<Node*>, Compare> pq;
    for (int i = 0; i < 4; i++) pq.push(new Node(chars[i], freq[i]));
    while (pq.size() > 1) {
        Node* l = pq.top(); pq.pop();
        Node* r = pq.top(); pq.pop();
        Node* parent = new Node('*', l->freq + r->freq);
        parent->left = l;
        parent->right = r;
        pq.push(parent);
    }
    Node* root = pq.top();
    cout << "total " << root->freq << endl;
    codes(root, "");
    cout << endl;
    destroy(root);
    return 0;
}
