# City Connections — Design Spec
**Date:** 2026-06-20

## Overview

A directed graph of ~2,000–2,500 German cities (population > 5,000) where an edge A→B exists if city A has a street named after city B (using the German adjective form + "Straße" or "Str." only). The project answers graph-theoretic questions about this network and presents them as an interactive GitHub Pages slide deck.

---

## Phase 1: Data Pipeline

### City List
- Source: Wikidata SPARQL query
- Filter: German municipalities with population > 5,000
- Fields: name, coordinates (lat/lon), Wikidata ID, population
- Output: `data/cities.csv`

### OSM Street Extraction
- Source: Germany PBF extract from Geofabrik (~4 GB download)
- Tool: `pyosmium`
- **Pass 1:** Extract admin boundary polygons at `admin_level=8` (Gemeinden) for cities in the city list → GeoDataFrame
- **Pass 2:** Extract all OSM `way` objects whose `name` tag ends in `" Straße"` or `" Str."` → GeoDataFrame of street centroids
- No other street suffix types (Weg, Platz, Allee, etc.) are included

### Spatial Join
- For each street centroid, find which Gemeinde polygon contains it (GeoPandas `sjoin`)
- Result: each street is assigned to a source city
- Streets that fall outside any Gemeinde boundary are discarded

### Adjective Form Matching
- Pre-generate a lookup table `adjective_form → [city_id]` from the city list
- Generation rules (applied to each city name):
  - Primary: `city_name + "er"` (Berlin → Berliner, Köln → Kölner, Frankfurt → Frankfurter)
  - If name ends in `"en"`: also generate `name[:-2] + "er"` (Bremen → Bremer, Dresden → Dresdner)
- For each street name: strip `" Straße"` or `" Str."` suffix, look up remainder in the table
- Streets with no matching city are discarded (no edge created)

### Ambiguity Resolution
- If a street name maps to multiple cities (e.g. multiple cities called "Neustadt"), pick the geographically nearest city to the street centroid
- Fallback if proximity resolution proves unreliable: connect to all matching cities (to be decided during implementation)

### Outputs
- `data/edges.csv` — directed edge list: `source_city_id, target_city_id`
- `data/cities.csv` — enriched with coordinates, population

---

## Phase 2: Graph Analysis

**Library:** NetworkX `DiGraph`

| Metric | Method | Output |
|---|---|---|
| Connectivity | Weakly + strongly connected components | Component sizes, list of isolated cities |
| Diameter | BFS from every node in largest WCC, take max | Longest shortest path + the cities along it |
| Betweenness centrality | `nx.betweenness_centrality` (exact) | Top 20 cities by score |
| Incoming degree | Most referenced cities (most streets named after them) | Top 20 |
| Outgoing degree | Cities referencing the most others | Top 20 |
| Shortest path (A→B) | Precomputed graph shipped to browser; BFS runs client-side | — |

All results saved to `data/stats.json`.

**Browser payload:** `data/graph.json` — nodes (id, name, lat, lon, population) + edge list. Estimated size: small enough to ship directly (~2,000 nodes, 5,000–20,000 edges).

---

## Phase 3: Frontend

**Framework:** Reveal.js on GitHub Pages (no build step, shareable URL)

**Visual style:** Dark background (slate/navy), city nodes as glowing points on a schematic Germany map, D3.js rendering, Inter typeface. Tone: data journalism (Morgenpost / NYT graphics style).

### Slide Structure
1. Title + one-line rule explainer
2. Animated example of the connection rule (Beispielstadt → Musterstadt)
3. Full dataset overview — N cities, M edges, map of all connections as arcs
4. Connectivity — SCC/WCC breakdown, isolated cities
5. Diameter — longest shortest path highlighted on map
6. Betweenness centrality — top hubs, sized by score
7. Incoming degree — cities most referenced by street names
8. Outgoing degree — cities referencing the most others
9. Interactive A→B path finder — autocomplete inputs, hop-by-hop route with map trace

*Note: slide titles are placeholders; final titles to be decided during frontend implementation.*

### Interactivity
- D3.js for map and network rendering
- A→B BFS runs in plain JavaScript using `graph.json` loaded at page start
- City autocomplete from the nodes list

---

## Key Constraints & Decisions

- **Directed graph:** A→B requires A to have a street named after B; reverse is not implied
- **Street suffix:** Only "Straße" and "Str." count — no Weg, Platz, Allee, Gasse, etc.
- **Adjective forms only:** Direct city name substring matches are excluded
- **Ambiguity:** Nearest city by geography; fall back to all-match if this proves difficult
- **Unmatched streets:** Streets whose name prefix doesn't resolve to any city in the list produce no edge and are silently discarded. This means irregular adjective forms (e.g. "Hannoveraner", "Kölsche") will be missed; this is acceptable — the graph is slightly incomplete but not incorrect.
- **Scale:** ~2,000–2,500 nodes; all graph algorithms run exactly (no approximations needed)
- **Data pipeline is one-time:** Run locally, commit outputs to repo, frontend is fully static
