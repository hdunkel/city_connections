# City Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a directed graph of German cities connected by street-naming conventions, analyze it with NetworkX, and present findings as an interactive GitHub Pages Reveal.js slide deck.

**Architecture:** Three sequential phases — (1) data pipeline fetches a city list from Wikidata, downloads the Germany OSM PBF, extracts street names, and produces a directed edge list; (2) graph analysis computes connectivity, diameter, betweenness centrality, and degree stats, exporting static JSON; (3) a Reveal.js frontend on GitHub Pages loads that JSON, renders a D3 geographic map, and runs a client-side BFS pathfinder.

**Tech Stack:** Python 3.11+, pyosmium, geopandas, shapely, scipy, networkx, pandas, requests, pytest; Reveal.js 5.x, D3.js v7, vanilla JS

## Global Constraints

- Python 3.11+
- All generated data files live in `data/` — large files (PBF, node cache) are gitignored
- Street suffix filter: only `" Straße"`, `"Strasse"`, `" Str."` — no Weg, Platz, Allee, Gasse, etc.
- Adjective forms only — no raw city-name substring matching
- Unmatched streets produce no edge and are silently discarded
- Ambiguity: nearest city centroid wins (max 50 km); if no city within 50 km, discard
- Graph is directed: edge A→B means city A has a street whose adjective form resolves to city B
- No self-edges (a city cannot reference itself)
- Frontend deployed to GitHub Pages from `web/` directory; data files committed under `web/data/`

---

### Task 1: Environment Setup

