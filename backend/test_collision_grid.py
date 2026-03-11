#!/usr/bin/env python3
"""
Debug script to test collision grid functionality.
"""
import sys
sys.path.insert(0, ".")

from app.map_engine import GameMap, TILE_PROPERTIES
from app.movement.collision_grid import CollisionGrid
from app.map_catalog import build_automated_map

# Test 1: Create a simple test map
print("=" * 60)
print("Test 1: Creating test map...")
print("=" * 60)

# Create a 10x10 map
gmap = GameMap(width=10, height=10)

# Create border walls
for x in range(10):
    gmap.set_tile(x, 0, "wall")  # Top border
    gmap.set_tile(x, 9, "wall")  # Bottom border

for y in range(10):
    gmap.set_tile(0, y, "wall")  # Left border
    gmap.set_tile(9, y, "wall")  # Right border

# Add some interior tiles
for x in range(1, 9):
    for y in range(1, 9):
        gmap.set_tile(x, y, "floor")

# Add a wall at (3, 3)
gmap.set_tile(3, 3, "wall")

# Add a pit at (5, 5)
gmap.set_tile(5, 5, "pit")

# Add rubble at (7, 7)
gmap.set_tile(7, 7, "rubble")

print(f"Created map: {gmap.width}x{gmap.height}")
print(f"Total tiles: {len(gmap.tiles)}")

# Test 2: Check tile properties
print("\n" + "=" * 60)
print("Test 2: Checking tile properties...")
print("=" * 60)

test_coords = [(0, 0), (3, 3), (5, 5), (7, 7), (2, 2)]
for x, y in test_coords:
    tile = gmap.get_tile(x, y)
    if tile:
        print(f"Tile at ({x}, {y}): type={tile.tile_type}, blocks_movement={tile.blocks_movement}")
    else:
        print(f"Tile at ({x}, {y}): NOT FOUND")

# Test 3: Test collision grid build
print("\n" + "=" * 60)
print("Test 3: Building collision grid...")
print("=" * 60)

grid = CollisionGrid(gmap.width, gmap.height)
grid.build_from_map(gmap)

print(f"Collision grid: {grid.width}x{grid.height}")
print(f"Grid version: {grid.version}")

# Test 4: Check walkability
print("\n" + "=" * 60)
print("Test 4: Checking walkability in collision grid...")
print("=" * 60)

for x, y in test_coords:
    walkable = grid.is_walkable(x, y)
    tile = gmap.get_tile(x, y)
    tile_type = tile.tile_type if tile else "MISSING"
    blocks = tile.blocks_movement if tile else "N/A"
    print(f"({x}, {y}): type={tile_type}, blocks_movement={blocks}, walkable_in_grid={walkable}")

# Test 5: Compare GameMap.is_walkable vs CollisionGrid.is_walkable
print("\n" + "=" * 60)
print("Test 5: Comparing GameMap.is_walkable vs CollisionGrid.is_walkable...")
print("=" * 60)

for x, y in test_coords:
    gmap_walkable = gmap.is_walkable(x, y)
    grid_walkable = grid.is_walkable(x, y)
    match = "✓" if gmap_walkable == grid_walkable else "✗ MISMATCH"
    print(f"({x}, {y}): gmap={gmap_walkable}, grid={grid_walkable} {match}")

# Test 6: Check blocking types
print("\n" + "=" * 60)
print("Test 6: Tile type properties...")
print("=" * 60)

for tile_type, props in TILE_PROPERTIES.items():
    blocks = props.get("blocks_movement", False)
    print(f"{tile_type:15} blocks_movement={blocks}")

print("\n" + "=" * 60)
print("All tests completed!")
print("=" * 60)
