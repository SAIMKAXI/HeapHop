// label: singly | class | student records with a string field and a switch statement
#include <iostream>
#include <string>
using namespace std;

struct Student {
    int roll;
    string name;
    Student* next;
};

class StudentList {
    Student* head;

public:
    StudentList() { head = NULL; }

    void add(int roll, string name) {
        Student* s = new Student();
        s->roll = roll;
        s->name = name;
        s->next = NULL;
        if (head == NULL) {
            head = s;
        } else {
            Student* t = head;
            while (t->next != NULL) t = t->next;
            t->next = s;
        }
    }

    void show() {
        Student* t = head;
        while (t != NULL) {
            cout << t->roll << ": " << t->name << endl;
            t = t->next;
        }
    }

    void describe(int roll) {
        Student* t = head;
        while (t != NULL) {
            if (t->roll != roll) {
                t = t->next;
                continue;
            }
            switch (t->roll % 3) {
                case 0:
                    cout << t->name << " is in group A" << endl;
                    break;
                case 1:
                    cout << t->name << " is in group B" << endl;
                    break;
                default:
                    cout << t->name << " is in group C" << endl;
            }
            break;
        }
    }
};

int main() {
    StudentList list;
    list.add(101, "Ali");
    list.add(102, "Sara");
    list.add(103, "Hamza");
    list.show();
    list.describe(102);
    list.describe(103);
    return 0;
}
