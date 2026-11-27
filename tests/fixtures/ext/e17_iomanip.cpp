// label: formatted output with fixed, setprecision, setw and setfill
#include <iostream>
#include <iomanip>
#include <string>
using namespace std;

int main() {
    double marks[] = {78.5, 91.25, 66.0};
    string names[] = {"Ali", "Sara", "Musa"};
    double total = 0;
    cout << left << setw(8) << "Name" << right << setw(8) << "Marks" << endl;
    for (int i = 0; i < 3; i++) {
        cout << left << setw(8) << names[i] << right << setw(8) << fixed << setprecision(1) << marks[i] << endl;
        total += marks[i];
    }
    cout << "Average: " << setprecision(2) << total / 3 << endl;
    cout << defaultfloat << setprecision(4) << 3.14159265 << " " << 1234567.0 << " " << 0.0001234 << endl;
    cout << setfill('0') << setw(5) << 42 << endl;
    cout << boolalpha << (3 > 2) << " " << noboolalpha << (3 > 2) << endl;
    cout << 1.0 / 3 << endl;
    return 0;
}
