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
