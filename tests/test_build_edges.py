import pandas as pd
from pipeline.build_edges import extract_edges


def _cities():
    return pd.DataFrame([
        {"id": "Q64",   "name": "Berlin",  "lat": 52.52, "lon": 13.40},
        {"id": "Q1055", "name": "Hamburg", "lat": 53.55, "lon": 10.00},
    ])


def test_basic_edge():
    streets = pd.DataFrame([
        {"name": "Hamburger Straße", "lat": 52.50, "lon": 13.38, "city_id": "Q64"},
    ])
    edges = extract_edges(streets, _cities())
    assert len(edges) == 1
    assert edges.iloc[0]["source_id"] == "Q64"
    assert edges.iloc[0]["target_id"] == "Q1055"


def test_no_self_edges():
    streets = pd.DataFrame([
        {"name": "Berliner Straße", "lat": 52.50, "lon": 13.38, "city_id": "Q64"},
    ])
    edges = extract_edges(streets, _cities())
    assert len(edges) == 0


def test_unassigned_streets_skipped():
    streets = pd.DataFrame([
        {"name": "Hamburger Straße", "lat": 52.50, "lon": 13.38, "city_id": ""},
    ])
    edges = extract_edges(streets, _cities())
    assert len(edges) == 0


def test_deduplication():
    streets = pd.DataFrame([
        {"name": "Hamburger Straße", "lat": 52.50, "lon": 13.40, "city_id": "Q64"},
        {"name": "Hamburger Str.",   "lat": 52.51, "lon": 13.41, "city_id": "Q64"},
    ])
    edges = extract_edges(streets, _cities())
    assert len(edges) == 1
