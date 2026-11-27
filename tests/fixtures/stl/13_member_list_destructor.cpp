// label: a class with a list of structs, a destructor, and one made with new
#include <iostream>
#include <list>
#include <string>
using namespace std;
struct Course { string name; int credits; };
class Student {
public:
    string name;
    list<Course> courses;
    Student(string n) : name(n) {}
    ~Student() { cout << name << " leaves" << endl; }
    void add(string c, int cr) { Course x; x.name = c; x.credits = cr; courses.push_back(x); }
    int total() { int t = 0; for (Course c : courses) t += c.credits; return t; }
};
int main() {
    Student s("Musa");
    s.add("DSA", 4);
    s.add("COAL", 3);
    cout << s.name << " has " << s.total() << " credits" << endl;
    Student* p = new Student("Saim");
    p->add("CN", 3);
    cout << p->total() << endl;
    delete p;
    return 0;
}