**Files:**
- Create: `requirements.txt`
- Create: `pipeline/__init__.py`
- Create: `analysis/__init__.py`
- Create: `tests/__init__.py`
- Create: `pytest.ini`
- Create: `.gitignore`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p data pipeline analysis tests web/css web/js web/data
touch pipeline/__init__.py analysis/__init__.py tests/__init__.py
```

- [ ] **Step 2: Create requirements.txt**

```
osmium==3.7.0
geopandas==1.0.1
shapely==2.0.6
networkx==3.4.2
pandas==2.2.3
requests==2.32.3
scipy==1.14.1
pytest==8.3.4
```

- [ ] **Step 3: Install dependencies**

```bash
pip install -r requirements.txt
```

Expected: all packages install without error.

- [ ] **Step 4: Create pytest.ini**

```ini
[pytest]
testpaths = tests
python_files = test_*.py
```

- [ ] **Step 5: Create .gitignore**

```
data/*.osm.pbf
data/node_cache*
data/cities.csv
data/streets.csv
data/streets_assigned.csv
data/edges.csv
__pycache__/
*.pyc
.pytest_cache/
```

- [ ] **Step 6: Verify pytest runs on empty suite**

```bash
pytest
```

Expected: `no tests ran`, exit 0.

- [ ] **Step 7: Commit**

```bash
git init
git add requirements.txt pytest.ini .gitignore pipeline/ analysis/ tests/
git commit -m "feat: project scaffold"
```

---

### Task 2: City List from Wikidata

**Files:**
- Create: `pipeline/fetch_cities.py`
- Create: `tests/test_fetch_cities.py`

**Interfaces:**
- Produces: `data/cities.csv` with columns `id` (Wikidata QID string e.g. `"Q64"`), `name` (German string), `lat` (float), `lon` (float), `population` (int)

- [ ] **Step 1: Write failing test**

```python
# tests/test_fetch_cities.py
import pandas as pd
from pipeline.fetch_cities import parse_wikidata_results

def test_parse_wikidata_results():
    raw = {
        "results": {
            "bindings": [
                {
                    "city": {"value": "http://www.wikidata.org/entity/Q64"},
                    "cityLabel": {"value": "Berlin"},
                    "population": {"value": "3769495"},
                    "lat": {"value": "52.5166666"},
                    "lon": {"value": "13.3833333"},
                }
            ]
        }
    }
    df = parse_wikidata_results(raw)
    assert len(df) == 1
    assert df.iloc[0]["id"] == "Q64"
    assert df.iloc[0]["name"] == "Berlin"
    assert abs(df.iloc[0]["lat"] - 52.5166666) < 0.001
    assert df.iloc[0]["population"] == 3769495

def test_deduplication():
    raw = {
        "results": {
            "bindings": [
                {
                    "city": {"value": "http://www.wikidata.org/entity/Q64"},
                    "cityLabel": {"value": "Berlin"},
                    "population": {"value": "3769495"},
                    "lat": {"value": "52.52"},
                    "lon": {"value": "13.40"},
                },
                {
                    "city": {"value": "http://www.wikidata.org/entity/Q64"},
                    "cityLabel": {"value": "Berlin"},
                    "population": {"value": "3769495"},
                    "lat": {"value": "52.52"},
                    "lon": {"value": "13.40"},
                },
            ]
        }
    }
    df = parse_wikidata_results(raw)
    assert len(df) == 1
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_fetch_cities.py -v
```

Expected: `ImportError`

- [ ] **Step 3: Implement fetch_cities.py**

```python
# pipeline/fetch_cities.py
import requests
import pandas as pd
from pathlib import Path

WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql"

SPARQL_QUERY = """
SELECT DISTINCT ?city ?cityLabel ?population ?lat ?lon WHERE {
  ?city wdt:P17 wd:Q183 ;
        wdt:P1082 ?population .
  ?city p:P625 ?coordStatement .
  ?coordStatement psv:P625 ?coordValue .
  ?coordValue wikibase:geoLatitude ?lat .
  ?coordValue wikibase:geoLongitude ?lon .
  FILTER(?population > 5000)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de" . }
}
ORDER BY DESC(?population)
"""

def fetch_cities() -> dict:
    resp = requests.get(
        WIKIDATA_ENDPOINT,
        params={"query": SPARQL_QUERY, "format": "json"},
        headers={"User-Agent": "city-connections-research/1.0"},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()

def parse_wikidata_results(raw: dict) -> pd.DataFrame:
    rows = []
    for binding in raw["results"]["bindings"]:
        entity_url = binding["city"]["value"]
        wikidata_id = entity_url.rsplit("/", 1)[-1]
        rows.append({
            "id": wikidata_id,
            "name": binding["cityLabel"]["value"],
            "population": int(binding["population"]["value"]),
            "lat": float(binding["lat"]["value"]),
            "lon": float(binding["lon"]["value"]),
        })
    return pd.DataFrame(rows).drop_duplicates(subset=["id"])

def save_cities(output_path: str = "data/cities.csv") -> pd.DataFrame:
    Path("data").mkdir(exist_ok=True)
    raw = fetch_cities()
    df = parse_wikidata_results(raw)
    df.to_csv(output_path, index=False)
    print(f"Saved {len(df)} cities to {output_path}")
    return df

if __name__ == "__main__":
    save_cities()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_fetch_cities.py -v
```

Expected: PASS

- [ ] **Step 5: Run the script to fetch real data**

```bash
python -m pipeline.fetch_cities
```

Expected: `Saved ~2000–2500 cities to data/cities.csv`

- [ ] **Step 6: Spot-check output**

```bash
python -c "
import pandas as pd
df = pd.read_csv('data/cities.csv')
print(df.head())
print('Total:', len(df))
"
```

Expected: Berlin at or near top, 2000–2500 rows, no nulls in lat/lon.

- [ ] **Step 7: Commit**

```bash
git add pipeline/fetch_cities.py tests/test_fetch_cities.py
git commit -m "feat: fetch German city list from Wikidata"
```

---

### Task 3: Adjective Form Module

**Files:**
- Create: `pipeline/adjective.py`
- Create: `tests/test_adjective.py`

**Interfaces:**
- Produces:
  - `generate_adjective_forms(city_name: str) -> list[str]`
  - `build_adjective_lookup(cities_df: pd.DataFrame) -> dict[str, list[str]]` — maps lowercase adjective form to list of city QIDs

- [ ] **Step 1: Write failing tests**

```python
# tests/test_adjective.py
import pandas as pd
from pipeline.adjective import generate_adjective_forms, build_adjective_lookup

def test_simple_addition():
    assert "Berliner" in generate_adjective_forms("Berlin")
    assert "Hamburger" in generate_adjective_forms("Hamburg")
    assert "Kölner" in generate_adjective_forms("Köln")
    assert "Frankfurter" in generate_adjective_forms("Frankfurt")

def test_en_ending():
    assert "Bremer" in generate_adjective_forms("Bremen")

def test_exception_overrides():
    forms = generate_adjective_forms("München")
    assert "Münchner" in forms
    assert "Münchener" in forms

def test_build_lookup_single_city():
    df = pd.DataFrame([{"id": "Q64", "name": "Berlin"}])
    lookup = build_adjective_lookup(df)
    assert "Q64" in lookup["berliner"]

def test_build_lookup_lowercase_keys():
    df = pd.DataFrame([{"id": "Q64", "name": "Berlin"}])
    lookup = build_adjective_lookup(df)
    assert "berliner" in lookup
    assert "Berliner" not in lookup

def test_build_lookup_multiple_cities_same_form():
    df = pd.DataFrame([
        {"id": "Q1", "name": "Neustadt"},
        {"id": "Q2", "name": "Neustadt an der Weinstraße"},
    ])
    lookup = build_adjective_lookup(df)
    # Both should produce a "neustadter" form (Q2 name + er → neustadter... actually
    # only Q1 matches cleanly; Q2's adjective is "neustadt an der weinstraßeer" which is invalid)
    assert "Q1" in lookup.get("neustadter", [])
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_adjective.py -v
```

Expected: ImportError

- [ ] **Step 3: Implement adjective.py**

```python
# pipeline/adjective.py
import pandas as pd
from collections import defaultdict

EXCEPTIONS: dict[str, list[str]] = {
    "München": ["Münchner", "Münchener"],
    "Dresden": ["Dresdner", "Dresdener"],
    "Hannover": ["Hannoveraner"],
    "Braunschweig": ["Braunschweiger"],
    "Magdeburg": ["Magdeburger"],
    "Nürnberg": ["Nürnberger"],
}

def generate_adjective_forms(city_name: str) -> list[str]:
    if city_name in EXCEPTIONS:
        return EXCEPTIONS[city_name]
    forms = [city_name + "er"]
    if city_name.endswith("en"):
        forms.append(city_name[:-2] + "er")
    if city_name.endswith("e"):
        forms.append(city_name + "r")
    return forms

def build_adjective_lookup(cities_df: pd.DataFrame) -> dict[str, list[str]]:
    lookup: dict[str, list[str]] = defaultdict(list)
    for _, row in cities_df.iterrows():
        for form in generate_adjective_forms(str(row["name"])):
            lookup[form.lower()].append(str(row["id"]))
    return dict(lookup)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_adjective.py -v
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/adjective.py tests/test_adjective.py
git commit -m "feat: adjective form generator for German city names"
```

---

### Task 4: Download OSM PBF

**Files:**
- Create: `pipeline/download_osm.py`

**Interfaces:**
- Produces: `data/germany-latest.osm.pbf` (~4 GB)

- [ ] **Step 1: Create download script**

```python
# pipeline/download_osm.py
import urllib.request
from pathlib import Path

OSM_URL = "https://download.geofabrik.de/europe/germany-latest.osm.pbf"
OUTPUT_PATH = "data/germany-latest.osm.pbf"

def download_pbf(url: str = OSM_URL, output: str = OUTPUT_PATH):
    Path("data").mkdir(exist_ok=True)
    if Path(output).exists():
        print(f"{output} already exists, skipping.")
        return
    print(f"Downloading {url} (~4 GB) ...")
    urllib.request.urlretrieve(url, output, reporthook=_progress)
    print(f"\nSaved to {output}")

def _progress(count, block_size, total_size):
    if total_size > 0:
        pct = min(count * block_size * 100 // total_size, 100)
        print(f"\r{pct}%", end="", flush=True)

if __name__ == "__main__":
    download_pbf()
```

- [ ] **Step 2: Run download (takes 10–30 minutes depending on connection)**

```bash
python -m pipeline.download_osm
```

Expected: progress 0%→100%, file at `data/germany-latest.osm.pbf`, 3–5 GB.

- [ ] **Step 3: Verify file size**

```bash
python -c "
from pathlib import Path
size = Path('data/germany-latest.osm.pbf').stat().st_size
print(f'{size / 1e9:.1f} GB')
"
```

Expected: `3.x GB` or `4.x GB`.

- [ ] **Step 4: Commit**

```bash
git add pipeline/download_osm.py
git commit -m "feat: OSM PBF download script"
```

---

### Task 5: Street Extraction from PBF

**Files:**
- Create: `pipeline/extract_streets.py`
- Create: `tests/test_extract_streets.py`

**Interfaces:**
- Produces: `data/streets.csv` with columns `name` (str), `lon` (float), `lat` (float)
- Exports: `is_target_street(name: str) -> bool` and `extract_street_prefix(name: str) -> str` (used by Task 7)

- [ ] **Step 1: Write failing tests**

```python
# tests/test_extract_streets.py
from pipeline.extract_streets import is_target_street, extract_street_prefix

def test_is_target_street_accepts():
    assert is_target_street("Berliner Straße") is True
    assert is_target_street("Hamburger Str.") is True
    assert is_target_street("Münchner Strasse") is True

def test_is_target_street_rejects():
    assert is_target_street("Berliner Weg") is False
    assert is_target_street("Berliner Platz") is False
    assert is_target_street("Berliner Allee") is False
    assert is_target_street("Straße der Einheit") is False
    assert is_target_street("") is False

def test_extract_prefix():
    assert extract_street_prefix("Berliner Straße") == "berliner"
    assert extract_street_prefix("Hamburger Str.") == "hamburger"
    assert extract_street_prefix("Münchner Strasse") == "münchner"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_extract_streets.py -v
```

Expected: ImportError

- [ ] **Step 3: Implement extract_streets.py**

```python
# pipeline/extract_streets.py
import osmium
import shapely.wkb
import pandas as pd
from pathlib import Path

SUFFIXES = (" Straße", " Strasse", " Str.")

def is_target_street(name: str) -> bool:
    return bool(name) and any(name.endswith(s) for s in SUFFIXES)

def extract_street_prefix(name: str) -> str:
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
    handler = StreetHandler()
    handler.apply_file(pbf_path, locations=True,
                       idx=f"sparse_file_array,{node_cache}")
    df = pd.DataFrame(handler.streets)
    df.to_csv(output_path, index=False)
    print(f"Extracted {len(df):,} streets to {output_path}")
    return df

if __name__ == "__main__":
    extract_streets()
```

- [ ] **Step 4: Run unit tests to verify they pass**

```bash
pytest tests/test_extract_streets.py -v
```

Expected: all PASS

- [ ] **Step 5: Run extraction on the real PBF**

```bash
python -m pipeline.extract_streets
```

Expected: runs 10–30 minutes, outputs `data/streets.csv` with several hundred thousand rows.

- [ ] **Step 6: Spot-check output**

```bash
python -c "
import pandas as pd
df = pd.read_csv('data/streets.csv')
print(df.head(10))
print('Total:', len(df))
print(df['name'].value_counts().head(5))
"
```

Expected: `Berliner Straße` and similar names appear hundreds of times across different coordinates.

- [ ] **Step 7: Commit**

```bash
git add pipeline/extract_streets.py tests/test_extract_streets.py
git commit -m "feat: extract Straße/Str. streets from OSM PBF"
```

---

### Task 6: Assign Streets to Cities

**Files:**
- Create: `pipeline/assign_cities.py`
- Create: `tests/test_assign_cities.py`

**Interfaces:**
- Consumes: `data/streets.csv` (name, lon, lat), `data/cities.csv` (id, name, lat, lon, population)
- Produces: `data/streets_assigned.csv` with columns `name`, `lon`, `lat`, `city_id` (empty string if no city within 50 km)

- [ ] **Step 1: Write failing tests**

```python
# tests/test_assign_cities.py
import pandas as pd
from pipeline.assign_cities import assign_nearest_city

def _cities():
    return pd.DataFrame([
        {"id": "Q64",   "name": "Berlin",  "lat": 52.52, "lon": 13.40},
        {"id": "Q1055", "name": "Hamburg", "lat": 53.55, "lon": 10.00},
    ])

def test_assigns_to_nearest():
    streets = pd.DataFrame([
        {"name": "Hamburger Straße", "lat": 52.50, "lon": 13.38},
        {"name": "Berliner Straße",  "lat": 53.54, "lon":  9.99},
    ])
    result = assign_nearest_city(streets, _cities(), max_dist_km=50)
    assert result.iloc[0]["city_id"] == "Q64"
    assert result.iloc[1]["city_id"] == "Q1055"

def test_discards_too_far():
    streets = pd.DataFrame([
        {"name": "Berliner Straße", "lat": 48.10, "lon": 11.55},
    ])
    result = assign_nearest_city(streets, _cities(), max_dist_km=50)
    assert result.iloc[0]["city_id"] == ""
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_assign_cities.py -v
```

Expected: ImportError

- [ ] **Step 3: Implement assign_cities.py**

```python
# pipeline/assign_cities.py
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
    print(f"Assigned {assigned:,}/{len(result):,} streets → {output_path}")
    return result

if __name__ == "__main__":
    run()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_assign_cities.py -v
```

Expected: all PASS

- [ ] **Step 5: Run on real data**

```bash
python -m pipeline.assign_cities
```

Expected: `data/streets_assigned.csv`, vast majority of streets assigned.

- [ ] **Step 6: Commit**

```bash
git add pipeline/assign_cities.py tests/test_assign_cities.py
git commit -m "feat: assign streets to nearest city within 50 km"
```

---

### Task 7: Build Edge List

**Files:**
- Create: `pipeline/build_edges.py`
- Create: `tests/test_build_edges.py`

**Interfaces:**
- Consumes: `data/streets_assigned.csv`, `data/cities.csv`
- Produces: `data/edges.csv` with columns `source_id` (city containing the street), `target_id` (city the street is named after)

- [ ] **Step 1: Write failing tests**

```python
# tests/test_build_edges.py
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_build_edges.py -v
```

Expected: ImportError

- [ ] **Step 3: Implement build_edges.py**

```python
# pipeline/build_edges.py
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
        if not source_id:
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
    print(f"Built {len(edges):,} directed edges → {output_path}")
    return edges

if __name__ == "__main__":
    run()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_build_edges.py -v
```

Expected: all PASS

- [ ] **Step 5: Run on real data**

```bash
python -m pipeline.build_edges
```

Expected: `data/edges.csv` with thousands of edges.

- [ ] **Step 6: Spot-check output**

```bash
python -c "
import pandas as pd
df = pd.read_csv('data/edges.csv')
cities = pd.read_csv('data/cities.csv')
id2name = dict(zip(cities['id'], cities['name']))
df['from'] = df['source_id'].map(id2name)
df['to'] = df['target_id'].map(id2name)
print(df[['from','to']].head(20))
print('Total edges:', len(df))
"
```

Expected: sensible city pairs like `Berlin → Hamburg`.

- [ ] **Step 7: Commit**

```bash
git add pipeline/build_edges.py tests/test_build_edges.py
git commit -m "feat: build directed edge list from street name adjective matching"
```

---

### Task 8: Graph Analysis

**Files:**
- Create: `analysis/compute.py`
- Create: `tests/test_compute.py`

**Interfaces:**
- Consumes: `data/cities.csv`, `data/edges.csv`
- Produces:
  - `data/stats.json` — all computed metrics
  - `data/graph.json` — `{"nodes": [{id, name, lat, lon, population}], "edges": [{source, target}]}`

`stats.json` shape:
```json
{
  "node_count": 2100,
  "edge_count": 8500,
  "wcc_count": 12,
  "largest_wcc_size": 2050,
  "scc_count": 300,
  "largest_scc_size": 150,
  "diameter_path": ["Q64", "Q1055"],
  "diameter_length": 7,
  "top_betweenness": [{"id": "Q64", "name": "Berlin", "score": 0.45}],
  "top_in_degree":   [{"id": "Q64", "name": "Berlin", "count": 120}],
  "top_out_degree":  [{"id": "Q64", "name": "Berlin", "count": 80}]
}
```

- [ ] **Step 1: Write failing tests**

```python
# tests/test_compute.py
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_compute.py -v
```

Expected: ImportError

- [ ] **Step 3: Implement compute.py**

```python
# analysis/compute.py
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

def _diameter_of_largest_wcc(G: nx.DiGraph) -> tuple[int, list[str]]:
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
    in_deg  = dict(G.in_degree())
    out_deg = dict(G.out_degree())

    def top20_score(d: dict) -> list[dict]:
        return [{"id": k, "name": id_to_name.get(k, k), "score": round(v, 6)}
                for k, v in sorted(d.items(), key=lambda x: -x[1])[:20]]

    def top20_count(d: dict) -> list[dict]:
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
        "top_in_degree":   top20_count(in_deg),
        "top_out_degree":  top20_count(out_deg),
    }

def export_graph_json(G: nx.DiGraph, output_path: str = "data/graph.json"):
    data = {
        "nodes": [{"id": n, **G.nodes[n]} for n in G.nodes()],
        "edges": [{"source": u, "target": v} for u, v in G.edges()],
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    print(f"Exported graph → {output_path}")

def run(
    cities_path: str = "data/cities.csv",
    edges_path: str = "data/edges.csv",
):
    Path("data").mkdir(exist_ok=True)
    cities = pd.read_csv(cities_path)
    edges  = pd.read_csv(edges_path)
    G = build_graph(cities, edges)
    print(f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    stats = compute_stats(G, cities)
    with open("data/stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print("Saved data/stats.json")
    export_graph_json(G)

if __name__ == "__main__":
    run()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_compute.py -v
```

Expected: all PASS

- [ ] **Step 5: Run on real data**

```bash
python -m analysis.compute
```

Expected: prints graph size, saves `data/stats.json` and `data/graph.json`. May take a few minutes for betweenness on 2000+ nodes.

- [ ] **Step 6: Inspect key results**

```bash
python -c "
import json
s = json.load(open('data/stats.json'))
print('Nodes:', s['node_count'], '| Edges:', s['edge_count'])
print('WCCs:', s['wcc_count'], '| Largest:', s['largest_wcc_size'])
print('SCCs:', s['scc_count'], '| Largest SCC:', s['largest_scc_size'])
print('Diameter:', s['diameter_length'])
print('Top betweenness:', [x['name'] for x in s['top_betweenness'][:5]])
print('Top in-degree:',   [x['name'] for x in s['top_in_degree'][:5]])
"
```

Expected: Berlin/München near top of betweenness and in-degree; diameter likely 5–12.

- [ ] **Step 7: Commit**

```bash
git add analysis/compute.py tests/test_compute.py data/stats.json data/graph.json
git commit -m "feat: graph analysis with NetworkX, export stats.json and graph.json"
```

---

### Task 9: Frontend — Base Structure and Map

**Files:**
- Create: `web/index.html`
- Create: `web/css/style.css`
- Create: `web/js/map.js`
- Create: `web/js/app.js`

**Interfaces:**
- Consumes: `web/data/graph.json`, `web/data/stats.json` via `fetch()`
- Produces: Reveal.js presentation at `web/index.html` with a D3 city map

- [ ] **Step 1: Copy data files into web/data**

```bash
cp data/graph.json web/data/graph.json
cp data/stats.json web/data/stats.json
```

- [ ] **Step 2: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>City Connections</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
<div class="reveal">
  <div class="slides">

    <section id="slide-title">
      <h1>City Connections</h1>
      <p class="subtitle">A graph of Germany built from street names</p>
    </section>

    <section id="slide-rule">
      <h2>The Rule</h2>
      <p>You can travel from <strong>A</strong> to <strong>B</strong><br>
         if city A has a street named <em>"B-er Straße"</em></p>
      <p class="muted">Beispielstadt → Musterstadt via <em>Musterstadter Straße</em></p>
    </section>

    <section id="slide-overview">
      <h2>The Network</h2>
      <p><span id="stat-nodes">—</span> cities &nbsp;·&nbsp;
         <span id="stat-edges">—</span> connections</p>
      <div id="map-overview"></div>
    </section>

    <section id="slide-connected">
      <h2>Connected?</h2>
      <div id="stat-connectivity"></div>
    </section>

    <section id="slide-diameter">
      <h2>The Longest Road</h2>
      <div id="stat-diameter"></div>
      <div id="map-diameter"></div>
    </section>

    <section id="slide-betweenness">
      <h2>Hubs</h2>
      <div id="chart-betweenness"></div>
    </section>

    <section id="slide-indegree">
      <h2>Most Referenced</h2>
      <div id="chart-indegree"></div>
    </section>

    <section id="slide-outdegree">
      <h2>Most Connected</h2>
      <div id="chart-outdegree"></div>
    </section>

    <section id="slide-pathfinder">
      <h2>Find Your Path</h2>
      <div id="pathfinder-ui">
        <input id="input-from" type="text" placeholder="From city...">
        <span>→</span>
        <input id="input-to" type="text" placeholder="To city...">
        <button id="btn-find">Go</button>
        <div id="path-result"></div>
      </div>
      <div id="map-path"></div>
    </section>

  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"></script>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script src="js/map.js"></script>
<script src="js/pathfinder.js"></script>
<script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create style.css**

```css
/* web/css/style.css */
:root {
  --bg:      #0f1117;
  --surface: #1a1d2e;
  --accent:  #4f8ef7;
  --gold:    #f7c04f;
  --text:    #e8eaf0;
  --muted:   #6b7280;
}

