// label: a list of pointers to nodes the program creates itself
#include <iostream>
#include <list>
using namespace std;

struct Task {
    int id;
    int priority;
    Task(int i, int p) : id(i), priority(p) {}
};

int main() {
    list<Task*> tasks;
    tasks.push_back(new Task(1, 3));
    tasks.push_back(new Task(2, 1));
    tasks.push_back(new Task(3, 2));
    for (Task* t : tasks) cout << "task " << t->id << " priority " << t->priority << endl;
    Task* first = tasks.front();
    first->priority = 10;
    cout << "first task now has priority " << tasks.front()->priority << endl;
    while (!tasks.empty()) {
        delete tasks.back();
        tasks.pop_back();
    }
    cout << "all done, size " << tasks.size() << endl;
    return 0;
}
