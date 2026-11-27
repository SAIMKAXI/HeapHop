// label: changing a string, string functions, <cctype>, <cmath>, rand and exit
#include <iostream>
#include <string>
#include <cctype>
#include <cmath>
#include <cstdlib>
using namespace std;

string reversed(string s) {
    int i = 0, j = s.length() - 1;
    while (i < j) {
        swap(s[i], s[j]);
        i++;
        j--;
    }
    return s;
}

bool isPalindrome(string s) {
    return s == reversed(s);
}

int main() {
    string word = "stack";
    word[0] = 'S';
    word.push_back('s');
    cout << word << " " << reversed(word) << endl;
    word.pop_back();
    cout << word << " " << word.front() << word.back() << " " << word.substr(1, 3) << endl;
    cout << isPalindrome("level") << isPalindrome("heap") << endl;
    string text = "a+b*c";
    if (text.find('*') != string::npos) cout << "found * at " << text.find('*') << endl;
    if (text.find('/') == string::npos) cout << "no /" << endl;

    string expr = "12+3x";
    int digits = 0;
    for (int i = 0; i < (int)expr.size(); i++) {
        if (isdigit(expr[i])) digits++;
        expr[i] = toupper(expr[i]);
    }
    cout << digits << " digits, " << expr << endl;
    cout << to_string(42) + "!" << " " << stoi("123") + 1 << endl;

    cout << sqrt(16.0) << " " << pow(2, 10) << " " << floor(2.7) << " " << ceil(2.1) << " " << abs(-5) << " " << fabs(-1.5) << endl;
    srand(7);
    int r1 = rand() % 100, r2 = rand() % 100;
    cout << "random " << r1 << " " << r2 << endl;

    cout << "about to exit" << endl;
    exit(0);
    cout << "never printed" << endl;
    return 0;
}
