// label: push, pop, front, back, size and empty on a list of ints
#include <iostream>
#include <list>
using namespace std;

int main() {
    list<int> nums;
    cout << "empty at start: " << nums.empty() << endl;
    nums.push_back(10);
    nums.push_back(20);
    nums.push_front(5);
    nums.push_back(30);
    cout << "size: " << nums.size() << endl;
    cout << "front: " << nums.front() << ", back: " << nums.back() << endl;
    for (int x : nums) cout << x << " ";
    cout << endl;
    nums.pop_front();
    nums.pop_back();
    nums.front() = 99;
    nums.back() += 1;
    for (int x : nums) cout << x << " ";
    cout << endl;
    cout << "size now: " << nums.size() << endl;
    return 0;
}
