// label: inheritance, virtual functions, abstract classes and virtual destructors
#include <iostream>
#include <string>
using namespace std;

class Shape {
protected:
    string name;
public:
    Shape(string n) : name(n) { cout << "Shape(" << name << ")" << endl; }
    virtual ~Shape() { cout << "~Shape(" << name << ")" << endl; }
    virtual double area() const = 0;
    virtual void describe() const { cout << name << " with area " << area() << endl; }
    string getName() const { return name; }
};

class Rectangle : public Shape {
    double w, h;
public:
    Rectangle(double w, double h) : Shape("rectangle"), w(w), h(h) {}
    ~Rectangle() { cout << "~Rectangle" << endl; }
    double area() const override { return w * h; }
};

class Square : public Rectangle {
public:
    Square(double s) : Rectangle(s, s) { name = "square"; }
    void describe() const override { cout << "a square! "; Shape::describe(); }
};

class Circle : public Shape {
    double r;
public:
    Circle(double r) : Shape("circle"), r(r) {}
    double area() const override { return 3.14159 * r * r; }
};

class Animal {
public:
    void speak() { cout << "..." << endl; }
    virtual void move() { cout << "moves" << endl; }
};

class Dog : public Animal {
public:
    void speak() { cout << "Woof" << endl; }
    void move() override { cout << "runs" << endl; }
};

void show(Animal& a) { a.speak(); a.move(); }

class Base {
public:
    ~Base() { cout << "~Base" << endl; }
};
class Derived : public Base {
public:
    ~Derived() { cout << "~Derived" << endl; }
};

int main() {
    Shape* shapes[3];
    shapes[0] = new Rectangle(2, 3);
    shapes[1] = new Circle(1);
    shapes[2] = new Square(4);
    double total = 0;
    for (int i = 0; i < 3; i++) {
        shapes[i]->describe();
        total += shapes[i]->area();
    }
    cout << "total " << total << endl;
    for (int i = 0; i < 3; i++) delete shapes[i];

    Dog d;
    show(d);
    Animal* p = &d;
    p->speak();
    p->move();
    d.speak();

    Base* b = new Derived();
    delete b;
    Derived x;
    return 0;
}
