import re
import pandas as pd
from collections import defaultdict

EXCEPTIONS: dict[str, list[str]] = {
    "München": ["Münchner", "Münchener"],
    "Dresden": ["Dresdner", "Dresdener"],
    "Hannover": ["Hannoveraner", "Hannoversche"],
    "Braunschweig": ["Braunschweiger"],
    "Magdeburg": ["Magdeburger"],
    "Nürnberg": ["Nürnberger"],
    # After locative/parenthetical stripping these keys match normalized names:
    "Frankfurt": ["Frankfurter"],
    "Halle": ["Hallenser"],
    "Münster": ["Münsteraner"],
    "Darmstadt": ["Darmstädter"],
    "Ingolstadt": ["Ingolstädter"],
    "Recklinghausen": ["Recklinghäuser"],
}

_LOCATIVE = re.compile(
    r"\s+(am|an\s+der|an\s+dem|an|bei|im|in\s+der|in\s+dem|in|vor\s+der|vor\s+dem|auf\s+dem)\s+\S+$",
    re.IGNORECASE,
)


def _normalize_city_name(name: str) -> str:
    """Strip parenthetical disambiguators and locative prepositions.

    'Frankfurt am Main' -> 'Frankfurt'
    'Frankfurt an der Oder' -> 'Frankfurt'
    'Halle (Saale)' -> 'Halle'
    'Freiburg im Breisgau' -> 'Freiburg'
    """
    name = re.sub(r"\s*\([^)]*\)", "", name).strip()
    name = _LOCATIVE.sub("", name).strip()
    return name


def generate_adjective_forms(city_name: str) -> list[str]:
    if city_name in EXCEPTIONS:
        return EXCEPTIONS[city_name]

    normalized = _normalize_city_name(city_name)
    if normalized in EXCEPTIONS:
        return EXCEPTIONS[normalized]

    base = normalized
    forms = [base + "er"]
    if base.endswith("en"):
        forms.append(base[:-2] + "er")
    if base.endswith("e"):
        forms.append(base + "r")
    return forms


def build_adjective_lookup(cities_df: pd.DataFrame) -> dict[str, list[str]]:
    lookup: dict[str, list[str]] = defaultdict(list)
    for _, row in cities_df.iterrows():
        for form in generate_adjective_forms(str(row["name"])):
            lookup[form.lower()].append(str(row["id"]))
    return dict(lookup)
