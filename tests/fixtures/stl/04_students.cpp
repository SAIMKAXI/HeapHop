// label: a list of structs, plus sort, reverse, remove and unique
#include <iostream>
#include <list>
#include <string>
using namespace std;

struct Student {
    string name;
    int marks;
};

int main() {
    list<Student> students;
    Student a;
    a.name = "Ali";
    a.marks = 72;
    students.push_back(a);
    a.name = "Sara";
    a.marks = 88;
    students.push_back(a);
    a.name = "Bilal";
    a.marks = 65;
    students.push_front(a);
    for (auto it = students.begin(); it != students.end(); ++it) {
        cout << it->name << " " << it->marks << endl;
    }
    for (Student& s : students) s.marks += 5;
    cout << "after bonus: ";
    for (const auto& s : students) cout << s.marks << " ";
    cout << endl;

    list<int> scores = {5, 3, 3, 8, 1, 3, 8, 8};
    scores.sort();
    for (int x : scores) cout << x << " ";
    cout << endl;
    scores.unique();
    for (int x : scores) cout << x << " ";
    cout << endl;
    scores.reverse();
    for (int x : scores) cout << x << " ";
    cout << endl;
    scores.remove(3);
    for (int x : scores) cout << x << " ";
    cout << endl;
    return 0;
}
