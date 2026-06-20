import numpy as np
import pandas as pd
from scipy.spatial import cKDTree
from pipeline.adjective import build_adjective_lookup
from pipeline.extract_streets import extract_street_prefix

EARTH_RADIUS_KM = 6371.0


def _nearest_from_candidates(
    street_lat: float, street_lon: float,
    candidate_ids: list[str], cities_df: pd.DataFrame,
) -> str:
    candidates = cities_df[cities_df["id"].isin(candidate_ids)]
    if len(candidates) == 1:
        return str(candidates.iloc[0]["id"])
    coords = np.radians(candidates[["lat", "lon"]].values)
    query = np.radians([[street_lat, street_lon]])
    _, idx = cKDTree(coords).query(query)
    return str(candidates.iloc[idx[0]]["id"])


def extract_edges(streets: pd.DataFrame, cities: pd.DataFrame) -> pd.DataFrame:
    lookup = build_adjective_lookup(cities)
    edges = []
    for _, row in streets.iterrows():
        source_id = str(row.get("city_id", ""))
        if not source_id or source_id == "nan":
            continue
        prefix = extract_street_prefix(str(row["name"]))
        targets = [t for t in lookup.get(prefix, []) if t != source_id]
        if not targets:
            continue
        target_id = (
            targets[0]
            if len(targets) == 1
            else _nearest_from_candidates(row["lat"], row["lon"], targets, cities)
        )
        edges.append({"source_id": source_id, "target_id": target_id})
    return pd.DataFrame(edges).drop_duplicates() if edges else pd.DataFrame(columns=["source_id", "target_id"])


def run(
    streets_path: str = "data/streets_assigned.csv",
    cities_path: str = "data/cities.csv",
    output_path: str = "data/edges.csv",
) -> pd.DataFrame:
    streets = pd.read_csv(streets_path)
    cities = pd.read_csv(cities_path)
    streets = streets[streets["city_id"].notna() & (streets["city_id"] != "")]
    edges = extract_edges(streets, cities)
    edges.to_csv(output_path, index=False)
    print(f"Built {len(edges):,} directed edges -> {output_path}")
    return edges


if __name__ == "__main__":
    run()
