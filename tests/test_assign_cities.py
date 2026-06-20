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
