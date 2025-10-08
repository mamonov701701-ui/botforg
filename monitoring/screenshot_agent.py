import asyncio
import json
import re
import time
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any
import zipfile

import requests
from playwright.async_api import async_playwright, Page, BrowserContext

from .config import BASE_URL, PAGES, VIEWPORTS, FULLPAGE_FOR, ROOT_DIR, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

SAFE_NAME = re.compile(r"[^a-zA-Z0-9_.-]+")

def safe_filename(text: str) -> str:
    return SAFE_NAME.sub("-", text)

def ts_dir() -> Path:
    d = ROOT_DIR / datetime.now().strftime("%Y-%m-%d") / datetime.now().strftime("%H%M")
    d.mkdir(parents=True, exist_ok=True)
    return d

def send_telegram_photo(photo_path: Path, caption: str = "") -> None:
    if not (TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID):
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendPhoto"
    with photo_path.open("rb") as f:
        files = {"photo": (photo_path.name, f)}
        data = {"chat_id": TELEGRAM_CHAT_ID, "caption": caption}
        try:
            requests.post(url, data=data, files=files, timeout=30)
        except Exception:
            pass

def send_telegram_document(doc_path: Path, caption: str = "") -> None:
    if not (TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID):
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendDocument"
    with doc_path.open("rb") as f:
        files = {"document": (doc_path.name, f, "application/octet-stream")}
        data = {"chat_id": TELEGRAM_CHAT_ID, "caption": caption}
        try:
            requests.post(url, data=data, files=files, timeout=30)
        except Exception:
            pass

async def snap_for_viewport(context: BrowserContext, vp_name: str, out_dir: Path) -> Dict[str, Any]:
    results = {"viewport": vp_name, "pages": [], "request_failed": []}
    page: Page = await context.new_page()

    # Сбор сетевых ошибок по всем страницам в рамках этого viewport
    def _on_request_failed(req):
        try:
            failure = getattr(req, "failure", None)
            failure_text = getattr(failure, "error_text", None) if failure else None
        except Exception:
            failure_text = None
        results["request_failed"].append({
            "url": getattr(req, "url", lambda: "")() if callable(getattr(req, "url", None)) else getattr(req, "url", ""),
            "failure": failure_text,
            "ts": time.time(),
        })

    page.on("requestfailed", _on_request_failed)

    for p in PAGES:
        name = p["name"]
        path = p["path"]
        url = f"{BASE_URL}{path}"
        entry: Dict[str, Any] = {"name": name, "url": url, "status": None, "errors": [], "console": {"error": 0, "warning": 0, "info": 0, "other": 0}}
        # Сбор консоли отдельно для каждой страницы и раздельно по типам
        console_msgs: Dict[str, List[Dict[str, Any]]] = {"error": [], "warning": [], "info": [], "other": []}
        def _on_console(msg):
            t = getattr(msg, "type", "")
            t = t if isinstance(t, str) else str(t)
            bucket = t if t in ("error", "warning", "info") else "other"
            console_msgs[bucket].append({
                "type": t,
                "text": getattr(msg, "text", "") if isinstance(getattr(msg, "text", None), str) else msg.text,
                "location": getattr(msg, "location", None),
                "ts": time.time(),
            })

        page.on("console", _on_console)
        try:
            resp = await page.goto(url, wait_until="networkidle", timeout=30000)
            status = resp.status if resp else None
            entry["status"] = status

            # небольшой доп.ожидания, чтобы анимации/шрифты подгрузились
            await page.wait_for_timeout(500)

            # скрин обычный
            file_base = f"{safe_filename(name)}__{vp_name}"
            img_path = out_dir / f"{file_base}.png"
            await page.screenshot(path=str(img_path), full_page=False)

            # full-page при необходимости
            if name in FULLPAGE_FOR:
                full_path = out_dir / f"{file_base}__full.png"
                await page.screenshot(path=str(full_path), full_page=True)

            # логи консоли для этой страницы
            logs_path = out_dir / f"{file_base}__console.json"
            with logs_path.open("w", encoding="utf-8") as f:
                json.dump(console_msgs, f, ensure_ascii=False, indent=2)

            # краткая сводка по типам в результирующую структуру
            entry["console"]["error"] = len(console_msgs["error"])
            entry["console"]["warning"] = len(console_msgs["warning"])
            entry["console"]["info"] = len(console_msgs["info"])
            entry["console"]["other"] = len(console_msgs["other"])

            # Отправка в Telegram (если токены заданы)
            send_telegram_photo(img_path, caption=f"{name} ({vp_name}) — status {status}")
            if name in FULLPAGE_FOR:
                send_telegram_photo(full_path, caption=f"{name} ({vp_name}) — full-page")
            send_telegram_document(logs_path, caption=f"{name} ({vp_name}) — console logs")

        except Exception as e:
            entry["errors"].append(str(e))

        results["pages"].append(entry)

    await page.close()
    return results

