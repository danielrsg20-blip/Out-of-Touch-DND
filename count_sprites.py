#!/usr/bin/env python3
import sys
sys.path.insert(0, 'backend')

from app.map_catalog import _load_terrain_atlas, _build_tile_sprite_palette, _TILE_LABEL_KEYWORDS
import random
import json
from pathlib import Path

# Load the terrain atlas manually to handle BOM
atlas_path = Path("frontend/public/sprites/Environment/Terrain_and_Props.json")
with open(atlas_path, 'r', encoding='utf-8-sig') as f:
    entries = json.load(f)

print(f"Total atlas entries: {len(entries)}")
print(f"Tile keyword categories: {list(_TILE_LABEL_KEYWORDS.keys())}")

# Try a few different environments
environments = ["dungeon", "forest", "cave", "crypt"]

for env in environments:
    rng = random.Random(12345)
    palette = _build_tile_sprite_palette(env, f"explore the {env}", mock_mode=True, rng=rng)
    
    print(f"\n{env.upper()}:")
    print(f"  Tile types in palette: {list(palette.keys())}")
    total_sprites = 0
    for tile_type, sprite_list in palette.items():
        total_sprites += len(sprite_list)
        sample = sprite_list[:2] if len(sprite_list) <= 2 else sprite_list[:2]
        print(f"    {tile_type}: {len(sprite_list)} sprites - {sample}")
    
    print(f"  Total unique sprites in palette: {total_sprites}")
