"""
Extract German street names ending in Straße / Strasse / Str. from an OSM PBF file.

Usage (once the PBF file exists):
    python -m pipeline.extract_streets
"""

import osmium
import shapely.wkb
import pandas as pd
from pathlib import Path

SUFFIXES = (" Straße", " Strasse", " Str.")


def is_target_street(name: str) -> bool:
    """Return True iff *name* ends with one of the target suffixes."""
    return bool(name) and any(name.endswith(s) for s in SUFFIXES)


def extract_street_prefix(name: str) -> str:
    """Return the lower-cased prefix of *name* with the suffix stripped."""
    for suffix in SUFFIXES:
        if name.endswith(suffix):
            return name[: -len(suffix)].strip().lower()
    return name.lower()


class StreetHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self._fab = osmium.geom.WKBFactory()
        self.streets: list[dict] = []

    def way(self, w):
        name = w.tags.get("name")
        if not name or not is_target_street(name):
            return
        try:
            wkb = self._fab.create_linestring(w)
            geom = shapely.wkb.loads(wkb, hex=True)
            c = geom.centroid
            self.streets.append({"name": name, "lon": c.x, "lat": c.y})
        except Exception:
            pass


def extract_streets(
    pbf_path: str = "data/germany-latest.osm.pbf",
    output_path: str = "data/streets.csv",
    node_cache: str = "data/node_cache",
) -> pd.DataFrame:
    """
    Parse *pbf_path* and write matching streets to *output_path* as CSV.

    Parameters
    ----------
    pbf_path:    Path to the OSM PBF file (must already exist).
    output_path: Destination CSV path.
    node_cache:  Path for the osmium sparse-file node-location cache.

    Returns
    -------
    pd.DataFrame with columns: name (str), lon (float), lat (float)
    """
    handler = StreetHandler()
    handler.apply_file(pbf_path, locations=True,
                       idx=f"sparse_file_array,{node_cache}")
    df = pd.DataFrame(handler.streets)
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Extracted {len(df):,} streets to {output_path}")
    return df


if __name__ == "__main__":
    extract_streets()
