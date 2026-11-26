// label: INT_MAX, long long, unsigned, size_t, sizeof, casts and numeric_limits
#include <iostream>
#include <climits>
#include <limits>
using namespace std;

typedef long long ll;
using ull = unsigned long long;
const ll MOD = 1e9 + 7;

struct Node {
    int data;
    Node* next;
};

ll factorial(int n) {
    ll result = 1;
    for (int i = 2; i <= n; i++) result *= i;
    return result;
}

int main() {
    int arr[] = {5, 3, 8, 1, 9, 2};
    int n = sizeof(arr) / sizeof(arr[0]);
    cout << "n = " << n << endl;
    cout << sizeof(int) << " " << sizeof(double) << " " << sizeof(char) << " " << sizeof(Node) << " " << sizeof(Node*) << endl;

    int smallest = INT_MAX, largest = INT_MIN;
    for (int i = 0; i < n; i++) {
        if (arr[i] < smallest) smallest = arr[i];
        if (arr[i] > largest) largest = arr[i];
    }
    cout << "min " << smallest << " max " << largest << endl;
    cout << INT_MAX << " " << INT_MIN << " " << LLONG_MAX << endl;
    cout << numeric_limits<int>::max() << " " << numeric_limits<long long>::min() << endl;

    cout << "20! = " << factorial(20) << endl;
    int a = 100000, b = 100000;
    cout << "as int: " << a * b << ", as long long: " << (long long)a * b << endl;
    ll big = 1;
    for (int i = 0; i < 40; i++) big = big * 3 % MOD;
    cout << "3^40 mod 1e9+7 = " << big << endl;

    unsigned int u = 0;
    u = u - 1;
    cout << "unsigned 0 - 1 = " << u << endl;
    ull huge = 18446744073709551615ULL;
    cout << huge << " " << huge + 1 << endl;
    size_t count = 3;
    cout << count * 2 << endl;

    double avg = (double)(arr[0] + arr[1]) / 2;
    cout << avg << " " << (int)3.99 << " " << static_cast<char>(65) << " " << int('a') << " " << (int)-2.5 << endl;
    cout << 7 / 2 << " " << 7 / 2.0 << " " << -7 % 3 << endl;
    return 0;
}