html, body { background: var(--bg); }

.reveal {
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', system-ui, sans-serif;
}

.reveal h1 { font-size: 2.6em; letter-spacing: -0.03em; }
.reveal h2 { font-size: 1.7em; color: var(--accent); letter-spacing: -0.01em; }
.reveal p  { font-size: 0.95em; }
.reveal .subtitle { color: var(--muted); margin-top: 0.4em; }
.reveal .muted    { color: var(--muted); font-size: 0.85em; }

#map-overview, #map-diameter, #map-path {
  width: 100%; height: 400px; margin-top: 0.8em;
}

#pathfinder-ui {
  display: flex; align-items: center; gap: 0.6em;
  flex-wrap: wrap; margin-bottom: 0.8em;
}

#pathfinder-ui input {
  background: var(--surface);
  border: 1px solid var(--muted);
  color: var(--text);
  padding: 0.35em 0.7em;
  border-radius: 4px;
  font-size: 0.85em;
  width: 200px;
}

#pathfinder-ui button {
  background: var(--accent);
  color: var(--bg);
  border: none;
  padding: 0.35em 1em;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85em;
}

#path-result {
  width: 100%;
  color: var(--gold);
  font-size: 0.8em;
  word-break: break-word;
}

.bar-label { fill: var(--text); font-size: 11px; }
.bar-rect  { fill: var(--accent); }
```

- [ ] **Step 4: Create map.js**

```javascript
// web/js/map.js

