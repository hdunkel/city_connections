import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

EARTH_RADIUS_KM = 6371.0


def assign_nearest_city(
    streets: pd.DataFrame,
    cities: pd.DataFrame,
    max_dist_km: float = 50.0,
) -> pd.DataFrame:
    city_coords = np.radians(cities[["lat", "lon"]].values)
    street_coords = np.radians(streets[["lat", "lon"]].values)
    max_dist_rad = max_dist_km / EARTH_RADIUS_KM

    tree = cKDTree(city_coords)
    dists, indices = tree.query(street_coords, distance_upper_bound=max_dist_rad)

    city_ids = [
        "" if d == np.inf or d > max_dist_rad else str(cities.iloc[i]["id"])
        for d, i in zip(dists, indices)
    ]
    result = streets.copy()
    result["city_id"] = city_ids
    return result


def run(
    streets_path: str = "data/streets.csv",
    cities_path: str = "data/cities.csv",
    output_path: str = "data/streets_assigned.csv",
) -> pd.DataFrame:
    streets = pd.read_csv(streets_path)
    cities = pd.read_csv(cities_path)
    result = assign_nearest_city(streets, cities)
    result.to_csv(output_path, index=False)
    assigned = (result["city_id"] != "").sum()
    print(f"Assigned {assigned:,}/{len(result):,} streets -> {output_path}")
    return result


if __name__ == "__main__":
    run()
