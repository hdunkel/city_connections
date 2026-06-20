import urllib.request
from pathlib import Path

OSM_URL = "https://download.geofabrik.de/europe/germany-latest.osm.pbf"
OUTPUT_PATH = "data/germany-latest.osm.pbf"

def _server_size(url: str) -> int:
    req = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(req) as r:
        return int(r.headers.get("Content-Length", 0))

def download_pbf(url: str = OSM_URL, output: str = OUTPUT_PATH):
    Path("data").mkdir(exist_ok=True)
    out = Path(output)
    if out.exists():
        expected = _server_size(url)
        actual = out.stat().st_size
        if expected and actual == expected:
            print(f"{output} already exists and is complete ({actual/1e9:.2f} GB), skipping.")
            return
        print(f"{output} exists but is incomplete ({actual/1e9:.2f} GB vs {expected/1e9:.2f} GB expected) — re-downloading.")
        out.unlink()
    print(f"Downloading {url} ...")
    urllib.request.urlretrieve(url, output, reporthook=_progress)
    print(f"\nSaved to {output}")

def _progress(count, block_size, total_size):
    if total_size > 0:
        pct = min(count * block_size * 100 // total_size, 100)
        print(f"\r{pct}%", end="", flush=True)

if __name__ == "__main__":
    download_pbf()