function makeProjection(width, height) {
  return d3.geoMercator()
    .center([10.4, 51.2])
    .scale(width * 1.55)
    .translate([width / 2, height / 2]);
}

function nodeById(graphData) {
  return Object.fromEntries(graphData.nodes.map(n => [n.id, n]));
}

function initMap(graphData) {
  const el = document.getElementById('map-overview');
  if (!el) return;
  const W = el.clientWidth || 800, H = 400;
  const proj = makeProjection(W, H);
  const byId = nodeById(graphData);

  const svg = d3.select('#map-overview').append('svg').attr('width', W).attr('height', H);

  svg.append('g').selectAll('line')
    .data(graphData.edges).join('line')
    .attr('x1', d => { const n = byId[d.source]; return n ? proj([n.lon, n.lat])[0] : 0; })
    .attr('y1', d => { const n = byId[d.source]; return n ? proj([n.lon, n.lat])[1] : 0; })
    .attr('x2', d => { const n = byId[d.target]; return n ? proj([n.lon, n.lat])[0] : 0; })
    .attr('y2', d => { const n = byId[d.target]; return n ? proj([n.lon, n.lat])[1] : 0; })
    .attr('stroke', 'rgba(79,142,247,0.12)').attr('stroke-width', 0.5);

  svg.append('g').selectAll('circle')
    .data(graphData.nodes).join('circle')
    .attr('cx', d => proj([d.lon, d.lat])[0])
    .attr('cy', d => proj([d.lon, d.lat])[1])
    .attr('r',  d => Math.max(1.5, Math.sqrt(d.population / 80000)))
    .attr('fill', '#4f8ef7').attr('opacity', 0.7);
}

