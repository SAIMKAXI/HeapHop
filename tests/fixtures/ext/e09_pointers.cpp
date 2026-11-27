// label: pointer arithmetic on arrays
#include <iostream>
using namespace std;

int sum(int* begin, int* end) {
    int total = 0;
    for (int* p = begin; p != end; p++) total += *p;
    return total;
}

int main() {
    int arr[5] = {10, 20, 30, 40, 50};
    int* p = arr;
    cout << *p << " " << *(p + 2) << " " << p[3] << endl;
    p++;
    cout << *p << endl;
    p += 2;
    cout << *p << " " << p - arr << endl;
    int* last = &arr[4];
    cout << last - p << " " << (p < last) << endl;
    cout << sum(arr, arr + 5) << endl;
    for (int* q = arr + 4; q >= arr; q--) cout << *q << " ";
    cout << endl;
    int* dyn = new int[4];
    for (int i = 0; i < 4; i++) *(dyn + i) = i * i;
    int* walker = dyn;
    while (walker != dyn + 4) {
        cout << *walker << " ";
        walker++;
    }
    cout << endl;
    delete[] dyn;
    char word[] = "hello";
    char* c = word;
    int len = 0;
    while (*c != '\0') { len++; c++; }
    cout << "length " << len << endl;
    return 0;
}
