// label: reading until the input ends with while (cin >> x) and getline
#include <iostream>
#include <string>
using namespace std;

int main() {
    int count;
    cin >> count;
    cin.ignore();
    string line;
    for (int i = 0; i < count; i++) {
        getline(cin, line);
        cout << "line: " << line << endl;
    }
    int x, sum = 0, numbers = 0;
    while (cin >> x) {
        sum += x;
        numbers++;
    }
    cout << numbers << " numbers, sum " << sum << endl;
    if (!(cin >> x)) cout << "nothing more to read" << endl;
    return 0;
}
