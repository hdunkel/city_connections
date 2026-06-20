import pandas as pd
import networkx as nx
from analysis.compute import build_graph, compute_stats


def _fixture():
    cities = pd.DataFrame([
        {"id": "A", "name": "Aachen",   "lat": 50.77, "lon":  6.09, "population": 250000},
        {"id": "B", "name": "Berlin",   "lat": 52.52, "lon": 13.40, "population": 3700000},
        {"id": "C", "name": "Chemnitz", "lat": 50.83, "lon": 12.92, "population": 230000},
    ])
    edges = pd.DataFrame([
        {"source_id": "A", "target_id": "B"},
        {"source_id": "B", "target_id": "C"},
    ])
    return cities, edges


def test_build_graph_structure():
    cities, edges = _fixture()
    G = build_graph(cities, edges)
    assert isinstance(G, nx.DiGraph)
    assert G.number_of_nodes() == 3
    assert G.number_of_edges() == 2
    assert G.has_edge("A", "B")
    assert not G.has_edge("B", "A")


def test_compute_stats_keys():
    cities, edges = _fixture()
    G = build_graph(cities, edges)
    stats = compute_stats(G, cities)
    for key in [
        "node_count", "edge_count", "wcc_count", "largest_wcc_size",
        "scc_count", "largest_scc_size", "diameter_path", "diameter_length",
        "top_betweenness", "top_in_degree", "top_out_degree",
    ]:
        assert key in stats, f"Missing key: {key}"


def test_diameter():
    cities, edges = _fixture()
    G = build_graph(cities, edges)
    stats = compute_stats(G, cities)
    assert stats["diameter_length"] == 2
    assert stats["diameter_path"] == ["A", "B", "C"]


def test_in_degree_top():
    cities, edges = _fixture()
    G = build_graph(cities, edges)
    stats = compute_stats(G, cities)
    # B has in-degree 1 (from A), C has in-degree 1 (from B)
    top_ids = [e["id"] for e in stats["top_in_degree"]]
    assert "A" not in top_ids or stats["top_in_degree"][top_ids.index("A")]["count"] == 0
