// label: tree | class | REAL LAB 9 task 2: AVL rotations on 10, 20, 30
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

int getHeight(Node* node) {
   if (node == nullptr)
       return 0;

     return node->height;
}

void updateHeight(Node* node) {
  node->height = 1 + findMax(
     getHeight(node->left),
     getHeight(node->right)
  );
}

Node* rightRotate(Node* y) {
  Node* x = y->left;
  Node* T = x->right;

     x->right = y;
     y->left = T;

     updateHeight(y);
     updateHeight(x);

     return x;
}

Node* leftRotate(Node* x) {
  Node* y = x->right;
  Node* T = y->left;

     y->left = x;
     x->right = T;

     updateHeight(x);
     updateHeight(y);

     return y;
}

void preOrder(Node* node) {
  if (node == nullptr)
      return;

    cout << node->data << " ";

    preOrder(node->left);
    preOrder(node->right);
}

void testRotation(string name, Node* root, int type) {

    cout << "\n" << name << endl;

    cout << "Before rotation: ";
    preOrder(root);
    cout << endl;

    // Left rotation
    if (type == 1) {
        root = leftRotate(root);
    }

    // Right rotation
    else if (type == 2) {
       root = rightRotate(root);
    }

    // Left-Right rotation
    else if (type == 3) {
       root->left = leftRotate(root->left);
       root = rightRotate(root);
    }

    // Right-Left rotation
    else if (type == 4) {
       root->right = rightRotate(root->right);
       root = leftRotate(root);
    }

    cout << "After rotation: ";
    preOrder(root);
    cout << endl;

}

int main() {

    // CASE 1: LEFT ROTATION (RR)

    Node* a = new Node(10);

    a->right = new Node(20);
    a->right->right = new Node(30);

    updateHeight(a->right);
    updateHeight(a);

    testRotation("LEFT ROTATION", a, 1);

    // CASE 2: RIGHT ROTATION (LL)

    Node* b = new Node(30);

    b->left = new Node(20);
    b->left->left = new Node(10);

    updateHeight(b->left);
    updateHeight(b);

    testRotation("RIGHT ROTATION", b, 2);

    // CASE 3: LEFT-RIGHT ROTATION (LR)

    Node* c = new Node(30);

    c->left = new Node(10);
    c->left->right = new Node(20);

    updateHeight(c->left);
    updateHeight(c);

    testRotation("LEFT-RIGHT ROTATION", c, 3);

    // CASE 4: RIGHT-LEFT ROTATION (RL)

    Node* d = new Node(10);

    d->right = new Node(30);
    d->right->left = new Node(20);

    updateHeight(d->right);
    updateHeight(d);

    testRotation("RIGHT-LEFT ROTATION", d, 4);

    return 0;
}
