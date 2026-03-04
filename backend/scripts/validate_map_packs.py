from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.maps.license_validation import validate_assets_manifest, validate_map_library_manifest


def main() -> int:
    maps_manifest_path = Path(__file__).resolve().parents[1] / "app" / "maps" / "data" / "map_library.json"
    assets_manifest_path = Path(__file__).resolve().parents[1] / "app" / "maps" / "data" / "assets_manifest.json"

    errors = validate_map_library_manifest(maps_manifest_path)
    asset_errors, asset_warnings = validate_assets_manifest(assets_manifest_path)
    errors.extend(asset_errors)

    if errors:
        print("Manifest validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    if asset_warnings:
        print("Manifest validation warnings:")
        for warning in asset_warnings:
            print(f"- {warning}")

    print("Manifest validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
