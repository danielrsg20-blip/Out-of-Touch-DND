"""Validate AoE resolution: Fireball sphere, cone, line shapes."""

from types import SimpleNamespace

from app.rules.aoe import FEET_PER_TILE, resolve_aoe


def _ent(eid: str, x: int, y: int, name: str = ""):
    return SimpleNamespace(id=eid, x=x, y=y, name=name or eid)


def _make_entities(*specs):
    """specs: list of (id, x, y) or (id, x, y, name)."""
    out = {}
    for s in specs:
        eid, x, y = s[0], s[1], s[2]
        name = s[3] if len(s) > 3 else eid
        out[eid] = _ent(eid, x, y, name)
    return out


# ── Sphere / Fireball ────────────────────────────────────────────────

def test_fireball_hits_nearby():
    """Fireball (20ft radius sphere) at (5,5) should hit entity at (3,5)."""
    entities = _make_entities(
        ("goblin1", 3, 5, "Goblin"),
        ("goblin2", 5, 7, "Goblin 2"),
    )
    hit = resolve_aoe(5, 5, "sphere", 20, entities)
    hit_ids = {h["id"] for h in hit}
    # Distance (3,5)->(5,5) = 2 tiles = 10 ft < 20 ft radius
    assert "goblin1" in hit_ids
    # Distance (5,7)->(5,5) = 2 tiles = 10 ft < 20 ft radius
    assert "goblin2" in hit_ids


def test_fireball_misses_distant():
    """Fireball (20ft radius) at (5,5) should miss entity at (10,10)."""
    entities = _make_entities(("far", 10, 10, "Far Away"))
    hit = resolve_aoe(5, 5, "sphere", 20, entities)
    hit_ids = {h["id"] for h in hit}
    # Distance = sqrt(25+25) ≈ 7.07 tiles = 35.35 ft > 20 ft
    assert "far" not in hit_ids


def test_fireball_excludes_caster():
    entities = _make_entities(
        ("caster", 5, 5, "Wizard"),
        ("enemy", 6, 5, "Goblin"),
    )
    hit = resolve_aoe(5, 5, "sphere", 20, entities, exclude_ids=["caster"])
    hit_ids = {h["id"] for h in hit}
    assert "caster" not in hit_ids
    assert "enemy" in hit_ids


def test_sphere_boundary():
    """Entity exactly at radius boundary (4 tiles = 20 ft for 20ft sphere)."""
    entities = _make_entities(("edge", 9, 5))
    hit = resolve_aoe(5, 5, "sphere", 20, entities)
    hit_ids = {h["id"] for h in hit}
    # 4 tiles = 20 ft, radius = 20 ft → should be included (≤)
    assert "edge" in hit_ids


# ── Cube ──────────────────────────────────────────────────────────────

def test_cube_hits_inside():
    entities = _make_entities(("a", 6, 6), ("b", 4, 4))
    hit = resolve_aoe(5, 5, "cube", 10, entities)
    hit_ids = {h["id"] for h in hit}
    assert "a" in hit_ids
    assert "b" in hit_ids


def test_cube_misses_outside():
    entities = _make_entities(("far", 15, 15))
    hit = resolve_aoe(5, 5, "cube", 10, entities)
    assert len(hit) == 0


# ── Cone ──────────────────────────────────────────────────────────────

def test_cone_hits_ahead():
    """Cone aimed (0,1) = south, should hit entity directly south."""
    entities = _make_entities(("south", 5, 8))
    hit = resolve_aoe(5, 5, "cone", 15, entities, direction_x=0, direction_y=1)
    hit_ids = {h["id"] for h in hit}
    assert "south" in hit_ids


def test_cone_misses_behind():
    """Cone aimed south should miss entity to the north."""
    entities = _make_entities(("north", 5, 2))
    hit = resolve_aoe(5, 5, "cone", 15, entities, direction_x=0, direction_y=1)
    hit_ids = {h["id"] for h in hit}
    assert "north" not in hit_ids


# ── Line ──────────────────────────────────────────────────────────────

def test_line_hits_along_path():
    """Line aimed (1,0) = east should hit entity directly east within range."""
    entities = _make_entities(("east", 8, 5))
    hit = resolve_aoe(5, 5, "line", 30, entities, direction_x=1, direction_y=0)
    hit_ids = {h["id"] for h in hit}
    assert "east" in hit_ids


def test_line_misses_perpendicular():
    """Line aimed east should miss entity far to the north."""
    entities = _make_entities(("north", 5, 0))
    hit = resolve_aoe(5, 5, "line", 30, entities, direction_x=1, direction_y=0)
    hit_ids = {h["id"] for h in hit}
    assert "north" not in hit_ids
