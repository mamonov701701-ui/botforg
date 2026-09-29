"""Safe probe for the canonical development wrapper; never prints the token."""

from __future__ import annotations

import json
import os
import subprocess
import sys


def snapshot() -> dict[str, object]:
    return {
        "enabled": os.environ.get("CUSTOM_BLOCK_EXECUTION_ENABLED") == "true",
        "url": os.environ.get("CUSTOM_BLOCK_RUNNER_URL"),
        "token_configured": bool(os.environ.get("CUSTOM_BLOCK_RUNNER_SHARED_TOKEN")),
    }


if "--child" in sys.argv:
    print(json.dumps(snapshot()))
else:
    completed = subprocess.run(
        [sys.executable, __file__, "--child"],
        check=True,
        capture_output=True,
        text=True,
    )
    print(completed.stdout.strip())
