// label: tree | class | REAL LAB 9 task 4: AVL tree height report
#include <iostream>
using namespace std;

int findMax(int a, int b) {
   if (a > b)

        return a;
     else
        return b;
}

class Node {
public:
   int data;
   int height;
   Node* left;
   Node* right;

     Node(int value) {
       data = value;
       height = 1;
       left = right = nullptr;
     }
};

class AVLTree {
private:
   Node* root;

     int getHeight(Node* node) {
        if (node == nullptr)
            return 0;

         return node->height;
     }

     int getBalance(Node* node) {
        if (node == nullptr)
            return 0;

         return getHeight(node->left) -
              getHeight(node->right);
     }

     Node* rightRotate(Node* y) {
       Node* x = y->left;
       Node* T = x->right;

         x->right = y;
         y->left = T;

    y->height = 1 + findMax(
       getHeight(y->left),
       getHeight(y->right)
    );

    x->height = 1 + findMax(
       getHeight(x->left),
       getHeight(x->right)
    );

    return x;
}

Node* leftRotate(Node* x) {
  Node* y = x->right;
  Node* T = y->left;

    y->left = x;
    x->right = T;

    x->height = 1 + findMax(
       getHeight(x->left),
       getHeight(x->right)
    );

    y->height = 1 + findMax(
       getHeight(y->left),
       getHeight(y->right)
    );

    return y;
}

Node* insert(Node* node, int value) {

    if (node == nullptr)
        return new Node(value);

    if (value < node->data)
        node->left = insert(node->left, value);

    else if (value > node->data)
       node->right = insert(node->right, value);

    else
       return node;

    node->height = 1 + findMax(
       getHeight(node->left),
       getHeight(node->right)
    );

    int balance = getBalance(node);

    // LL
    if (balance > 1 &&
        value < node->left->data)
        return rightRotate(node);

    // RR
    if (balance < -1 &&
        value > node->right->data)
        return leftRotate(node);

    // LR
    if (balance > 1 &&
        value > node->left->data) {

        node->left = leftRotate(node->left);
        return rightRotate(node);
    }

    // RL
    if (balance < -1 &&
        value < node->right->data) {

        node->right = rightRotate(node->right);
        return leftRotate(node);
    }

    return node;
}

void inOrder(Node* node) {
  if (node == nullptr)
      return;

         inOrder(node->left);
         cout << node->data << " ";
         inOrder(node->right);
     }

public:
  AVLTree() {
     root = nullptr;
  }

     void insert(int value) {
       root = insert(root, value);
     }

     int getTreeHeight() {
        return getHeight(root);
     }

     void printInOrder() {
       inOrder(root);
       cout << endl;
     }
};

int main() {
   AVLTree tree;

     int values[] = {10, 20, 30, 40, 50, 25};

     for (int i = 0; i < 6; i++) {
        tree.insert(values[i]);
     }

     cout << "In-order: ";
     tree.printInOrder();

     cout << "Height of AVL Tree: "
        << tree.getTreeHeight() << endl;

     return 0;
}

