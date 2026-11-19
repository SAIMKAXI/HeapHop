// label: tree | class | LAB 9 manual, Listing 4.1: the AVL tree exactly as printed (uses std::max), with a short main
#include <iostream>
using namespace std;

class Node {
public:
    int data;
    Node* left;
    Node* right;
    int height;

    Node(int value) {
        data = value;
        left = right = nullptr;
        height = 1;             // a new node is its own 1-node tree
    }
};

class AVLTree {
private:
    Node* root;

    int getHeight(Node* node) {
        return node ? node->height : 0;
    }

    int getBalance(Node* node) {
        return node ? getHeight(node->left) - getHeight(node->right) : 0;
    }

    Node* rightRotate(Node* y) {
        Node* x = y->left;
        Node* T = x->right;

        x->right = y;
        y->left = T;

        y->height = 1 + max(getHeight(y->left), getHeight(y->right));
        x->height = 1 + max(getHeight(x->left), getHeight(x->right));

        return x;           // x is the new subtree root
    }

    Node* leftRotate(Node* x) {
        Node* y = x->right;
        Node* T = y->left;

        y->left = x;
        x->right = T;

        x->height = 1 + max(getHeight(x->left), getHeight(x->right));
        y->height = 1 + max(getHeight(y->left), getHeight(y->right));

        return y;           // y is the new subtree root
    }

    Node* insert(Node* node, int value) {
        // 1. ordinary BST insert
        if (!node) return new Node(value);

        if (value < node->data)
            node->left = insert(node->left, value);
        else if (value > node->data)
            node->right = insert(node->right, value);
        else
            return node;      // AVL trees here do not store duplicates

        // 2. update this node's height on the way back up
        node->height = 1 + max(getHeight(node->left), getHeight(node->right));

        // 3. check the balance factor and rebalance if needed
        int balance = getBalance(node);

        if (balance > 1 && value < node->left->data)       // Left-Left
            return rightRotate(node);

        if (balance < -1 && value > node->right->data)       // Right-Right
            return leftRotate(node);

        if (balance > 1 && value > node->left->data) {      // Left-Right
            node->left = leftRotate(node->left);
            return rightRotate(node);
        }

        if (balance < -1 && value < node->right->data) {     // Right-Left
            node->right = rightRotate(node->right);
            return leftRotate(node);
        }

        return node;          // already balanced, nothing to do
    }

    void inOrder(Node* node) {
        if (!node) return;
        inOrder(node->left);
        cout << node->data << " ";
        inOrder(node->right);
    }

    void preOrder(Node* node) {
        if (!node) return;
        cout << node->data << " ";
        preOrder(node->left);
        preOrder(node->right);
    }

    bool search(Node* node, int value) {
        if (!node) return false;
        if (value == node->data) return true;
        return value < node->data ? search(node->left, value)
                                  : search(node->right, value);
    }

public:
    AVLTree() { root = nullptr; }

    void insert(int value) { root = insert(root, value); }

    bool search(int value) { return search(root, value); }

    void printInOrder() {
        cout << "In-order: ";
        inOrder(root);
        cout << endl;
    }

    void printPreOrder() {
        cout << "Pre-order: ";
        preOrder(root);
        cout << endl;
    }
};

int main() {
    AVLTree tree;
    int values[] = {10, 20, 30, 40, 50, 25};
    for (int i = 0; i < 6; i++) {
        tree.insert(values[i]);
        tree.printInOrder();
    }
    tree.printPreOrder();
    cout << (tree.search(25) ? "found" : "missing") << endl;
    return 0;
}
