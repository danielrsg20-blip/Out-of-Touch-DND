from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ALLOWED_LICENSES = {
    "CC0-1.0",
    "CC-BY-4.0",
    "CC-BY-SA-4.0",
    "MIT",
}

REQUIRED_MAP_FIELDS = {
    "id",
    "name",
    "environment",
    "encounter_types",
    "size_class",
    "difficulty",
    "tags",
    "layout",
    "width",
    "height",
    "pack_id",
}


def _effective_license(entry: dict[str, Any], pack: dict[str, Any] | None) -> dict[str, Any] | None:
    own = entry.get("license")
    if isinstance(own, dict):
        return own
    if isinstance(own, str) and own.strip():
        return {
            "spdx": own.strip(),
            "author": entry.get("author", "Unknown"),
            "source_url": entry.get("source_url", ""),
            "attribution_required": bool(entry.get("requires_attribution", False)),
            "attribution_text": entry.get("attribution_text", ""),
        }

    if pack and isinstance(pack.get("license"), dict):
        return pack.get("license")

    return None


def validate_map_library_manifest(manifest_path: Path) -> list[str]:
    if not manifest_path.exists():
        return [f"Manifest file not found: {manifest_path}"]

    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"Invalid JSON in map manifest: {exc}"]

    maps = payload.get("maps", [])
    packs = payload.get("packs", [])

    if not isinstance(maps, list):
        return ["Manifest field 'maps' must be a list"]
    if packs and not isinstance(packs, list):
        return ["Manifest field 'packs' must be a list when present"]

    errors: list[str] = []

    pack_by_id: dict[str, dict[str, Any]] = {}
    for pack in packs:
        if not isinstance(pack, dict):
            errors.append("Pack entries must be objects")
            continue
        pack_id = str(pack.get("id", "")).strip()
        if not pack_id:
            errors.append("Pack entry missing id")
            continue
        pack_by_id[pack_id] = pack

    seen_map_ids: set[str] = set()
    project_root = manifest_path.resolve().parents[4]
    frontend_public = project_root / "frontend" / "public"

    for idx, entry in enumerate(maps):
        if not isinstance(entry, dict):
            errors.append(f"Map entry at index {idx} must be an object")
            continue

        map_id = str(entry.get("id", f"index_{idx}"))
        if map_id in seen_map_ids:
            errors.append(f"[{map_id}] Duplicate map id")
        seen_map_ids.add(map_id)

        missing = sorted(REQUIRED_MAP_FIELDS - set(entry.keys()))
        if missing:
            errors.append(f"[{map_id}] Missing required fields: {missing}")
            continue

        pack_id = str(entry.get("pack_id", "")).strip()
        pack = pack_by_id.get(pack_id)
        if packs and pack is None:
            errors.append(f"[{map_id}] Unknown pack_id: {pack_id}")

        encounter_types = entry.get("encounter_types")
        if not isinstance(encounter_types, list) or not encounter_types:
            errors.append(f"[{map_id}] encounter_types must be a non-empty list")

        tags = entry.get("tags")
        if not isinstance(tags, list):
            errors.append(f"[{map_id}] tags must be a list")

        for dim in ("width", "height"):
            try:
                value = int(entry.get(dim, 0))
            except Exception:
                errors.append(f"[{map_id}] {dim} must be an integer")
                continue
            if value < 8:
                errors.append(f"[{map_id}] {dim} must be >= 8")

        license_info = _effective_license(entry, pack)
        if not license_info:
            errors.append(f"[{map_id}] Missing license metadata")
            continue

        spdx = str(license_info.get("spdx", "")).strip()
        if spdx not in ALLOWED_LICENSES:
            errors.append(f"[{map_id}] Unsupported SPDX license: {spdx}")

        source_url = str(license_info.get("source_url", "")).strip()
        if source_url and not (source_url.startswith("http://") or source_url.startswith("https://")):
            errors.append(f"[{map_id}] source_url must be http/https")

        attribution_required = bool(license_info.get("attribution_required", False))
        attribution_text = str(license_info.get("attribution_text", "")).strip()
        if attribution_required and not attribution_text:
            errors.append(f"[{map_id}] attribution_text required when attribution_required is true")

        image_url = str(entry.get("image_url", "")).strip()
        if image_url and image_url.startswith("/"):
            candidate = frontend_public / image_url.lstrip("/")
            if not candidate.exists():
                errors.append(f"[{map_id}] image_url points to missing file: {candidate}")

    return errors
