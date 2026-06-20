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
