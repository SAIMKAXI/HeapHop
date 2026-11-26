// label: std::vector: push_back, size, capacity, insert, erase, 2-D vectors
#include <iostream>
#include <vector>
using namespace std;

void printAll(const vector<int>& v) {
    for (int x : v) cout << x << " ";
    cout << "(size " << v.size() << ")" << endl;
}

vector<int> evens(int n) {
    vector<int> out;
    for (int i = 0; i < n; i += 2) out.push_back(i);
    return out;
}

int main() {
    vector<int> v;
    for (int i = 1; i <= 5; i++) {
        v.push_back(i * 10);
        cout << "size " << v.size() << " capacity " << v.capacity() << endl;
    }
    printAll(v);
    v.pop_back();
    v.insert(v.begin() + 1, 15);
    v.erase(v.begin());
    printAll(v);
    cout << v.front() << " " << v.back() << " " << v[1] << " " << v.at(2) << endl;
    v[0] = 99;
    v.back() += 1;
    printAll(v);
    vector<int> w(4, 7);
    printAll(w);
    vector<int> copy = v;
    copy.push_back(1);
    cout << v.size() << " " << copy.size() << " " << (v == copy) << endl;
    printAll(evens(9));
    vector<vector<int>> grid(3, vector<int>(4, 0));
    for (int r = 0; r < 3; r++)
        for (int c = 0; c < 4; c++) grid[r][c] = r * c;
    for (auto& row : grid) {
        for (int x : row) cout << x << " ";
        cout << endl;
    }
    vector<int> nums = {5, 2, 8};
    nums.resize(5);
    printAll(nums);
    int total = 0;
    for (vector<int>::iterator it = nums.begin(); it != nums.end(); ++it) total += *it;
    cout << "total " << total << endl;
    for (size_t i = 0; i < nums.size(); i++) cout << nums[i] << ",";
    cout << endl;
    vector<int> empty;
    cout << empty.empty() << " " << empty.size() - 1 << endl;
    nums.clear();
    cout << nums.size() << " " << nums.capacity() << endl;
    return 0;
}
