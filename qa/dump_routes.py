"""
Dump FastAPI routes without running the server.
Writes to qa_artifacts/backend_routes.txt (or QA_ARTIFACTS_DIR if set).
Usage: python qa/dump_routes.py [output_dir]
"""
import os
import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))


def dump():
    from backend.main import app
    lines = []
    for r in app.routes:
        if not hasattr(r, "path"):
            continue
        methods = getattr(r, "methods", None)
        if methods:
            methods_str = ",".join(sorted(methods - {"HEAD", "OPTIONS"})) if methods else ""
            lines.append(f"{r.path}\t{methods_str}")
        else:
            lines.append(f"{r.path}\t")
    return "\n".join(sorted(set(lines)))


def get_output_dir():
    if os.environ.get("QA_ARTIFACTS_DIR"):
        return Path(os.environ["QA_ARTIFACTS_DIR"])
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    return _root / "qa_artifacts"


if __name__ == "__main__":
    out = dump()
    art = get_output_dir()
    art.mkdir(parents=True, exist_ok=True)
    (art / "backend_routes.txt").write_text(out, encoding="utf-8")
    print(out)
