// label: std::list written with std:: and no using namespace
#include <iostream>
#include <list>

int main() {
    std::list<int> values;
    for (int i = 1; i <= 5; i++) values.push_back(i * i);
    std::list<int>::iterator it = values.begin();
    std::advance(it, 2);
    std::cout << "third: " << *it << std::endl;
    std::cout << "next: " << *std::next(it) << ", prev: " << *std::prev(it) << std::endl;
    std::cout << "distance to end: " << std::distance(it, values.end()) << std::endl;
    std::cout << "last via --end(): " << *(--values.end()) << std::endl;
    return 0;
}
