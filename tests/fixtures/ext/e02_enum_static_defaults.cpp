// label: enum, enum class, static variables and members, default arguments
#include <iostream>
#include <string>
using namespace std;

enum Color { RED, GREEN = 5, BLUE };
enum class Direction { Up, Down, Left, Right };

class Counter {
public:
    static int created;
    int id;
    Counter() { created++; id = created; }
    static int total() { return created; }
};
int Counter::created = 0;

int nextTicket() {
    static int ticket = 100;
    ticket++;
    return ticket;
}

void greet(string name, string greeting = "Hello", int times = 1);

void greet(string name, string greeting, int times) {
    for (int i = 0; i < times; i++) cout << greeting << ", " << name << "!" << endl;
}

int area(int w, int h = 10) { return w * h; }

const char* name(Direction d) {
    switch (d) {
        case Direction::Up: return "up";
        case Direction::Down: return "down";
        default: return "sideways";
    }
}

int main() {
    Color c = GREEN;
    cout << RED << " " << c << " " << BLUE << endl;
    if (c == GREEN) cout << "green" << endl;
    Direction d = Direction::Left;
    cout << name(Direction::Up) << " " << name(d) << " " << static_cast<int>(d) << endl;

    cout << nextTicket() << " " << nextTicket() << " " << nextTicket() << endl;

    Counter a, b;
    Counter* p = new Counter();
    cout << "created " << Counter::created << ", total() " << Counter::total() << ", ids " << a.id << b.id << p->id << endl;
    delete p;

    greet("Musa");
    greet("Saim", "Salam");
    greet("Team", "Hi", 2);
    cout << area(3) << " " << area(3, 4) << endl;
    return 0;
}
