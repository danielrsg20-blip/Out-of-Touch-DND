"""Map engine: grid state, entity placement, fog of war calculations."""

from __future__ import annotations

import math
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
