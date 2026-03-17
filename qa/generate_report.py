"""
Generate QA_REPORT.md from qa_artifacts/<run>.
Parses pytest logs, frontend artifacts, UI↔API reconciliation.
Usage: python qa/generate_report.py <run_dir> [output_path]
"""
import json
import os
import re
import sys
from pathlib import Path


def parse_pytest_log(path: Path) -> dict:
    """Parse pytest_all.txt or pytest_selected.txt. Return summary and top errors."""
    out = {"summary_line": "", "passed": 0, "failed": 0, "errors": 0, "skipped": 0, "top_errors": []}
    if not path.exists():
        return out
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    # Last line often: "91 failed, 29 passed, 6 skipped, 29 warnings, 3 errors in 21.08s"
    for line in reversed(lines):
        line = line.strip()
        if re.search(r"\d+\s+(failed|passed|error|skipped)", line, re.I):
            out["summary_line"] = line
            for m in re.finditer(r"(\d+)\s*(failed|passed|errors?|skipped)", line, re.I):
                n = int(m.group(1))
                k = m.group(2).lower()
                if "fail" in k:
                    out["failed"] = n
                elif "pass" in k:
                    out["passed"] = n
                elif "error" in k:
                    out["errors"] = n
                elif "skip" in k:
                    out["skipped"] = n
            break
    # Collect FAILED / ERROR test names (path::test_name or file::test_name)
    for i, line in enumerate(lines):
        if (line.startswith("FAILED ") or line.startswith("ERROR ")) and "::" in line:
            short = line[:120].strip()
            if short not in out["top_errors"]:
                out["top_errors"].append(short)
    out["top_errors"] = out["top_errors"][:10]
    return out


def parse_reconcile(path: Path) -> tuple[list[str], list[str], list[str], list[str]]:
    """Read ui_api_reconciliation.txt. Return (p0_lines, missing_endpoints, status_500, status_404)."""
    missing = []
    status_500 = []
    status_404 = []
    p0_lines = []
    if not path.exists():
        return p0_lines, missing, status_500, status_404
    text = path.read_text(encoding="utf-8", errors="replace")
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("---") or line == "(none)" or not line:
            continue
        if "not in backend" in line or "UI calls endpoint" in line:
            missing.append(line)
            p0_lines.append(line)
        elif "500" in line or "status=500" in line:
            status_500.append(line)
            p0_lines.append(line)
        elif "404" in line or "status=404" in line:
            status_404.append(line)
            p0_lines.append(line)
    return p0_lines, missing, status_500, status_404


def build_frontend_pages(run: Path, routes: list[str]) -> list[dict]:
    """Build list of {route, status, console_count, network_count, screenshot} from artifacts."""
    screens_dir = run / "screens"
    console_log = run / "console_log.txt"
    ui_calls = run / "ui_api_calls.json"
    pw_report = run / "playwright_report.txt"

    console_count = 0
    if console_log.exists():
        console_count = len([l for l in console_log.read_text(encoding="utf-8", errors="replace").splitlines() if l.strip() and not l.strip().startswith("[")])

    network_4xx = 0
    network_5xx = 0
    if ui_calls.exists():
        try:
            data = json.loads(ui_calls.read_text(encoding="utf-8"))
            for key, stats in data.items():
                for s, _ in stats.get("statuses", {}).items():
                    try:
                        n = int(s)
                        if 400 <= n < 500:
                            network_4xx += 1
                        elif n >= 500:
                            network_5xx += 1
                    except ValueError:
                        pass
        except Exception:
            pass

    playwright_ran = pw_report.exists() and screens_dir.exists()
    pages = []
    for route in routes:
        route = route.strip()
        if not route or route.startswith("#"):
            continue
        slug = route.replace("/", "_").strip("_") or "home"
        screenshot_name = f"{slug}.png"
        alt_names = [f"menu_{slug}.png", f"{slug}.png", "home.png", "market.png", "features.png", "pricing.png", "dashboard_guest.png", "editor_1.png", "not_found.png"]
        screenshot_path = ""
        if screens_dir.exists():
            for name in [screenshot_name] + alt_names:
                if (screens_dir / name).exists():
                    screenshot_path = f"{run.name}/screens/{name}"
                    break
        if not playwright_ran:
            status = "NAV_FAIL"
        elif not screenshot_path:
            status = "MISSING"
        elif network_5xx > 0:
            status = "NETWORK_5XX"
        elif network_4xx > 0:
            status = "NETWORK_4XX"
        elif console_count > 0:
            status = "CONSOLE_ERRORS"
        else:
            status = "OK"
        pages.append({
            "route": route or "/",
            "status": status,
            "console_count": console_count if route == "/" else "",  # per-page not stored, use global once
            "network_count": f"4xx:{network_4xx} 5xx:{network_5xx}" if (network_4xx or network_5xx) else "0",
            "screenshot": screenshot_path or "-",
        })
    return pages


