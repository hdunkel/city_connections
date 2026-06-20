import urllib.request
from pathlib import Path

OSM_URL = "https://download.geofabrik.de/europe/germany-latest.osm.pbf"
OUTPUT_PATH = "data/germany-latest.osm.pbf"

def download_pbf(url: str = OSM_URL, output: str = OUTPUT_PATH):
    Path("data").mkdir(exist_ok=True)
    if Path(output).exists():
        print(f"{output} already exists, skipping.")
        return
    print(f"Downloading {url} (~4 GB) ...")
    urllib.request.urlretrieve(url, output, reporthook=_progress)
    print(f"\nSaved to {output}")

def _progress(count, block_size, total_size):
    if total_size > 0:
        pct = min(count * block_size * 100 // total_size, 100)
        print(f"\r{pct}%", end="", flush=True)

if __name__ == "__main__":
    download_pbf()