async def run_snap() -> Dict[str, Any]:
    out_dir = ts_dir()
    summary: Dict[str, Any] = {"base_url": BASE_URL, "output": str(out_dir), "viewports": [], "has_errors": False}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            for vp in VIEWPORTS:
                ctx = await browser.new_context(
                    viewport={"width": vp["width"], "height": vp["height"]},
                    device_scale_factor=vp.get("dpr", 1.0),
                    java_script_enabled=True,
                )
                vp_result = await snap_for_viewport(ctx, vp["name"], out_dir)
                # Флаг ошибок: сетевые или консольные error-сообщения
                has_network_errors = len(vp_result.get("request_failed", [])) > 0
                has_console_errors = any((pg.get("console", {}).get("error", 0) > 0) for pg in vp_result.get("pages", []))
                vp_result["has_errors"] = bool(has_network_errors or has_console_errors)
                summary["has_errors"] = summary["has_errors"] or vp_result["has_errors"]
                summary["viewports"].append(vp_result)
                await ctx.close()
        finally:
            await browser.close()

    # Сводка в файл
    summary_path = Path(out_dir) / "summary.json"
    with summary_path.open("w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    # И сводку тоже отправим (как документ)
    send_telegram_document(summary_path, caption="Сводка скриншотов")

    # Собираем ZIP архив прогона и отправляем в Telegram
    zip_path = Path(out_dir) / "report.zip"
    try:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            for p in out_dir.glob("*.png"):
                z.write(p, p.name)
            for p in out_dir.glob("*.json"):
                z.write(p, p.name)
        send_telegram_document(zip_path, caption="Снимки и логи (ZIP)")
    except Exception:
        pass
    return summary

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Screenshot agent")
    parser.add_argument("--pages", type=str, default="", help="Comma-separated page names to capture")
    parser.add_argument("--viewports", type=str, default="", help="Comma-separated WxH list, e.g. 1440x900,1920x1080")
    parser.add_argument("--full", type=str, default="", help="Comma-separated page names for full-page screenshots")
    args = parser.parse_args()

    # Переопределение PAGES
    if args.pages:
        wanted = [s.strip() for s in args.pages.split(",") if s.strip()]
        name_to_page = {p["name"]: p for p in PAGES}
        new_pages = [name_to_page[n] for n in wanted if n in name_to_page]
        if new_pages:
            PAGES = new_pages  # type: ignore

    # Переопределение VIEWPORTS
    if args.viewports:
        vp_list = []
        for item in [s.strip() for s in args.viewports.split(",") if s.strip()]:
            m = re.match(r"^(\d+)x(\d+)$", item)
            if not m:
                continue
            w, h = int(m.group(1)), int(m.group(2))
            vp_list.append({"name": f"{w}x{h}", "width": w, "height": h, "dpr": 1.0})
        if vp_list:
            VIEWPORTS = vp_list  # type: ignore

    # Переопределение FULLPAGE_FOR
    if args.full:
        FULLPAGE_FOR = {s.strip() for s in args.full.split(",") if s.strip()}  # type: ignore

    result = asyncio.run(run_snap())
    sys.exit(2 if result.get("has_errors") else 0)

