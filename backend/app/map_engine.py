"""Map engine: grid state, entity placement, fog of war calculations."""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Tile:
    x: int
    y: int
    tile_type: str = "floor"
    state: str | None = None
    sprite: str | None = None
    variant: str | None = None
    blocks_movement: bool = False
    blocks_sight: bool = False

    def to_dict(self) -> dict:
        d: dict[str, Any] = {"x": self.x, "y": self.y, "type": self.tile_type}
        if self.state:
            d["state"] = self.state
        if self.sprite:
            d["sprite"] = self.sprite
        if self.variant:
            d["variant"] = self.variant
        return d


TILE_PROPERTIES: dict[str, dict[str, bool]] = {
    "wall": {"blocks_movement": True, "blocks_sight": True},
    "floor": {"blocks_movement": False, "blocks_sight": False},
    "door": {"blocks_movement": False, "blocks_sight": False},
    "door_closed": {"blocks_movement": True, "blocks_sight": True},
    "water": {"blocks_movement": False, "blocks_sight": False},
    "pit": {"blocks_movement": True, "blocks_sight": False},
    "pillar": {"blocks_movement": True, "blocks_sight": True},
    "stairs_up": {"blocks_movement": False, "blocks_sight": False},
    "stairs_down": {"blocks_movement": False, "blocks_sight": False},
    "chest": {"blocks_movement": False, "blocks_sight": False},
    "rubble": {"blocks_movement": True, "blocks_sight": False},
}


@dataclass
class MapEntity:
    id: str
    name: str
    x: int
    y: int
    entity_type: str = "npc"
    sprite: str = "default"
    visible: bool = True
    blocks_movement: bool = True
    prop_category: str | None = None

    def to_dict(self) -> dict:
        data = {
            "id": self.id,
            "name": self.name,
            "x": self.x,
            "y": self.y,
            "type": self.entity_type,
            "sprite": self.sprite,
            "visible": self.visible,
            "blocks_movement": self.blocks_movement,
        }
        if self.prop_category:
            data["prop_category"] = self.prop_category
        return data