function highlightPath(graphData, pathIds) {
  const el = document.getElementById('map-path');
  if (!el) return;
  const W = el.clientWidth || 800, H = 400;
  const proj = makeProjection(W, H);
  const byId = nodeById(graphData);

  d3.select('#map-path svg').remove();
  const svg = d3.select('#map-path').append('svg').attr('width', W).attr('height', H);

  svg.append('g').selectAll('circle')
    .data(graphData.nodes).join('circle')
    .attr('cx', d => proj([d.lon, d.lat])[0])
    .attr('cy', d => proj([d.lon, d.lat])[1])
    .attr('r', 1.5).attr('fill', '#1e2235');

  for (let i = 0; i < pathIds.length - 1; i++) {
    const a = byId[pathIds[i]], b = byId[pathIds[i + 1]];
    if (!a || !b) continue;
    const [x1, y1] = proj([a.lon, a.lat]);
    const [x2, y2] = proj([b.lon, b.lat]);
    svg.append('line').attr('x1', x1).attr('y1', y1)
      .attr('x2', x2).attr('y2', y2)
      .attr('stroke', '#f7c04f').attr('stroke-width', 2);
  }

  pathIds.forEach((id, i) => {
    const n = byId[id]; if (!n) return;
    const [x, y] = proj([n.lon, n.lat]);
    const isEnd = i === 0 || i === pathIds.length - 1;
    svg.append('circle').attr('cx', x).attr('cy', y)
      .attr('r', isEnd ? 6 : 4)
      .attr('fill', isEnd ? '#f7c04f' : '#4f8ef7');
    svg.append('text').attr('x', x + 8).attr('y', y + 4)
      .attr('fill', '#e8eaf0').attr('font-size', '11px').text(n.name);
  });
}

