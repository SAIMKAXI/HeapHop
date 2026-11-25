// label: walking, inserting and erasing with iterators
#include <iostream>
#include <list>
using namespace std;

void print(const list<int>& l) {
    for (list<int>::const_iterator it = l.begin(); it != l.end(); ++it) {
        cout << *it << " ";
    }
    cout << endl;
}

int main() {
    list<int> nums = {1, 2, 3, 4, 5, 6};
    print(nums);

    // insert 100 before the third element
    list<int>::iterator it = nums.begin();
    it++;
    ++it;
    nums.insert(it, 100);
    print(nums);

    // erase every even number
    it = nums.begin();
    while (it != nums.end()) {
        if (*it % 2 == 0) {
            it = nums.erase(it);
        } else {
            ++it;
        }
    }
    print(nums);

    // walk backwards from the end
    it = nums.end();
    while (it != nums.begin()) {
        --it;
        cout << *it << " ";
    }
    cout << endl;
    return 0;
}
