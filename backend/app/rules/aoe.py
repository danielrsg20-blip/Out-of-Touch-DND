"""Area-of-Effect resolution for grid-based maps.

Given an origin point, shape, and size, returns which map entities
fall within the area.  All distances are in feet; 1 grid tile = 5 ft.
"""

from __future__ import annotations

import math
from typing import Any


FEET_PER_TILE = 5


def resolve_aoe(
    origin_x: int,
    origin_y: int,
    shape: str,
    size_feet: int,
    entities: dict[str, Any],
    *,
    direction_x: int = 0,
    direction_y: int = 1,
    exclude_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Return entities within an area of effect.

    Parameters
    ----------
    origin_x, origin_y : int
        Grid coordinates of the AoE origin/center.
    shape : str
        One of "sphere", "circle", "cylinder", "cube", "cone", "line".
    size_feet : int
        Radius (sphere/circle/cylinder), side length (cube),
        or length (cone/line) in feet.
    entities : dict[str, entity]
        Map entities keyed by ID. Each must have .x, .y, .id, .name attrs.
    direction_x, direction_y : int
        Direction vector for cone/line shapes.
    exclude_ids : list[str] | None
        Entity IDs to skip (e.g. caster with Sculpt Spells).
    """
    excluded = set(exclude_ids or [])
    size_tiles = size_feet / FEET_PER_TILE
    affected: list[dict[str, Any]] = []

    for eid, ent in entities.items():
        if eid in excluded:
            continue
        ex, ey = ent.x, ent.y
        if _in_area(origin_x, origin_y, ex, ey, shape, size_tiles, direction_x, direction_y):
            affected.append({"id": eid, "name": ent.name, "x": ex, "y": ey})

    return affected


def _in_area(
    ox: int, oy: int,
    tx: int, ty: int,
    shape: str,
    radius_tiles: float,
    dx: int, dy: int,
) -> bool:
    """Check if target (tx, ty) is inside the AoE shape centred at (ox, oy)."""
    dist = math.sqrt((tx - ox) ** 2 + (ty - oy) ** 2)

    if shape in ("sphere", "circle", "cylinder"):
        return dist <= radius_tiles

    if shape == "cube":
        half = radius_tiles / 2
        return abs(tx - ox) <= half and abs(ty - oy) <= half

    if shape == "cone":
        if dist > radius_tiles or dist == 0:
            return dist == 0  # origin is always in
        # Normalise direction vector
        mag = math.sqrt(dx * dx + dy * dy) or 1
        ndx, ndy = dx / mag, dy / mag
        # Vector from origin to target
        vx, vy = (tx - ox) / dist, (ty - oy) / dist
        cos_angle = ndx * vx + ndy * vy
        # Cone half-angle ≈ 53° (per 5e: cone is as wide as it is long)
        return cos_angle >= 0.6  # cos(53°) ≈ 0.6

    if shape == "line":
        if dist > radius_tiles:
            return False
        # Line is 5ft (1 tile) wide
        mag = math.sqrt(dx * dx + dy * dy) or 1
        ndx, ndy = dx / mag, dy / mag
        # Project target onto line direction
        proj = (tx - ox) * ndx + (ty - oy) * ndy
        if proj < 0 or proj > radius_tiles:
            return False
        # Perpendicular distance
        perp = abs((tx - ox) * (-ndy) + (ty - oy) * ndx)
        return perp <= 0.5  # half a tile width

    # Unknown shape — be generous
    return dist <= radius_tiles
