// label: singly | class | cin and getline: build a list of student records from typed input
#include <iostream>
#include <string>
using namespace std;

struct Student {
    int roll;
    string name;
    double gpa;
    Student* next;
};

int main() {
    Student* head = NULL;
    Student* tail = NULL;
    int n;
    cout << "How many students? ";
    cin >> n;
    for (int i = 0; i < n; i++) {
        Student* s = new Student();
        cout << "Roll number: ";
        cin >> s->roll;
        cin.ignore();
        cout << "Full name: ";
        getline(cin, s->name);
        cout << "GPA: ";
        cin >> s->gpa;
        s->next = NULL;
        if (head == NULL) head = s;
        else tail->next = s;
        tail = s;
    }
    char again;
    cout << "Print the list? (y/n) ";
    cin >> again;
    if (again == 'y') {
        for (Student* t = head; t != NULL; t = t->next) {
            cout << t->roll << " | " << t->name << " | " << t->gpa << endl;
        }
    }
    return 0;
}
