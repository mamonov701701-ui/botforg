#!/usr/bin/env python3
"""
Визуальный контроль изменений по скриншотам.
Сравнивает последний набор скриншотов с baseline и отправляет отчет о различиях.
"""

from pathlib import Path
from datetime import datetime
import os, json
import zipfile
from PIL import Image, ImageChops, ImageStat
import requests

TG_TOKEN = os.getenv("TG_BOT_TOKEN","")
CHAT_ID  = os.getenv("TG_CHAT_ID","")
ROOT = Path("monitoring")
BASELINE = ROOT/"baseline"
SHOTS = ROOT/"screenshots"
DIFF = ROOT/"diff"
DIFF_THRESHOLD = 0.015

def send_msg(t):
    if not TG_TOKEN or not CHAT_ID: return
    try:
        requests.post(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage", data={"chat_id":CHAT_ID,"text":t}, timeout=30)
    except: pass

def send_doc(p:Path, caption=""):
    if not TG_TOKEN or not CHAT_ID: return
    try:
        with p.open("rb") as f:
            requests.post(f"https://api.telegram.org/bot{TG_TOKEN}/sendDocument", data={"chat_id":CHAT_ID,"caption":caption}, files={"document":(p.name,f)}, timeout=60)
    except: pass

def last_run_dir():
    # последний подкаталог с файлами
    cands = sorted(SHOTS.rglob("summary.json"))
    if not cands: return None
    return cands[-1].parent

def ensure_baseline_from_last():
    base = BASELINE
    if any(base.glob("*.png")):
        return False  # уже есть baseline
    shots = last_run_dir()
    if not shots:
        send_msg("visual_diff: нет прогона для baseline");
        return False
    base.mkdir(parents=True, exist_ok=True)
    for p in shots.glob("*.png"):
        (base/p.name).write_bytes(p.read_bytes())
    send_msg("📌 Baseline создан из последнего прогона")
    return True

def img_diff(a:Path, b:Path, out:Path):
    ia, ib = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
    if ia.size != ib.size:
        ib = ib.resize(ia.size)
    d = ImageChops.difference(ia, ib)
    stat = ImageStat.Stat(d)
    # нормируем среднюю яркость на максимум 255
    mean = sum(stat.mean)/ (3*255)
    if mean>0:
        d.save(out)
    return float(mean)

def run():
    if ensure_baseline_from_last():
        # baseline только что создан — сравнивать не с чем, просто выходим ОК
        return 0
    shots = last_run_dir()
    if not shots:
        send_msg("visual_diff: нет последнего прогона"); return 1
    DIFF.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    outdir = DIFF/stamp
    outdir.mkdir(parents=True, exist_ok=True)
    report = {"baseline":str(BASELINE), "current":str(shots), "items":[]}
    changed = 0
    for png in sorted(shots.glob("*.png")):
        base = BASELINE/png.name
        if not base.exists():
            report["items"].append({"file":png.name,"status":"no-baseline"})
            continue
        out = outdir/(f"diff_{png.name}")
        score = img_diff(png, base, out)
        item = {"file":png.name,"score":score,"threshold":DIFF_THRESHOLD,"status":"ok"}
        if score>=DIFF_THRESHOLD:
            item["status"]="changed"
            changed += 1
        report["items"].append(item)
    rep = outdir/"report.json"
    rep.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    # Упакуем ZIP отчёт
    zip_path = outdir / "visual_diff_report.zip"
    try:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(rep, rep.name)
            for p in sorted(outdir.glob("diff_*.png")):
                z.write(p, p.name)
        # Отправим архив в Telegram, если настроено
        if TG_TOKEN and CHAT_ID:
            send_doc(zip_path, "Visual diff — архив отчёта")
    except Exception:
        pass
    if changed>0:
        send_msg(f"🔶 Visual diff: {changed} изменений (порог {DIFF_THRESHOLD})")
        send_doc(rep, "report.json")
        # приложим первые 3 диффа
        for p in list(outdir.glob("diff_*.png"))[:3]:
            send_doc(p, p.name)
    else:
        send_msg("✅ Visual diff: изменений нет")
    return 0

if __name__=="__main__":
    run()
