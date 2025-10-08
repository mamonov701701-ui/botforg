from pathlib import Path
from datetime import datetime, timedelta
import os, shutil

ROOT = Path("monitoring")
KEEP_DAYS = int(os.getenv("KEEP_DAYS", "7"))

def purge(root: Path):
    cutoff = datetime.now() - timedelta(days=KEEP_DAYS)
    removed = 0
    for d in sorted(root.glob("*")):
        try:
            dt = datetime.strptime(d.name, "%Y-%m-%d")
            if dt < cutoff:
                shutil.rmtree(d, ignore_errors=True)
                removed += 1
        except:
            continue
    return removed

def run():
    shots = ROOT/"screenshots"
    diffs = ROOT/"diff"
    r1 = purge(shots) if shots.exists() else 0
    r2 = purge(diffs) if diffs.exists() else 0
    print(f"cleanup: screenshots={r1}, diff={r2}")
    return 0

if __name__ == "__main__":
    run()


