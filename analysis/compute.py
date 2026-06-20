import json
import networkx as nx
import pandas as pd
from pathlib import Path


def build_graph(cities: pd.DataFrame, edges: pd.DataFrame) -> nx.DiGraph:
    G = nx.DiGraph()
    for _, row in cities.iterrows():
        G.add_node(str(row["id"]), name=str(row["name"]),
                   lat=float(row["lat"]), lon=float(row["lon"]),
                   population=int(row["population"]))
    valid_ids = set(G.nodes())
    for _, row in edges.iterrows():
        s, t = str(row["source_id"]), str(row["target_id"])
        if s in valid_ids and t in valid_ids:
            G.add_edge(s, t)
    return G


def _diameter_of_largest_wcc(G: nx.DiGraph) -> tuple:
    largest = max(nx.weakly_connected_components(G), key=len)
    sub = G.subgraph(largest)
    max_len, max_path = 0, []
    for source in sub.nodes():
        lengths = nx.single_source_shortest_path_length(sub, source)
        for target, length in lengths.items():
            if length > max_len:
                max_len = length
                max_path = nx.shortest_path(sub, source, target)
    return max_len, max_path


def compute_stats(G: nx.DiGraph, cities: pd.DataFrame) -> dict:
    id_to_name = dict(zip(cities["id"].astype(str), cities["name"].astype(str)))
    wccs = list(nx.weakly_connected_components(G))
    sccs = list(nx.strongly_connected_components(G))
    diameter, path = _diameter_of_largest_wcc(G)
    betweenness = nx.betweenness_centrality(G)
    in_deg = dict(G.in_degree())
    out_deg = dict(G.out_degree())

    def top20_score(d: dict) -> list:
        return [{"id": k, "name": id_to_name.get(k, k), "score": round(v, 6)}
                for k, v in sorted(d.items(), key=lambda x: -x[1])[:20]]

    def top20_count(d: dict) -> list:
        return [{"id": k, "name": id_to_name.get(k, k), "count": v}
                for k, v in sorted(d.items(), key=lambda x: -x[1])[:20]]

    return {
        "node_count": G.number_of_nodes(),
        "edge_count": G.number_of_edges(),
        "wcc_count": len(wccs),
        "largest_wcc_size": max(len(c) for c in wccs),
        "scc_count": len(sccs),
        "largest_scc_size": max(len(c) for c in sccs),
        "diameter_path": path,
        "diameter_length": diameter,
        "top_betweenness": top20_score(betweenness),
        "top_in_degree": top20_count(in_deg),
        "top_out_degree": top20_count(out_deg),
    }


def export_graph_json(G: nx.DiGraph, output_path: str = "data/graph.json"):
    data = {
        "nodes": [{"id": n, **G.nodes[n]} for n in G.nodes()],
        "edges": [{"source": u, "target": v} for u, v in G.edges()],
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    print(f"Exported graph -> {output_path}")


def run(
    cities_path: str = "data/cities.csv",
    edges_path: str = "data/edges.csv",
):
    Path("data").mkdir(exist_ok=True)
    cities = pd.read_csv(cities_path)
    edges = pd.read_csv(edges_path)
    G = build_graph(cities, edges)
    print(f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    stats = compute_stats(G, cities)
    with open("data/stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print("Saved data/stats.json")
    export_graph_json(G)


if __name__ == "__main__":
    run()
