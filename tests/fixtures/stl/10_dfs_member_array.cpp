// label: depth-first search with an array of lists inside a class
#include <iostream>
#include <list>
using namespace std;

class Graph {
public:
    list<int> adj[5];
    bool visited[5];
    Graph() {
        for (int i = 0; i < 5; i++) visited[i] = false;
    }
    void addEdge(int u, int v) {
        adj[u].push_back(v);
        adj[v].push_back(u);
    }
    void dfs(int u) {
        visited[u] = true;
        cout << u << " ";
        for (int v : adj[u]) {
            if (!visited[v]) dfs(v);
        }
    }
};

int main() {
    Graph g;
    g.addEdge(0, 1);
    g.addEdge(0, 4);
    g.addEdge(1, 2);
    g.addEdge(1, 3);
    g.dfs(0);
    cout << endl;
    return 0;
}
