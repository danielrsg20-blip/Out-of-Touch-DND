#!/usr/bin/env python3
"""Release gate: fail if generated env labels cannot resolve in terrain atlas."""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.map_catalog import run_terrain_atlas_resolution_check  # noqa: E402


def main() -> int:
    report = run_terrain_atlas_resolution_check()
    print(json.dumps(report, indent=2, sort_keys=True))

    if not bool(report.get("ok")):
        unresolved = int(report.get("unresolved_count", 0))
        errors = report.get("errors", [])
        print(
            f"Atlas resolution check failed: unresolved_count={unresolved}, errors={len(errors)}",
            file=sys.stderr,
        )
        return 1

    print("Atlas resolution check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
