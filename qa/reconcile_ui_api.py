"""
Reconcile UI API calls (from Playwright) with backend routes.
Reads qa_artifacts/<run>/ui_api_calls.json and backend_routes.txt.
Writes human-readable: missing endpoints, endpoints with 500, with 404.
Exit 1 if any P0 (missing endpoint, 500, 404).
"""
import json
import os
import re
import sys
from pathlib import Path


def main(artifacts_dir: str | None = None):
    root = Path(__file__).resolve().parent.parent
    art = Path(artifacts_dir or os.environ.get("QA_ARTIFACTS_DIR") or root / "qa_artifacts")

    missing_endpoints = []
    endpoints_500 = []
    endpoints_404 = []
    backend_set = set()

    routes_file = art / "backend_routes.txt"
    if routes_file.exists():
        for line in routes_file.read_text(encoding="utf-8", errors="replace").strip().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            path_val = (parts[0] or "").strip()
            methods_str = (parts[1] or "").strip() if len(parts) > 1 else ""
            if not path_val or path_val.startswith("/openapi") or path_val.startswith("/docs"):
                continue
            for m in methods_str.split(",") if methods_str else ["GET"]:
                backend_set.add((m.strip().upper() or "GET", path_val))

    def path_matches_backend(method: str, path_val: str) -> bool:
        path_val = path_val.split("?")[0].strip()
        method = (method or "GET").upper()
        for (bm, bp) in backend_set:
            if bm and method != bm:
                continue
            if path_val == bp:
                return True
            bp_re = re.escape(bp).replace("\\{\\w+\\}", "[^/]+")
            if re.match("^" + bp_re + "$", path_val):
                return True
        return False

    api_calls_file = art / "ui_api_calls.json"
    if api_calls_file.exists():
        try:
            data = json.loads(api_calls_file.read_text(encoding="utf-8", errors="replace"))
        except Exception:
            data = {}
        for key, stats in data.items():
            if not key.strip():
                continue
            parts = key.split(" ", 1)
            method = parts[0] if len(parts) > 1 else "GET"
            path_val = (parts[1] if len(parts) > 1 else key).split("?")[0]
            statuses = stats.get("statuses", {})
            in_backend = path_matches_backend(method, path_val)

            for status_str, count in statuses.items():
                try:
                    status = int(status_str)
                except ValueError:
                    continue
                if status >= 500:
                    endpoints_500.append(f"{key} (status {status}, count {count})")
                elif status == 404:
                    endpoints_404.append(f"{key} (in_backend={in_backend}, count {count})")
            if not in_backend and any(int(s) >= 400 for s in statuses.keys() if s.isdigit()):
                missing_endpoints.append(f"UI calls endpoint not in backend_routes: {key}")

    out_lines = [
        "=== UI vs API reconciliation ===",
        "",
        "--- Missing endpoints (UI calls, not in backend) ---",
    ]
    for m in missing_endpoints[:30]:
        out_lines.append(f"  {m}")
    if not missing_endpoints:
        out_lines.append("  (none)")
    out_lines.append("")
    out_lines.append("--- Endpoints with status 500 (P0) ---")
    for s in endpoints_500[:30]:
        out_lines.append(f"  {s}")
    if not endpoints_500:
        out_lines.append("  (none)")
    out_lines.append("")
    out_lines.append("--- Endpoints with 404 (P0/P1) ---")
    for s in endpoints_404[:30]:
        out_lines.append(f"  {s}")
    if not endpoints_404:
        out_lines.append("  (none)")
    out_lines.append("")
    out_lines.append("--- All problems (for report) ---")
    for m in missing_endpoints[:20]:
        out_lines.append(f"  P0: {m}")
    for s in endpoints_500[:20]:
        out_lines.append(f"  P0: {s}")
    for s in endpoints_404[:20]:
        out_lines.append(f"  P0/P1: {s}")

    art.mkdir(parents=True, exist_ok=True)
    (art / "ui_api_reconciliation.txt").write_text("\n".join(out_lines), encoding="utf-8")

    has_p0 = bool(missing_endpoints or endpoints_500 or endpoints_404)
    return has_p0, {"missing": missing_endpoints, "500": endpoints_500, "404": endpoints_404}


if __name__ == "__main__":
    art_dir = sys.argv[1] if len(sys.argv) > 1 else None
    if art_dir:
        art_dir = str(Path(art_dir).resolve())
    has_p0, _ = main(art_dir)
    sys.exit(1 if has_p0 else 0)