function renderDiameterMap(graphData, pathIds) {
  const el = document.getElementById('map-diameter');
  if (!el) return;
  const W = el.clientWidth || 800, H = 400;
  const proj = makeProjection(W, H);
  const byId = nodeById(graphData);

  d3.select('#map-diameter svg').remove();
  const svg = d3.select('#map-diameter').append('svg').attr('width', W).attr('height', H);

  svg.append('g').selectAll('circle')
    .data(graphData.nodes).join('circle')
    .attr('cx', d => proj([d.lon, d.lat])[0])
    .attr('cy', d => proj([d.lon, d.lat])[1])
    .attr('r', 1.5).attr('fill', '#1e2235');

  for (let i = 0; i < pathIds.length - 1; i++) {
    const a = byId[pathIds[i]], b = byId[pathIds[i + 1]];
    if (!a || !b) continue;
    const [x1, y1] = proj([a.lon, a.lat]);
    const [x2, y2] = proj([b.lon, b.lat]);
    svg.append('line').attr('x1', x1).attr('y1', y1)
      .attr('x2', x2).attr('y2', y2)
      .attr('stroke', '#f7c04f').attr('stroke-width', 2.5);
  }

  pathIds.forEach((id, i) => {
    const n = byId[id]; if (!n) return;
    const [x, y] = proj([n.lon, n.lat]);
    svg.append('circle').attr('cx', x).attr('cy', y).attr('r', 5)
      .attr('fill', '#f7c04f');
    svg.append('text').attr('x', x + 8).attr('y', y + 4)
      .attr('fill', '#e8eaf0').attr('font-size', '11px')
      .text(`${i + 1}. ${n.name}`);
  });
}
```

- [ ] **Step 5: Create app.js**

```javascript
// web/js/app.js
let graphData = null;
let statsData = null;

