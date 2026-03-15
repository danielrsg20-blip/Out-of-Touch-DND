# D&D Vector Map Generator

A browser-based vector map generator for Dungeons & Dragons campaigns. Generates fully editable SVG maps for dungeons, outdoor locations, and everything in between — no server required.

## Quick Start

Open `index.html` in any modern browser. No build step, no dependencies, no install.

```
dnd-map-generator/
└── index.html          ← Open this
```

---

## Features

### Map Types
| Type | Style | Description |
|---|---|---|
| Dungeon | Stone / cartographic | BSP room placement, MST corridors, loop corridors |
| Cavern | Organic / stone | Irregular circular rooms, water pools |
| Tavern / Inn | Stone interior | Common room, kitchen, bar, storage |
| Temple | Warm stone | Nave, apse, vestry, side aisles |
| Wizard Tower | Purple stone | 4 circular floors stacked vertically |
| Crypt | Dark stone | Central burial chamber with side alcoves |
| Mine | Warm brown | Central shaft with branching tunnels |
| Sewer | Green stone | Irregular rooms with water channels |
| Village Block | Outdoor / grass | Buildings on a forest clearing with roads |
| Forest Campsite | Outdoor / grass | Clearing with tents, fire, cave, logs, ferns |

### Drawing Tools
| Key | Tool |
|---|---|
| `V` | Select / move / resize |
| `R` | Draw rectangular room |
| `C` | Draw circular room |
| `L` | Draw corridor |
| `W` | Draw wall line |
| `D` | Place door |
| `S` | Place stairs |
| `T` | Place label |
| `E` | Erase entity |
| `F` | Fit view |
| `+` / `-` | Zoom in / out |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Del` | Delete selected |

**Pan:** Alt + drag, or middle mouse button.  
**Zoom:** Scroll wheel.  
**Edit label:** Double-click any room or label.

---

## Rendering Principles

### Dungeon Maps (cartographic guide)
- **Background = walls.** The canvas fill color is wall stone. Rooms are *cut out* of it by painting floor-colored shapes on top.
- **Two-shape room technique.** Every room is two concentric shapes — outer in wall-brown, inner in floor sage-green. The gap between them is the visible wall.
- **Corridors are floor rectangles** with thick wall-colored strokes on their long edges only.
- **Grid lines** are dashed, clipped inside each floor shape, never drawn over walls.
- **Serif italic labels** for authentic cartographic feel.
- **Compass rose** uses polygon arrows (N/E bright, S/W shaded for dimension).
- **Title banner** is a semi-transparent dark rect with gold italic text.

### Outdoor Maps (forest guide)
- **Layered painter order:** grass base → grid → stone path → forest masses → inner bush ring → clearing → ferns/logs/cave → labels.
- **Grass blade texture** tiled at 40px intervals.
- **Stone path drawn 3 times** at decreasing widths: shadow, base color, dashed slab texture.
- **Tree clusters** = 4–6 offset circles in 3 shades (shadow/mid/highlight) + trunk dot.
- **Inner bush ring** follows the clearing ellipse for a dense tree wall effect.
- **Clearing** uses layered ellipses: dirt base, variation patches, stain patches, soft stroked border.
- **Ferns** = 5 radiating lines from a single base point.
- **Fallen logs** drawn twice (dark body + lighter highlight) with end cross-section circles.
- **Cave entrance** = near-black fill ellipse + soft shadow stroke ellipse.

---

## Export

### SVG
Click **⬇ SVG** to export a standalone vector file. All dungeon entities export as proper SVG primitives (rects, circles, polygons, lines). Outdoor entities use SVG patterns for grass texture, layered paths for roads, and circle groups for tree clusters.

### JSON
Click **⬇ JSON** to export the full scene graph. Format:

```json
{
  "version": "2.0",
  "seed": 12345678,
  "title": "Dungeon of Vaelthar",
  "palette": { "dungeon": {...}, "outdoor": {...} },
  "grid": { "type": "square", "size": 32 },
  "entities": [...]
}
```

Entity types: `bg`, `room-r`, `room-c`, `corr`, `wall`, `door`, `stairs`, `feature`, `label`, `water`, `outdoor`, `opath`, `clearing`, `trees`, `fern`, `log`, `cave`, `looseStone`.

---

## Project Structure

```
dnd-map-generator/
├── index.html                    Entry point + HTML layout
├── assets/
│   └── style.css                 All UI styles
└── src/
    ├── palette.js                Color constants (P = dungeon, F = outdoor)
    ├── scene.js                  Data model + entity factories
    ├── export.js                 SVG + JSON export
    ├── main.js                   App entry point + initialization
    ├── render/
    │   ├── grid.js               Grid line drawing (dungeon)
    │   ├── dungeon.js            All dungeon draw functions
    │   ├── outdoor.js            All outdoor draw functions + compass/banner
    │   └── renderer.js           Main render loop, canvas, minimap, view
    ├── generators/
    │   ├── shared.js             RNG, overlap check, connectivity, tree builder
    │   ├── dungeon.js            Dungeon/indoor generators + dispatcher
    │   └── outdoor.js            Outdoor generators (village, campsite)
    └── tools/
        ├── history.js            Undo/redo stack
        ├── input.js              Mouse + keyboard handlers
        └── ui.js                 Panels, swatches, templates, validation
```

---

## Seeded Generation

Every generated map has a numeric seed shown in the **Seed** field. Re-entering the same seed (or any text string, which is hashed) reproduces the exact same map. Share seeds with players or collaborators.

---

## Color Palettes

### Dungeon Palette
| Role | Hex |
|---|---|
| Background / wall stone | `#6b6b7a` |
| Wall ring (warm brown) | `#7a6a52` |
| Floor (pale sage green) | `#c8d4b0` |
| Grid lines | `#aab898` |
| Water | `#6aabcc` |
| Wood (doors, barrels) | `#9a7a50` |
| Gold (flames, locks) | `#d4b860` |

### Outdoor Palette (6-stop green ramp)
| Role | Hex |
|---|---|
| Deep shadow canopy | `#2a5a20` |
| Mid canopy | `#3a6a28` |
| Light canopy | `#4a7a30` |
| Highlight canopy | `#5a8a38` |
| Bright highlight | `#6a9a40` |
| Base grass | `#5a8a40` |
| Dirt / clearing | `#8a7050` |
| Stone path | `#5a5248` |

---

## License

MIT — use freely in personal and commercial projects.
