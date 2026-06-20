"""Unit tests for pipeline.extract_streets (no PBF file required)."""

import pytest
from pipeline.extract_streets import is_target_street, extract_street_prefix


# ---------------------------------------------------------------------------
# is_target_street
# ---------------------------------------------------------------------------

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


def test_is_target_street_requires_space_before_suffix():
    # "Straße" alone (no leading space) must not match
    assert is_target_street("Straße") is False
    assert is_target_street("Str.") is False
    assert is_target_street("Strasse") is False


# ---------------------------------------------------------------------------
# extract_street_prefix
# ---------------------------------------------------------------------------

def test_extract_prefix():
    assert extract_street_prefix("Berliner Straße") == "berliner"
    assert extract_street_prefix("Hamburger Str.") == "hamburger"
    assert extract_street_prefix("Münchner Strasse") == "münchner"


def test_extract_prefix_multi_word():
    assert extract_street_prefix("Karl Marx Straße") == "karl marx"


def test_extract_prefix_strips_and_lowercases():
    # Extra internal spaces are preserved; leading/trailing stripped
    assert extract_street_prefix("Am Grünen Weg Straße") == "am grünen weg"