async function loadData() {
  [graphData, statsData] = await Promise.all([
    fetch('data/graph.json').then(r => r.json()),
    fetch('data/stats.json').then(r => r.json()),
  ]);
}

function populateStats() {
  document.getElementById('stat-nodes').textContent = statsData.node_count.toLocaleString('de-DE');
  document.getElementById('stat-edges').textContent = statsData.edge_count.toLocaleString('de-DE');

  document.getElementById('stat-connectivity').innerHTML = `
    <p>${statsData.wcc_count} weakly connected component${statsData.wcc_count !== 1 ? 's' : ''}</p>
    <p>Largest: <strong>${statsData.largest_wcc_size}</strong> cities</p>
    <p>${statsData.scc_count} strongly connected components</p>
    <p>Largest SCC: <strong>${statsData.largest_scc_size}</strong> cities</p>
  `;

  const byId = Object.fromEntries(graphData.nodes.map(n => [n.id, n.name]));
  const pathNames = statsData.diameter_path.map(id => byId[id] ?? id).join(' → ');
  document.getElementById('stat-diameter').innerHTML =
    `<p>${statsData.diameter_length} hops</p><p class="muted">${pathNames}</p>`;
  renderDiameterMap(graphData, statsData.diameter_path);

  renderBarChart('#chart-betweenness', statsData.top_betweenness.slice(0, 10),
    d => d.name, d => d.score);
  renderBarChart('#chart-indegree',    statsData.top_in_degree.slice(0, 10),
    d => d.name, d => d.count);
  renderBarChart('#chart-outdegree',   statsData.top_out_degree.slice(0, 10),
    d => d.name, d => d.count);
}

function renderBarChart(selector, data, labelFn, valueFn) {
  const el = document.querySelector(selector);
  if (!el) return;
  const W = el.clientWidth || 720, H = 280;
  const m = { top: 8, right: 16, bottom: 24, left: 130 };
  const svg = d3.select(selector).append('svg').attr('width', W).attr('height', H);
  const x = d3.scaleLinear().domain([0, d3.max(data, valueFn)]).range([m.left, W - m.right]);
  const y = d3.scaleBand().domain(data.map(labelFn)).range([m.top, H - m.bottom]).padding(0.22);
  svg.selectAll('rect').data(data).join('rect')
    .attr('class', 'bar-rect')
    .attr('x', m.left).attr('y', d => y(labelFn(d)))
    .attr('width', d => x(valueFn(d)) - m.left)
    .attr('height', y.bandwidth());
  svg.selectAll('.lbl').data(data).join('text')
    .attr('class', 'bar-label')
    .attr('x', m.left - 6).attr('y', d => y(labelFn(d)) + y.bandwidth() / 2)
    .attr('dy', '0.35em').attr('text-anchor', 'end').text(labelFn);
}

Reveal.initialize({ hash: true, transition: 'fade', backgroundTransition: 'fade' });

loadData().then(() => {
  initMap(graphData);
  populateStats();
  initPathfinder(graphData);
});
```

- [ ] **Step 6: Serve locally and verify**

```bash
python -m http.server 8080 --directory web
```

Open `http://localhost:8080`. Expected: dark slide deck, city dots visible on map, stats populated on the relevant slides.

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "feat: Reveal.js frontend with dark theme, D3 map, and stat slides"
```

---

### Task 10: Interactive Pathfinder

**Files:**
- Create: `web/js/pathfinder.js`

**Interfaces:**
- Consumes: `graphData` (global set in app.js before `initPathfinder` is called)
- Produces: DOM updates to `#path-result`; calls `highlightPath(graphData, pathIds)` from map.js

