from __future__ import annotations

import json
import re
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

ALLOWED_IMPORT_POLICIES = {"approved", "conditional", "blocked"}

SUPPORTED_SPDX_PREFIXES = (
    "CC0",
    "CC-BY",
    "CC-BY-SA",
    "OGA-BY",
    "GPL",
    "MIT",
    "Apache-2.0",
)

COPYLEFT_HINTS = ("BY-SA", "GPL", "OGA-BY")
DISALLOWED_TERMS_RE = re.compile(r"(^|[^A-Z0-9])(NC|ND|ARR)([^A-Z0-9]|$)|all rights reserved", re.IGNORECASE)


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


def _looks_supported_spdx_expression(expression: str) -> bool:
    parts = re.split(r"\s+(?:AND|OR|WITH)\s+|[()]", expression, flags=re.IGNORECASE)
    tokens = [part.strip() for part in parts if part.strip()]
    if not tokens:
        return False
    for token in tokens:
        if not token.upper().startswith(SUPPORTED_SPDX_PREFIXES):
            return False
    return True


def validate_assets_manifest(manifest_path: Path) -> tuple[list[str], list[str]]:
    if not manifest_path.exists():
        return [f"Assets manifest file not found: {manifest_path}"], []

    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"Invalid JSON in assets manifest: {exc}"], []

    assets = payload.get("assets")
    if not isinstance(assets, list):
        return ["Assets manifest field 'assets' must be a list"], []

    errors: list[str] = []
    warnings: list[str] = []
    seen_ids: set[str] = set()

    for idx, asset in enumerate(assets):
        if not isinstance(asset, dict):
            errors.append(f"Asset entry at index {idx} must be an object")
            continue

        asset_id = str(asset.get("id", "")).strip()
        asset_label = asset_id or f"index_{idx}"

        if not asset_id:
            errors.append(f"[{asset_label}] Missing id")
        elif asset_id in seen_ids:
            errors.append(f"[{asset_label}] Duplicate asset id")
        else:
            seen_ids.add(asset_id)

        source_url = str(asset.get("source_url", "")).strip()
        if not (source_url.startswith("http://") or source_url.startswith("https://")):
            errors.append(f"[{asset_label}] source_url must be http/https")

        if asset.get("redistribution_allowed") is not True:
            errors.append(f"[{asset_label}] redistribution_allowed must be true")

        if asset.get("modification_allowed") is not True:
            errors.append(f"[{asset_label}] modification_allowed must be true")

        attribution_required = bool(asset.get("attribution_required", False))
        attribution_text = str(asset.get("attribution_text", "")).strip()
        if attribution_required and not attribution_text:
            errors.append(f"[{asset_label}] attribution_text required when attribution_required is true")

        license_data = asset.get("license")
        if not isinstance(license_data, dict):
            errors.append(f"[{asset_label}] license must be an object")
            continue

        spdx_expression = str(license_data.get("spdx_expression", "")).strip()
        if not spdx_expression:
            errors.append(f"[{asset_label}] license.spdx_expression is required")
        elif DISALLOWED_TERMS_RE.search(spdx_expression):
            errors.append(f"[{asset_label}] license.spdx_expression contains disallowed NC/ND/ARR terms")
        elif not _looks_supported_spdx_expression(spdx_expression):
            errors.append(f"[{asset_label}] Unsupported license.spdx_expression: {spdx_expression}")

        if any(hint in spdx_expression.upper() for hint in COPYLEFT_HINTS):
            warnings.append(f"[{asset_label}] Copyleft/share-alike license detected ({spdx_expression})")

        import_policy = str(asset.get("import_policy", "")).strip().lower()
        if import_policy not in ALLOWED_IMPORT_POLICIES:
            errors.append(f"[{asset_label}] import_policy must be one of {sorted(ALLOWED_IMPORT_POLICIES)}")
        elif import_policy == "conditional":
            warnings.append(f"[{asset_label}] Conditional import policy requires manual compliance review")

    return errors, warnings
