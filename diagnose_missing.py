"""
Find large cities with 0 incoming edges and check what adjective forms
appear in the street data that we're currently missing.
"""
import pandas as pd
from collections import Counter
from pipeline.adjective import generate_adjective_forms, build_adjective_lookup
from pipeline.extract_streets import extract_street_prefix, is_target_street

cities = pd.read_csv("data/cities.csv")
edges  = pd.read_csv("data/edges.csv")
streets = pd.read_csv("data/streets_assigned.csv", encoding="utf-8")

# Cities with pop > 20k
large = cities[cities["population"] > 20_000].copy()

# Incoming edge count per city
in_counts = edges.groupby("target_id").size().rename("in_edges")
large = large.merge(in_counts, left_on="id", right_index=True, how="left")
large["in_edges"] = large["in_edges"].fillna(0).astype(int)

# Cities >20k with 0 incoming edges
zero_in = large[large["in_edges"] == 0].sort_values("population", ascending=False)
print(f"Cities >20k pop with 0 incoming edges: {len(zero_in)}")
print(zero_in[["name","population","in_edges"]].head(30).to_string())

print("\n--- What forms our rules currently generate for top zero-in cities ---")
lookup = build_adjective_lookup(cities)

# Also collect all unique prefixes in the street data
streets_with_name = streets[streets["name"].notna() & (streets["city_id"] != "")]
all_prefixes = Counter(
    extract_street_prefix(n) for n in streets_with_name["name"]
    if is_target_street(str(n))
)

print("\n--- Checking top zero-in cities against actual street prefixes ---")
for _, row in zero_in.head(30).iterrows():
    forms = generate_adjective_forms(row["name"])
    found = {f: all_prefixes.get(f.lower(), 0) for f in forms}
    # Also search for city name stem in prefixes
    stem = row["name"].lower()[:6]
    similar = [(p, c) for p, c in all_prefixes.items() if stem in p and c > 5][:3]
    print(f"\n{row['name']} (pop {row['population']:,})")
    print(f"  Generated forms: {forms}")
    print(f"  Counts in streets: {found}")
    if similar:
        print(f"  Similar prefixes in data: {similar}")
