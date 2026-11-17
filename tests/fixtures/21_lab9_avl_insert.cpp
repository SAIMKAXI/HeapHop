// label: tree | class | REAL LAB 9 task 1: AVL tree insertion with rebalancing
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
   Node* left;
   Node* right;
   int height;

     Node(int value) {
       data = value;
       left = right = nullptr;
       height = 1;
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

    // Normal BST insertion
    if (node == nullptr)
        return new Node(value);

    if (value < node->data)
        node->left = insert(node->left, value);

    else if (value > node->data)
       node->right = insert(node->right, value);

    else
       return node; // No duplicates

    // Update height
    node->height = 1 + findMax(
       getHeight(node->left),
       getHeight(node->right)
    );

    // Calculate balance factor
    int balance = getBalance(node);

    // LL Case
    if (balance > 1 &&
        value < node->left->data)
        return rightRotate(node);

    // RR Case
    if (balance < -1 &&
        value > node->right->data)
        return leftRotate(node);

    // LR Case
    if (balance > 1 &&
        value > node->left->data) {

        node->left = leftRotate(node->left);
        return rightRotate(node);
    }

         // RL Case
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

        cout << "After inserting "
           << values[i] << ": ";

        tree.printInOrder();
    }

    return 0;
}
