#!/usr/bin/env python3
"""Expand Terrain_and_Props.json with explicit variant alias labels.

Adds alias entries like "orange brick_cracked" that point to the same atlas frame as
"orange brick". This allows explicit variant lookup keys to resolve directly in the
frontend atlas cache.
"""

from __future__ import annotations

import json
from pathlib import Path

ATLAS_PATH = Path(__file__).resolve().parents[2] / "frontend" / "public" / "sprites" / "Environment" / "Terrain_and_Props.json"

FLOORISH = ["floor", "stone", "brick", "dirt", "ground", "path", "road", "trail", "mud", "grass", "moss", "wood", "plank", "soil"]
WALLISH = ["wall", "brick", "stone", "hedge", "tree", "cliff", "rock", "fence", "pillar", "column", "statue", "wood"]
WATERISH = ["water", "river", "pond", "stream", "pool", "swamp"]

FLOOR_SUFFIXES = ["clean", "cracked", "rubble", "mossy", "patchy", "grass_creep", "stone_patch", "boards", "worn", "rotted"]
WALL_SUFFIXES = ["smooth", "cracked", "worn", "dark", "earthy", "root_cluster", "cave_wall", "stone_vein", "weathered", "splintered", "rotten"]
WATER_SUFFIXES = ["calm", "waves", "murky", "algae"]


def normalize(label: str) -> str:
    return " ".join(label.strip().lower().replace("_", " ").split())


def matches_any(label: str, keywords: list[str]) -> bool:
    return any(k in label for k in keywords)


def alias_suffixes_for(label: str) -> list[str]:
    suffixes: set[str] = set()
    if matches_any(label, FLOORISH):
        suffixes.update(FLOOR_SUFFIXES)
    if matches_any(label, WALLISH):
        suffixes.update(WALL_SUFFIXES)
    if matches_any(label, WATERISH):
        suffixes.update(WATER_SUFFIXES)
    return sorted(suffixes)


def main() -> None:
    with ATLAS_PATH.open("r", encoding="utf-8-sig") as f:
        entries = json.load(f)

    if not isinstance(entries, list):
        raise SystemExit("Atlas payload is not a list")

    existing = {normalize(str(e.get("label", ""))) for e in entries if isinstance(e, dict)}
    additions = []

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        label = normalize(str(entry.get("label", "")))
        if not label:
            continue

        for suffix in alias_suffixes_for(label):
            alias = normalize(f"{label}_{suffix}")
            if alias in existing:
                continue
            alias_entry = dict(entry)
            alias_entry["label"] = alias
            additions.append(alias_entry)
            existing.add(alias)

    if additions:
        entries.extend(additions)

    with ATLAS_PATH.open("w", encoding="utf-8-sig") as f:
        json.dump(entries, f, indent=2)

    print(f"Added {len(additions)} alias labels. Total entries: {len(entries)}")


if __name__ == "__main__":
    main()