@dataclass
class GameMap:
    width: int
    height: int
    tiles: dict[tuple[int, int], Tile] = field(default_factory=dict)
    entities: dict[str, MapEntity] = field(default_factory=dict)
    revealed: set[tuple[int, int]] = field(default_factory=set)
    metadata: dict[str, Any] = field(default_factory=dict)
    traversal_grid: dict[str, Any] | None = None

    def get_tile(self, x: int, y: int) -> Tile | None:
        return self.tiles.get((x, y))

    def set_tile(self, x: int, y: int, tile_type: str, state: str | None = None, sprite: str | None = None, variant: str | None = None) -> Tile:
        props = TILE_PROPERTIES.get(tile_type, {})
        effective_type = tile_type
        if tile_type == "door" and state == "closed":
            props = TILE_PROPERTIES.get("door_closed", {})

        tile = Tile(
            x=x, y=y,
            tile_type=tile_type,
            state=state,
            sprite=sprite,
            variant=variant,
            blocks_movement=props.get("blocks_movement", False),
            blocks_sight=props.get("blocks_sight", False),
        )
        self.tiles[(x, y)] = tile
        return tile

    def is_walkable(self, x: int, y: int) -> bool:
        if x < 0 or x >= self.width or y < 0 or y >= self.height:
            return False
        tile = self.tiles.get((x, y))
        if tile is None:
            return False
        return not tile.blocks_movement

    def is_occupied(self, x: int, y: int, *, ignore_entity_id: str | None = None) -> bool:
        for entity in self.entities.values():
            if ignore_entity_id and entity.id == ignore_entity_id:
                continue
            if not entity.blocks_movement:
                continue
            if entity.x == x and entity.y == y:
                return True
        return False

    def can_occupy(self, x: int, y: int, *, entity_id: str | None = None) -> bool:
        return self.is_walkable(x, y) and not self.is_occupied(x, y, ignore_entity_id=entity_id)

    def place_entity(self, entity: MapEntity) -> None:
        self.entities[entity.id] = entity

    def move_entity(self, entity_id: str, x: int, y: int) -> bool:
        entity = self.entities.get(entity_id)
        if entity is None:
            return False
        entity.x = x
        entity.y = y
        return True

    def remove_entity(self, entity_id: str) -> bool:
        return self.entities.pop(entity_id, None) is not None

    def compute_fov(self, origin_x: int, origin_y: int, radius: int = 12) -> set[tuple[int, int]]:
        """Simple raycasting FOV from a point."""
        visible: set[tuple[int, int]] = set()
        visible.add((origin_x, origin_y))

        num_rays = 360
        for i in range(num_rays):
            angle = (2 * math.pi * i) / num_rays
            dx = math.cos(angle)
            dy = math.sin(angle)

            x, y = float(origin_x) + 0.5, float(origin_y) + 0.5
            for _ in range(radius):
                x += dx
                y += dy
                ix, iy = int(math.floor(x)), int(math.floor(y))

                if ix < 0 or ix >= self.width or iy < 0 or iy >= self.height:
                    break

                visible.add((ix, iy))
                tile = self.tiles.get((ix, iy))
                if tile and tile.blocks_sight:
                    break

        self.revealed.update(visible)
        return visible

    def compute_party_fov(self, pc_entity_ids: list[str], radius: int = 12) -> set[tuple[int, int]]:
        all_visible: set[tuple[int, int]] = set()
        for eid in pc_entity_ids:
            entity = self.entities.get(eid)
            if entity:
                fov = self.compute_fov(entity.x, entity.y, radius)
                all_visible.update(fov)
        return all_visible

    def to_dict(self, visible_tiles: set[tuple[int, int]] | None = None) -> dict:
        if visible_tiles is None:
            tiles_list = [t.to_dict() for t in self.tiles.values()]
            entities_list = [e.to_dict() for e in self.entities.values()]
        else:
            tiles_list = [t.to_dict() for pos, t in self.tiles.items() if pos in visible_tiles or pos in self.revealed]
            entities_list = [e.to_dict() for e in self.entities.values() if (e.x, e.y) in visible_tiles]

        revealed_list = [{"x": r[0], "y": r[1]} for r in self.revealed if visible_tiles and (r[0], r[1]) not in visible_tiles]

        return {
            "width": self.width,
            "height": self.height,
            "tiles": tiles_list,
            "entities": entities_list,
            "revealed": revealed_list,
            "visible": [{"x": v[0], "y": v[1]} for v in visible_tiles] if visible_tiles else [],
            "metadata": dict(self.metadata),
            "traversal_grid": dict(self.traversal_grid) if isinstance(self.traversal_grid, dict) else self.traversal_grid,
        }

    # ------------------------------------------------------------------
    # Spatial analysis for DM system prompt
    # ------------------------------------------------------------------

    def _find_rooms(self) -> list[list[tuple[int, int]]]:
        """Flood-fill walkable tiles into connected components (rooms)."""
        visited: set[tuple[int, int]] = set()
        components: list[list[tuple[int, int]]] = []

        for (x, y), tile in self.tiles.items():
            if tile.blocks_movement or (x, y) in visited:
                continue
            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited.add((x, y))
            comp: list[tuple[int, int]] = []
            while queue:
                cx, cy = queue.popleft()
                comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if (nx, ny) in visited:
                        continue
                    nt = self.tiles.get((nx, ny))
                    if nt and not nt.blocks_movement:
                        visited.add((nx, ny))
                        queue.append((nx, ny))
            if len(comp) >= 4:
                components.append(comp)

        components.sort(key=len, reverse=True)
        return components

    def _find_chokepoints(self) -> list[tuple[int, int]]:
        """Walkable tiles with exactly 2 walkable orthogonal neighbors (narrow passages)."""
        chokepoints: list[tuple[int, int]] = []
        for (x, y), tile in self.tiles.items():
            if tile.blocks_movement:
                continue
            walkable_neighbors = sum(
                1 for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                if self.is_walkable(nx, ny)
            )
            if walkable_neighbors == 2:
                # Only count as chokepoint if the two neighbors are collinear (corridor)
                n = [(nx, ny) for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                     if self.is_walkable(nx, ny)]
                if len(n) == 2:
                    dx = abs(n[0][0] - n[1][0])
                    dy = abs(n[0][1] - n[1][1])
                    if dx == 2 or dy == 2:
                        chokepoints.append((x, y))
        return chokepoints

    def _find_cover(self) -> list[tuple[int, int, str]]:
        """Blocking tiles (pillars, rubble) adjacent to walkable tiles — usable as cover."""
        cover: list[tuple[int, int, str]] = []
        for (x, y), tile in self.tiles.items():
            if tile.tile_type not in ("pillar", "rubble"):
                continue
            has_adjacent_floor = any(
                self.is_walkable(nx, ny)
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
            )
            if has_adjacent_floor:
                cover.append((x, y, tile.tile_type))
        return cover

    def _find_hazards(self) -> list[tuple[int, int, str]]:
        """Hazardous tiles: pits, water, rubble."""
        hazards: list[tuple[int, int, str]] = []
        for (x, y), tile in self.tiles.items():
            if tile.tile_type in ("pit", "water"):
                hazards.append((x, y, tile.tile_type))
        return hazards

    def _find_doors(self) -> list[tuple[int, int, str]]:
        """Door tiles with their state."""
        doors: list[tuple[int, int, str]] = []
        for (x, y), tile in self.tiles.items():
            if tile.tile_type == "door":
                doors.append((x, y, tile.state or "open"))
        return doors

    @staticmethod
    def _quadrant(x: int, y: int, w: int, h: int) -> str:
        col = "W" if x < w // 2 else "E"
        row = "N" if y < h // 2 else "S"
        return f"{row}{col}"

    @staticmethod
    def _cluster_positions(positions: list[tuple[int, int]], w: int, h: int) -> str:
        """Summarise a list of positions as quadrant counts."""
        if not positions:
            return ""
        quads: dict[str, int] = {}
        for x, y in positions:
            q = GameMap._quadrant(x, y, w, h)
            quads[q] = quads.get(q, 0) + 1
        return ", ".join(f"{cnt} in {q}" for q, cnt in sorted(quads.items()))

    def build_spatial_summary(self) -> str:
        """Compact text summary of map layout for the AI DM system prompt."""
        parts: list[str] = []

        env = self.metadata.get("location") or self.metadata.get("environment", "")
        theme = self.metadata.get("terrain_theme", "")
        header = f"MAP: {self.width}x{self.height}"
        if env:
            header += f", {env}"
        if theme:
            header += f" ({theme})"
        parts.append(header)

        # Rooms
        rooms = self._find_rooms()
        if rooms:
            parts.append(f"Rooms: {len(rooms)} connected areas (largest {len(rooms[0])} tiles, smallest {len(rooms[-1])} tiles)")

        # Chokepoints
        chokes = self._find_chokepoints()
        if chokes:
            cluster = self._cluster_positions(chokes, self.width, self.height)
            parts.append(f"Chokepoints: {len(chokes)} narrow passages ({cluster})")

        # Cover
        cover = self._find_cover()
        if cover:
            cluster = self._cluster_positions([(x, y) for x, y, _ in cover], self.width, self.height)
            parts.append(f"Cover: {len(cover)} ({cluster})")

        # Hazards
        hazards = self._find_hazards()
        if hazards:
            by_type: dict[str, int] = {}
            for _, _, ht in hazards:
                by_type[ht] = by_type.get(ht, 0) + 1
            hz_desc = ", ".join(f"{cnt} {t}" for t, cnt in by_type.items())
            parts.append(f"Hazards: {hz_desc}")

        # Doors
        doors = self._find_doors()
        if doors:
            parts.append(f"Doors: {len(doors)}")

        # Entities by type
        by_type: dict[str, list[str]] = {}
        for e in self.entities.values():
            by_type.setdefault(e.entity_type, []).append(f"{e.name}@({e.x},{e.y})")
        for etype in ("pc", "enemy", "npc", "object"):
            group = by_type.get(etype)
            if group:
                parts.append(f"{etype.upper()}s: {', '.join(group)}")

        # Notable features from metadata
        features = self.metadata.get("notable_features")
        if features:
            parts.append(f"Features: {', '.join(str(f) for f in features[:4])}")

        return "\n".join(parts)


def build_map_from_data(data: dict) -> GameMap:
    gmap = GameMap(width=data["width"], height=data["height"])
    gmap.metadata = dict(data.get("metadata", {}))
    traversal_grid = data.get("traversal_grid")
    if traversal_grid is None and isinstance(gmap.metadata.get("traversal_grid"), dict):
        traversal_grid = gmap.metadata.get("traversal_grid")
    if isinstance(traversal_grid, dict):
        gmap.traversal_grid = dict(traversal_grid)

    for td in data.get("tiles", []):
        gmap.set_tile(
            td["x"],
            td["y"],
            td["type"],
            td.get("state"),
            td.get("sprite"),
            td.get("variant"),
        )

    for ed in data.get("entities", []):
        entity = MapEntity(
            id=ed["id"],
            name=ed["name"],
            x=ed["x"],
            y=ed["y"],
            entity_type=ed.get("type", "npc"),
            sprite=ed.get("sprite", "default"),
            blocks_movement=bool(ed.get("blocks_movement", True)),
            prop_category=ed.get("prop_category"),
        )
        gmap.place_entity(entity)

    return gmap
