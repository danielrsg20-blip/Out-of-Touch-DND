import sys
import unittest

sys.path.insert(0, ".")

from app.map_catalog import build_automated_map
from app.map_catalog import MapSelectionRequest
from app.seeded_random import select_variant


class SeededDeterminismTests(unittest.TestCase):
    def test_select_variant_is_deterministic_for_same_seed_and_position(self) -> None:
        first = select_variant("stone_floor", 7, 3, base_seed=12345)
        second = select_variant("stone_floor", 7, 3, base_seed=12345)
        self.assertEqual(first, second)

    def test_generate_map_seed_is_deterministic(self) -> None:
        req: MapSelectionRequest = {
            "description": "An ancient dungeon hall with broken columns",
            "environment": "dungeon",
            "terrain_theme": "ancient",
            "encounter_type": "exploration",
            "encounter_scale": "medium",
            "width": 20,
            "height": 15,
            "seed": 424242,
        }
        a = build_automated_map(req)
        b = build_automated_map(req)

        self.assertEqual(len(a["tiles"]), len(b["tiles"]))
        same_tiles = all(
            ta.get("sprite") == tb.get("sprite") and ta.get("variant") == tb.get("variant")
            for ta, tb in zip(a["tiles"], b["tiles"])
        )
        self.assertTrue(same_tiles)

    def test_generate_map_differs_for_different_seeds(self) -> None:
        base: MapSelectionRequest = {
            "description": "A ruined crypt with moss and rubble",
            "environment": "dungeon",
            "terrain_theme": "ruined",
            "encounter_type": "exploration",
            "encounter_scale": "small",
            "width": 20,
            "height": 15,
        }
        a = build_automated_map({**base, "seed": 111})
        b = build_automated_map({**base, "seed": 222})

        # Not guaranteed to differ at every tile, but should differ overall.
        differences = sum(
            1
            for ta, tb in zip(a["tiles"], b["tiles"])
            if ta.get("sprite") != tb.get("sprite") or ta.get("variant") != tb.get("variant")
        )
        self.assertGreater(differences, 0)


if __name__ == "__main__":
    unittest.main()
