"""Import 2024 SRD spells/class spell lists/class features from open 5e API sources.

Usage:
  python backend/scripts/import_srd_2024.py
"""

from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

VERSION_BASE_CANDIDATES = {
    "2024": ["https://www.dnd5eapi.co/api/2024"],
    "2014": ["https://www.dnd5eapi.co/api/2014", "https://www.dnd5eapi.co/api"],
}

DATA_DIR = Path(__file__).resolve().parents[1] / "app" / "rules" / "data"


def _http_json(url: str) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def _get_endpoint(endpoint: str, target_version: str, allow_2014_fallback: bool) -> tuple[str, dict[str, Any], str]:
    ordered_versions = [target_version]
    if target_version == "2024" and allow_2014_fallback:
        ordered_versions.append("2014")

    for version in ordered_versions:
        for base in VERSION_BASE_CANDIDATES.get(version, []):
            url = f"{base.rstrip('/')}/{endpoint.lstrip('/')}"
            try:
                return base, _http_json(url), version
            except Exception:
                continue

    tried = ", ".join(ordered_versions)
    raise RuntimeError(f"Unable to fetch endpoint '{endpoint}' from configured API bases for versions: {tried}")


def _fetch_resource(base_url: str, resource_url: str) -> dict[str, Any]:
    if resource_url.startswith("http://") or resource_url.startswith("https://"):
        return _http_json(resource_url)

    # Resource URLs from dnd5eapi are often absolute like /api/2014/spells/acid-arrow.
    absolute = urllib.parse.urljoin("https://www.dnd5eapi.co", resource_url)
    if "/api/" not in absolute:
        absolute = urllib.parse.urljoin(base_url.rstrip("/") + "/", resource_url.lstrip("/"))
    return _http_json(absolute)


def _collect_spells(target_version: str, allow_2014_fallback: bool) -> tuple[dict[str, dict[str, Any]], str]:
    base_url, payload, source_version = _get_endpoint("spells", target_version, allow_2014_fallback)
    results = payload.get("results", [])

    spells: dict[str, dict[str, Any]] = {}
    for item in results:
        detail = _fetch_resource(base_url, item["url"])
        name = detail.get("name") or item.get("name")
        if not name:
            continue

        classes = [c.get("name") for c in detail.get("classes", []) if c.get("name")]
        spell = {
            "id": "".join(ch for ch in name.lower() if ch.isalnum()),
            "name": name,
            "level": int(detail.get("level", 0)),
            "school": detail.get("school", {}).get("name", ""),
            "casting_time": detail.get("casting_time", ""),
            "range": detail.get("range", ""),
            "components": ", ".join(detail.get("components", [])) if isinstance(detail.get("components"), list) else str(detail.get("components", "")),
            "duration": detail.get("duration", ""),
            "classes": classes,
            "concentration": bool(detail.get("concentration", False)),
            "description": "\n".join(detail.get("desc", [])[:6]) if isinstance(detail.get("desc"), list) else str(detail.get("desc", "")),
            "rules_version": target_version,
            "source_rules_version": source_version,
            "source": "SRD",
            "license": "CC-BY-4.0",
        }
        spells[name] = spell
    return spells, source_version


def _collect_class_spell_lists(spells: dict[str, dict[str, Any]]) -> dict[str, list[str]]:
    by_class: dict[str, list[str]] = {}
    for name, spell in spells.items():
        for class_name in spell.get("classes", []):
            by_class.setdefault(class_name, []).append(name)

    for class_name in by_class:
        by_class[class_name] = sorted(set(by_class[class_name]))

    return dict(sorted(by_class.items()))


def _collect_class_features(target_version: str, allow_2014_fallback: bool) -> tuple[dict[str, list[dict[str, Any]]], str]:
    base_url, payload, source_version = _get_endpoint("classes", target_version, allow_2014_fallback)
    results = payload.get("results", [])

    by_class: dict[str, list[dict[str, Any]]] = {}
    for item in results:
        class_detail = _fetch_resource(base_url, item["url"])
        class_name = class_detail.get("name")
        if not class_name:
            continue

        class_levels_ref = class_detail.get("class_levels", [])
        if isinstance(class_levels_ref, str):
            levels = _fetch_resource(base_url, class_levels_ref)
        else:
            levels = class_levels_ref
        if not isinstance(levels, list):
            levels = []

        features: list[dict[str, Any]] = []
        for level in levels:
            if not isinstance(level, dict):
                continue
            level_number = int(level.get("level", 0))
            for feature_ref in level.get("features", []):
                if not isinstance(feature_ref, dict) or not feature_ref.get("url"):
                    continue
                feature_detail = _fetch_resource(base_url, feature_ref["url"])
                feature_name = feature_detail.get("name")
                if not feature_name:
                    continue
                feature = {
                    "id": "".join(ch for ch in feature_name.lower() if ch.isalnum()),
                    "name": feature_name,
                    "level": level_number,
                    "description": "\n".join(feature_detail.get("desc", [])[:4]) if isinstance(feature_detail.get("desc"), list) else str(feature_detail.get("desc", "")),
                }
                features.append(feature)

        # Deduplicate by name/level
        dedup: dict[tuple[str, int], dict[str, Any]] = {}
        for feature in features:
            key = (feature["name"], int(feature.get("level", 0)))
            dedup[key] = feature
        by_class[class_name] = sorted(dedup.values(), key=lambda f: (int(f.get("level", 0)), f.get("name", "")))

    return by_class, source_version


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import SRD spells/class spell lists/class features")
    parser.add_argument("--target-version", choices=["2024", "2014"], default="2024")
    parser.add_argument("--allow-2014-fallback", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    spells, spell_source_version = _collect_spells(args.target_version, args.allow_2014_fallback)
    class_spell_lists = _collect_class_spell_lists(spells)
    class_features, feature_source_version = _collect_class_features(args.target_version, args.allow_2014_fallback)

    source_version = spell_source_version if spell_source_version == feature_source_version else f"spells:{spell_source_version},features:{feature_source_version}"

    if args.target_version == "2024" and spell_source_version != "2024" and not args.allow_2014_fallback:
        raise RuntimeError("2024 SRD endpoint is unavailable from configured API sources. Re-run with --allow-2014-fallback to import available SRD content.")

    suffix = args.target_version
    _write_json(DATA_DIR / f"spells.{suffix}.json", spells)
    _write_json(DATA_DIR / f"class_spell_lists.{suffix}.json", class_spell_lists)
    _write_json(DATA_DIR / f"class_features.{suffix}.json", class_features)

    print(f"Imported {len(spells)} spells")
    print(f"Imported class spell lists for {len(class_spell_lists)} classes")
    print(f"Imported class features for {len(class_features)} classes")
    print(f"Source rules version used: {source_version}")


if __name__ == "__main__":
    main()
