// label: BFS and Dijkstra with vector adjacency lists, a queue and a priority_queue
#include <iostream>
#include <vector>
#include <queue>
#include <climits>
using namespace std;

int main() {
    int V = 5;
    vector<int> adj[5];
    int edges[][2] = {{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}};
    for (auto& e : edges) {
        adj[e[0]].push_back(e[1]);
        adj[e[1]].push_back(e[0]);
    }
    vector<bool> visited(V, false);
    queue<int> q;
    q.push(0);
    visited[0] = true;
    cout << "BFS:";
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        cout << " " << u;
        for (int w : adj[u]) {
            if (!visited[w]) { visited[w] = true; q.push(w); }
        }
    }
    cout << endl;

    vector<vector<pair<int, int>>> g(V);
    g[0].push_back({1, 4});
    g[0].push_back({2, 1});
    g[2].push_back({1, 2});
    g[1].push_back({3, 1});
    g[2].push_back({3, 5});
    g[3].push_back({4, 3});
    vector<int> dist(V, INT_MAX);
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<pair<int, int>>> pq;
    dist[0] = 0;
    pq.push({0, 0});
    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        if (d > dist[u]) continue;
        for (auto& [v, w] : g[u]) {
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.push({dist[v], v});
            }
        }
    }
    for (int i = 0; i < V; i++) cout << "dist[" << i << "] = " << dist[i] << endl;
    return 0;
}