- [ ] **Step 1: Create pathfinder.js**

```javascript
// web/js/pathfinder.js

function bfs(edges, sourceId, targetId) {
  if (sourceId === targetId) return [sourceId];
  const adj = {};
  for (const { source, target } of edges) {
    if (!adj[source]) adj[source] = [];
    adj[source].push(target);
  }
  const visited = new Set([sourceId]);
  const queue = [[sourceId]];
  while (queue.length) {
    const path = queue.shift();
    const node = path[path.length - 1];
    for (const nbr of (adj[node] ?? [])) {
      if (nbr === targetId) return [...path, nbr];
      if (!visited.has(nbr)) {
        visited.add(nbr);
        queue.push([...path, nbr]);
      }
    }
  }
  return null;
}

function attachAutocomplete(input, names) {
  const listId = input.id + '-list';
  const dl = document.createElement('datalist');
  dl.id = listId;
  input.setAttribute('list', listId);
  input.parentNode.appendChild(dl);
  input.addEventListener('input', () => {
    const val = input.value.toLowerCase();
    dl.innerHTML = names
      .filter(n => n.toLowerCase().startsWith(val))
      .slice(0, 10)
      .map(n => `<option value="${n}">`)
      .join('');
  });
}

function initPathfinder(graphData) {
  const nodeNames = graphData.nodes.map(n => n.name);
  const nameToId  = Object.fromEntries(graphData.nodes.map(n => [n.name, n.id]));
  const idToName  = Object.fromEntries(graphData.nodes.map(n => [n.id,   n.name]));

  const inputFrom = document.getElementById('input-from');
  const inputTo   = document.getElementById('input-to');
  const btn       = document.getElementById('btn-find');
  const result    = document.getElementById('path-result');

  attachAutocomplete(inputFrom, nodeNames);
  attachAutocomplete(inputTo,   nodeNames);

  btn.addEventListener('click', () => {
    const fromId = nameToId[inputFrom.value];
    const toId   = nameToId[inputTo.value];
    if (!fromId || !toId) {
      result.textContent = 'City not found — check spelling.';
      return;
    }
    const path = bfs(graphData.edges, fromId, toId);
    if (!path) {
      result.textContent = 'No path found between these cities.';
      d3.select('#map-path svg').remove();
      return;
    }
    result.textContent = path.map(id => idToName[id]).join(' → ');
    highlightPath(graphData, path);
  });
}
```

- [ ] **Step 2: Serve and test the happy path**

```bash
python -m http.server 8080 --directory web
```

Navigate to the pathfinder slide. Type `Berlin` in From, `München` in To, click Go. Expected: a sequence of city names and a yellow path traced on the map.

- [ ] **Step 3: Test no-path case**

Use a city from a different weakly connected component (check `stats.json` `wcc_count` — if > 1, there are isolated cities). Expected: "No path found between these cities."

- [ ] **Step 4: Commit**

```bash
git add web/js/pathfinder.js
git commit -m "feat: client-side BFS pathfinder with autocomplete"
```

---

### Task 11: GitHub Pages Deployment

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Ensure web/data files are committed**

```bash
git add web/data/graph.json web/data/stats.json
git status
```

Expected: both files staged. If graph.json is large (>50 MB), consider gzip — but at ~2000 nodes it should be well under 10 MB.

- [ ] **Step 2: Create deploy workflow**

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
    paths: ['web/**']
permissions:
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web/
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Create GitHub repo, push, enable Pages**

```bash
git remote add origin https://github.com/<your-username>/city-connections.git
git push -u origin main
```

Then in GitHub repo settings → Pages → Source: **GitHub Actions**. Wait for the Actions tab to show a green deploy.

- [ ] **Step 4: Verify live site**

Open `https://<your-username>.github.io/city-connections/`. Expected: all slides load, stats populate, map renders, pathfinder works.

- [ ] **Step 5: Commit workflow**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: GitHub Pages deployment via Actions"
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ Directed graph, German cities >5k population
- ✅ OSM PBF as data source (Geofabrik)
- ✅ Only "Straße" / "Str." suffix
- ✅ Adjective form matching + exception table
- ✅ Nearest city for ambiguity; fallback to all-match noted as future option
- ✅ WCC + SCC connectivity analysis
- ✅ Diameter (longest shortest path in largest WCC)
- ✅ Betweenness centrality (top 20)
- ✅ In-degree and out-degree rankings (top 20)
- ✅ Interactive A→B BFS pathfinder
- ✅ Dark Reveal.js slide deck with D3 geographic map
- ✅ GitHub Pages deployment

**Placeholder scan:** None found.

**Type consistency:**
- `cities.csv` columns (`id`, `name`, `lat`, `lon`, `population`) used consistently across Tasks 2–8
- `graphData` shape (`nodes[{id,name,lat,lon,population}]`, `edges[{source,target}]`) matches between `compute.py` → `app.js` → `map.js` → `pathfinder.js`
- `stats.json` keys defined in `compute_stats()` match all `app.js` accessors
- `extract_street_prefix()` defined once in `extract_streets.py`, imported in `build_edges.py` — no duplication
