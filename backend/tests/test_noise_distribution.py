import sys
import unittest

sys.path.insert(0, ".")

from app.procedural_noise import eval_noise_at
from app.seeded_random import select_variant


class NoiseDistributionTests(unittest.TestCase):
    def test_noise_output_stays_in_unit_interval(self) -> None:
        seed = 20260310
        values = [eval_noise_at(x, y, seed) for x in range(0, 30) for y in range(0, 20)]
        self.assertTrue(all(0.0 <= v <= 1.0 for v in values))

    def test_high_noise_biases_worn_variants(self) -> None:
        seed = 90909
        high_positions = []
        low_positions = []

        for x in range(0, 60):
            for y in range(0, 40):
                v = eval_noise_at(x, y, seed)
                if v > 0.65:
                    high_positions.append((x, y))
                elif v < 0.35:
                    low_positions.append((x, y))

        # Ensure meaningful sample sizes.
        self.assertGreater(len(high_positions), 50)
        self.assertGreater(len(low_positions), 50)

        worn_ids = {"cracked", "rubble", "worn", "rotted", "murky", "algae"}
        # Base tiles are emitted as "default" by select_variant when dominant base is selected.
        clean_ids = {"default", "clean", "smooth", "boards", "earthy", "calm"}

        high_worn = 0
        high_clean = 0
        for x, y in high_positions[:500]:
            variant_id, _ = select_variant("stone_floor", x, y, base_seed=seed)
            if variant_id in worn_ids:
                high_worn += 1
            if variant_id in clean_ids:
                high_clean += 1

        low_worn = 0
        low_clean = 0
        for x, y in low_positions[:500]:
            variant_id, _ = select_variant("stone_floor", x, y, base_seed=seed)
            if variant_id in worn_ids:
                low_worn += 1
            if variant_id in clean_ids:
                low_clean += 1

        # Expect more worn variants in high-noise areas than low-noise areas.
        self.assertGreater(high_worn, low_worn)

        # Clean variants should be relatively more common in low-noise areas.
        # Use ratio instead of absolute counts since bucket sizes can differ.
        high_ratio = high_clean / max(1, high_worn)
        low_ratio = low_clean / max(1, low_worn)
        self.assertGreater(low_ratio, high_ratio)


if __name__ == "__main__":
    unittest.main()