def main(run_dir: str, output_path: str | None = None):
    run = Path(run_dir)
    project_root = run.parent.parent
    out = Path(output_path) if output_path else (project_root / "QA_REPORT.md")

    p0_list = []
    p1_list = []
    p2_list = []

    # --- Pytest ---
    pytest_all = run / "pytest_all.txt"
    pytest_sel = run / "pytest_selected.txt"
    log_priority = [pytest_all, run / "logs" / "pytest.log", pytest_sel]
    pytest_content = ""
    for p in log_priority:
        if p.exists():
            pytest_content = p.read_text(encoding="utf-8", errors="replace")
            break

    parse_all = parse_pytest_log(pytest_all)
    parse_sel = parse_pytest_log(pytest_sel)
    pytest_failed = (parse_all["failed"] or 0) + (parse_all["errors"] or 0) > 0
    if pytest_failed:
        p0_list.append(f"Backend tests failed (pytest_all: {parse_all['failed']} failed, {parse_all['errors']} errors) - see {run.name}/pytest_all.txt")

    # --- Migrations ---
    migrations_ok = True
    if (run / "backend_alembic.log").exists():
        t = (run / "backend_alembic.log").read_text(encoding="utf-8", errors="replace")
        if "FAILED" in t or "Error" in t or "ERROR" in t:
            migrations_ok = False
            p0_list.append("Migrations failed - see backend_alembic.log")

    # --- Frontend / Playwright ---
    playwright_ran = (run / "playwright_report.txt").exists()
    frontend_started = (run / "frontend_stdout.log").exists() or (run / "frontend_stderr.log").exists()
    if not frontend_started and not (run / "backend_routes.txt").exists():
        pass  # no run at all
    elif not playwright_ran:
        p0_list.append("Frontend QA missing (Playwright did not run) - see frontend_stdout.log, frontend_stderr.log")
    if (run / "frontend_stderr.log").exists():
        err_content = (run / "frontend_stderr.log").read_text(encoding="utf-8", errors="replace")
        if err_content.strip() and "Start-Process" in err_content or "Error" in err_content:
            p0_list.append("Frontend did not start - see frontend_stderr.log")

    # --- UI vs API ---
    recon_path = run / "ui_api_reconciliation.txt"
    p0_recon, missing_ep, status_500_list, status_404_list = parse_reconcile(recon_path)
    for line in p0_recon[:15]:
        if line and line not in p0_list and not line.startswith("---"):
            p0_list.append(f"UI↔API: {line[:100]}")

    # --- Frontend routes for table ---
    routes_file = run / "frontend_routes.txt"
    if not routes_file.exists():
        routes_file = Path(run_dir).parent.parent / "qa" / "frontend_routes_static.txt"
    routes = []
    if routes_file.exists():
        routes = [l.strip() for l in routes_file.read_text(encoding="utf-8", errors="replace").splitlines() if l.strip() and not l.startswith("#")]
    if not routes:
        routes = ["/", "/market", "/features", "/pricing", "/dashboard", "/dashboard/bots", "/dashboard/templates", "/dashboard/settings", "/editor/1"]

    pages = build_frontend_pages(run, routes)

    # --- Console log count for P1 ---
    console_count = 0
    if (run / "console_log.txt").exists():
        console_count = len([l for l in (run / "console_log.txt").read_text(encoding="utf-8", errors="replace").splitlines() if l.strip()])
    if console_count > 0:
        p1_list.append(f"Console errors on frontend: {console_count} (see console_log.txt)")

    # --- Build report ---
    pass_result = "FAIL" if (p0_list or pytest_failed or not migrations_ok) else "PASS"
    p0_count = len(p0_list)
    p1_count = len(p1_list)
    p2_count = len(p2_list)

    lines = []
    lines.append("# QA Report - BotForg")
    lines.append("")
    lines.append(f"Artifacts: `qa_artifacts/{run.name}/`")
    lines.append("")

    # 1) Summary
    lines.append("## 1) Summary")
    lines.append(f"- **Result:** {pass_result}")
    lines.append(f"- P0: {p0_count} | P1: {p1_count} | P2: {p2_count}")
    lines.append("")

    # Environment check
    env_versions = run / "env_versions.txt"
    if env_versions.exists():
        lines.append("## Environment check")
        lines.append("")
        for line in env_versions.read_text(encoding="utf-8", errors="replace").strip().splitlines():
            if line.strip():
                lines.append(f"- {line.strip()}")
        lines.append("")

    # 2) Backend
    lines.append("## 2) Backend")
    lines.append(f"- **Migrations:** {'ok' if migrations_ok else 'failed'}")
    lines.append(f"- **Pytest All:** {'passed' if not pytest_failed else 'failed'} — {parse_all['summary_line'] or 'no summary'}")
    lines.append(f"- **Pytest Selected:** {parse_sel['summary_line'] or 'see pytest_selected.txt'}")
    lines.append("- **/health:** checked at startup")
    lines.append(f"- **Routes:** `{run.name}/backend_routes.txt`")
    lines.append("")
    lines.append("### Top errors (first 10)")
    for err in parse_all["top_errors"]:
        lines.append(f"- {err}")
    if not parse_all["top_errors"] and pytest_failed:
        lines.append("- (see pytest_all.txt for full tracebacks)")
    lines.append("")

    # 3) Frontend
    lines.append("## 3) Frontend")
    lines.append("| Route | Status | Console errors | Network errors | Screenshot |")
    lines.append("|-------|--------|----------------|----------------|------------|")
    for p in pages[:25]:
        lines.append(f"| {p['route']} | {p['status']} | {p['console_count']} | {p['network_count']} | {p['screenshot']} |")
    lines.append("")
    lines.append(f"- Playwright report: `{run.name}/playwright_report.txt`")
    lines.append(f"- Console log: `{run.name}/console_log.txt`")
    lines.append("")

    # 4) UI vs API
    lines.append("## 4) UI vs API")
    if missing_ep:
        lines.append("### Missing endpoints (UI calls, not in backend)")
        for m in missing_ep[:20]:
            lines.append(f"- {m}")
        lines.append("")
    if status_500_list:
        lines.append("### Endpoints with status 500 (P0)")
        for s in status_500_list[:20]:
            lines.append(f"- {s}")
        lines.append("")
    if status_404_list:
        lines.append("### Endpoints with 404 (P0/P1)")
        for s in status_404_list[:20]:
            lines.append(f"- {s}")
        lines.append("")
    lines.append(f"- Full reconciliation: `{run.name}/ui_api_reconciliation.txt`")
    if (run / "ui_api_calls.json").exists():
        lines.append(f"- API calls: `{run.name}/ui_api_calls.json`")
    lines.append("")

    # 5) Recommendations
    lines.append("## 5) Recommendations")
    lines.append("- **P0:**")
    for x in p0_list[:15]:
        lines.append(f"  - {x}")
    if not p0_list:
        lines.append("  - (none)")
    lines.append("- **P1:**")
    for x in p1_list[:10]:
        lines.append(f"  - {x}")
    if not p1_list:
        lines.append("  - (none)")
    lines.append("- **P2:**")
    for x in p2_list[:10]:
        lines.append(f"  - {x}")
    if not p2_list:
        lines.append("  - (none)")
    lines.append("")

    # 6) Artifacts
    lines.append("## 6) Artifacts")
    lines.append(f"- Run folder: `qa_artifacts/{run.name}/`")
    lines.append("- backend_alembic.log, backend_stdout.log, backend_stderr.log")
    lines.append("- frontend_stdout.log, frontend_stderr.log")
    lines.append("- pytest_all.txt, pytest_selected.txt")
    lines.append("- backend_routes.txt, openapi.json (if available)")
    lines.append("- playwright_report.txt, screens/, ui_api_calls.json, console_log.txt")
    lines.append("- ui_api_reconciliation.txt")

    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report written to {out}")
    return pass_result, p0_count, p1_count, p2_count


if __name__ == "__main__":
    run_dir = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("QA_ARTIFACTS_DIR")
    out_path = sys.argv[2] if len(sys.argv) > 2 else None
    if not run_dir:
        print("Usage: python qa/generate_report.py <run_dir> [output_path]")
        sys.exit(1)
    main(run_dir, out_path)
