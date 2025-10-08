import asyncio, os
from monitoring.screenshot_agent import run_snap
from monitoring.visual_diff import run as run_visual_diff
import monitoring.autoheal as autoheal
try:
    from monitoring import cleanup
except Exception:
    cleanup = None

INTERVAL = int(os.getenv("SCHED_INTERVAL","900"))  # 900 сек = 15 минут

async def job():
    try:
        await run_snap()
    except Exception as e:
        print(f"[snap] error: {e}")
    try:
        code = run_visual_diff()
        print(f"[diff] exit={code}")
    except Exception as e:
        print(f"[diff] error: {e}")
    try:
        code = autoheal.run_once()
        print(f"[autoheal] exit={code}")
    except Exception as e:
        print(f"[autoheal] error: {e}")
    try:
        if cleanup:
            cleanup.run()  # удалит старые скриншоты/диффы по KEEP_DAYS
    except Exception as e:
        print(f"[cleanup] error: {e}")

async def main(loop_once: bool = False):
    if loop_once:
        await job()
        return
    while True:
        await job()
        await asyncio.sleep(INTERVAL)

if name == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--once", action="store_true")
    args = p.parse_args()
    asyncio.run(main(loop_once=args.once))
