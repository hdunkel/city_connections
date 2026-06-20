import requests
import pandas as pd
from pathlib import Path

WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql"

SPARQL_QUERY = """
SELECT DISTINCT ?city ?cityLabel ?population ?lat ?lon WHERE {
  ?city wdt:P17 wd:Q183 ;
        wdt:P1082 ?population ;
        wdt:P31/wdt:P279* wd:Q262166 .
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
