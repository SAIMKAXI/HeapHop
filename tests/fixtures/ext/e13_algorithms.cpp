// label: sort with comparators and lambdas, binary search, max_element, accumulate, reverse
#include <iostream>
#include <vector>
#include <algorithm>
#include <numeric>
#include <string>
using namespace std;

struct Student {
    string name;
    int marks;
};

bool byMarks(const Student& a, const Student& b) {
    return a.marks > b.marks;
}

int calls = 0;
bool countingLess(int a, int b) {
    calls++;
    return a / 10 < b / 10;
}

int main() {
    vector<int> v = {42, 7, 19, 3, 88, 19, 56};
    sort(v.begin(), v.end());
    for (int x : v) cout << x << " ";
    cout << endl;
    sort(v.begin(), v.end(), greater<int>());
    for (int x : v) cout << x << " ";
    cout << endl;
    int arr[] = {9, 4, 7, 1};
    sort(arr, arr + 4);
    cout << arr[0] << arr[1] << arr[2] << arr[3] << endl;
    reverse(v.begin(), v.end());
    cout << v[0] << " " << *max_element(v.begin(), v.end()) << " " << *min_element(v.begin(), v.end()) << endl;
    cout << accumulate(v.begin(), v.end(), 0) << endl;
    cout << binary_search(v.begin(), v.end(), 19) << binary_search(v.begin(), v.end(), 20) << endl;
    cout << lower_bound(v.begin(), v.end(), 19) - v.begin() << " " << upper_bound(v.begin(), v.end(), 19) - v.begin() << endl;
    cout << count(v.begin(), v.end(), 19) << " " << (find(v.begin(), v.end(), 56) - v.begin()) << endl;

    vector<Student> cls = {{"Ali", 70}, {"Sara", 92}, {"Musa", 85}, {"Zain", 70}};
    sort(cls.begin(), cls.end(), byMarks);
    for (auto& s : cls) cout << s.name << " ";
    cout << endl;
    sort(cls.begin(), cls.end(), [](const Student& a, const Student& b) { return a.name < b.name; });
    for (auto& s : cls) cout << s.name << " ";
    cout << endl;
    int limit = 80;
    int above = count_if(cls.begin(), cls.end(), [&](const Student& s) { return s.marks > limit; });
    cout << above << " above " << limit << endl;

    vector<int> ties;
    for (int i = 0; i < 40; i++) ties.push_back((i * 37) % 50);
    sort(ties.begin(), ties.end(), countingLess);
    for (int x : ties) cout << x << " ";
    cout << endl << "comparisons " << calls << endl;

    vector<int> perm = {1, 2, 3};
    do {
        cout << perm[0] << perm[1] << perm[2] << " ";
    } while (next_permutation(perm.begin(), perm.end()));
    cout << endl;
    auto square = [](int x) { return x * x; };
    cout << square(7) << endl;
    return 0;
}
