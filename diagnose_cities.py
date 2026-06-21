"""Find actual city-sized entities (20k-1M pop) with 0 incoming edges."""
import pandas as pd
from pipeline.adjective import generate_adjective_forms
from pipeline.extract_streets import extract_street_prefix, is_target_street
from collections import Counter

cities = pd.read_csv("data/cities.csv")
edges  = pd.read_csv("data/edges.csv")
streets = pd.read_csv("data/streets_assigned.csv", encoding="utf-8")

in_counts = edges.groupby("target_id").size()
cities["in_edges"] = cities["id"].map(in_counts).fillna(0).astype(int)

# Filter to plausible city-sized pop (20k-2M) with 0 incoming
plausible = cities[
    (cities["population"] >= 20_000) &
    (cities["population"] <= 2_000_000) &
    (cities["in_edges"] == 0)
].sort_values("population", ascending=False)

print(f"Plausible cities 20k-2M with 0 incoming edges: {len(plausible)}")

# Build prefix counter from street data
all_prefixes = Counter(
    extract_street_prefix(n) for n in streets["name"].dropna()
    if is_target_street(str(n))
)

print("\nTop 40 by population:")
for _, row in plausible.head(40).iterrows():
    forms = generate_adjective_forms(row["name"])
    counts = {f: all_prefixes.get(f.lower(), 0) for f in forms}
    stem = row["name"].lower().replace(" ", "")[:7]
    similar = [(p, c) for p, c in all_prefixes.most_common()
               if p.startswith(stem[:5]) and c > 10][:2]
    flag = "*** MATCH IN DATA" if any(v > 0 for v in counts.values()) else ""
    print(f"  {row['name']:<30} pop={row['population']:>8,}  forms={forms}  counts={counts}  {flag}")
    if similar:
        print(f"    similar prefixes: {similar}")
