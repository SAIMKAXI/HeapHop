// label: tree | class | REAL LAB 9 task 3: AVL deleteNode with rebalancing
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

// Find the smallest value in right subtree
Node* getMinValueNode(Node* node) {
   Node* current = node;

    while (current->left != nullptr) {
      current = current->left;
    }

    return current;
}

Node* deleteNode(Node* node, int value) {

  // Value not found
  if (node == nullptr)
      return node;

  // Search in left subtree
  if (value < node->data) {
      node->left = deleteNode(node->left, value);
  }

  // Search in right subtree
  else if (value > node->data) {
     node->right = deleteNode(node->right, value);
  }

  // Value found
  else {

    // CASE 1: No children
    if (node->left == nullptr &&
        node->right == nullptr) {

        delete node;
        return nullptr;
    }

    // CASE 2: One child
    else if (node->left == nullptr ||
           node->right == nullptr) {

        Node* child;

        if (node->left != nullptr)
            child = node->left;
        else
            child = node->right;

        delete node;
        return child;
    }

    // CASE 3: Two children

    else {

        Node* successor =
          getMinValueNode(node->right);

        node->data = successor->data;

        node->right = deleteNode(
           node->right,
           successor->data
        );
    }
}

// Update height
node->height = 1 + findMax(
   getHeight(node->left),
   getHeight(node->right)
);

// Calculate balance factor
int balance = getBalance(node);

// LL Case
if (balance > 1 &&
    getBalance(node->left) >= 0)
    return rightRotate(node);

// LR Case
if (balance > 1 &&
    getBalance(node->left) < 0) {

    node->left = leftRotate(node->left);
    return rightRotate(node);
}

// RR Case
if (balance < -1 &&
    getBalance(node->right) <= 0)
    return leftRotate(node);

// RL Case
if (balance < -1 &&
    getBalance(node->right) > 0) {

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
   void remove(int value) {
     root = deleteNode(root, value);
   }
   void printInOrder() {
     cout << "In-order: ";
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
   cout << "Before deletion:" << endl;
   tree.printInOrder();
   tree.remove(20);
   cout << "\nAfter deleting 20:" << endl;
   tree.printInOrder();
   return 0; }

