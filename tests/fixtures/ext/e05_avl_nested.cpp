// label: an AVL tree whose Node struct is declared inside the class
#include <iostream>
#include <algorithm>
using namespace std;

class AVLTREE {
    struct Node {
        int key;
        Node* left;
        Node* right;
        int height;
        Node(int k) : key(k), left(nullptr), right(nullptr), height(1) {}
    };
    Node* root;

    int height(Node* n) { return n ? n->height : 0; }
    int balance(Node* n) { return n ? height(n->left) - height(n->right) : 0; }
    void update(Node* n) { n->height = 1 + max(height(n->left), height(n->right)); }
    Node* rotateRight(Node* y);
    Node* rotateLeft(Node* x);
    Node* insert(Node* n, int key);
    void inorder(Node* n);
    void destroy(Node* n);

public:
    AVLTREE() : root(nullptr) {}
    ~AVLTREE() { destroy(root); }
    void insert(int key) { root = insert(root, key); }
    void print() { inorder(root); cout << endl; }
    int rootKey() { return root->key; }
};

AVLTREE::Node* AVLTREE::rotateRight(Node* y) {
    Node* x = y->left;
    Node* t = x->right;
    x->right = y;
    y->left = t;
    update(y);
    update(x);
    return x;
}

AVLTREE::Node* AVLTREE::rotateLeft(Node* x) {
    Node* y = x->right;
    Node* t = y->left;
    y->left = x;
    x->right = t;
    update(x);
    update(y);
    return y;
}

AVLTREE::Node* AVLTREE::insert(Node* n, int key) {
    if (n == nullptr) return new Node(key);
    if (key < n->key) n->left = insert(n->left, key);
    else if (key > n->key) n->right = insert(n->right, key);
    else return n;
    update(n);
    int b = balance(n);
    if (b > 1 && key < n->left->key) return rotateRight(n);
    if (b < -1 && key > n->right->key) return rotateLeft(n);
    if (b > 1 && key > n->left->key) { n->left = rotateLeft(n->left); return rotateRight(n); }
    if (b < -1 && key < n->right->key) { n->right = rotateRight(n->right); return rotateLeft(n); }
    return n;
}

void AVLTREE::inorder(Node* n) {
    if (!n) return;
    inorder(n->left);
    cout << n->key << " ";
    inorder(n->right);
}

void AVLTREE::destroy(Node* n) {
    if (!n) return;
    destroy(n->left);
    destroy(n->right);
    delete n;
}

int main() {
    AVLTREE tree;
    int keys[] = {10, 20, 30, 40, 50, 25};
    for (int k : keys) tree.insert(k);
    tree.print();
    cout << "root: " << tree.rootKey() << endl;
    return 0;
}
