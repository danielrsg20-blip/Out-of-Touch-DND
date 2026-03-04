from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.maps.license_validation import validate_map_library_manifest


def main() -> int:
    manifest_path = Path(__file__).resolve().parents[1] / "app" / "maps" / "data" / "map_library.json"
    errors = validate_map_library_manifest(manifest_path)

    if errors:
        print("Map manifest validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Map manifest validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
