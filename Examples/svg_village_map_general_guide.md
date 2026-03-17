# The Complete Guide to Generating SVG Village Maps

A comprehensive technical reference for generating top-down RPG village
and town maps in pure SVG vector graphics — the classic earth-tone
top-down battlemap style used in tabletop roleplaying games.

---

## Part 1: Foundational Philosophy

### The Core Concept: Texture as Identity

Unlike dungeon maps (which use a dark void as walls), village maps work
on the opposite principle: **the entire canvas is visible terrain**. There
is no void. Every pixel is either grass, dirt road, or a building footprint.
The challenge is not punching rooms out of darkness — it is layering organic
textures on top of each other convincingly.

The three foundational layers are:

1. **Grass** — the default surface covering everything
2. **Dirt roads** — cut organically through the grass
3. **Buildings** — solid structures sitting on the terrain

Everything else — trees, fences, wells, barrels — is detail layered on top.

### The Earth-Tone Palette Philosophy

Village maps live and die by their colour palette. The authentic look comes
from a tightly controlled range of warm earth tones:

| Layer | Colour Range | Notes |
|---|---|---|
| Grass base | `#728448` – `#7A9A50` | Olive-green, never bright |
| Grass blades | `#607038` – `#617040` | Darker olive for texture |
| Dirt road | `#B89A68` – `#C4AA78` | Warm sandy tan |
| Road shadow | `#A89058` | Edge darkening |
| Building wall | `#C8C0B0` / `#D0B880` | Cool gray or warm cream |
| Orange roof | `#9A5A28` – `#B06030` | Terracotta tile |
| Slate roof | `#4A4858` – `#585668` | Blue-gray slate |
| Thatch roof | `#6A5020` – `#8A7040` | Warm straw brown |
| Door | `#8A5020` | Dark wood |
| Chimney | `#8A7050` | Stone gray-brown |
| Fence | `#8A6830` | Weathered wood |
| Deep canopy | `#2A5218` | Near-black green |
| Mid canopy | `#345E20` – `#3A6424` | Forest green |
| Light canopy | `#4A7430` – `#507A34` | Medium green |
| Highlight canopy | `#5E8A3C` – `#74A048` | Bright highlight |
| Well stone | `#8A7858` | Warm gray |
| Well water | `#3A5868` | Dark teal |
| Barrel | `#507888` – `#5F8898` | Blue-gray water barrel |
| Title gold | `#D4A840` | Map title text |
| Title background | `#1A1008` | Near-black warm |

Keep colours desaturated and warm throughout. Bright or cool colours
will instantly break the hand-crafted map aesthetic.

---

## Part 2: Setting Up Patterns and Definitions

All repeating textures live inside a `<defs>` block at the top of the SVG.
Define these before drawing anything else.

### Grass Pattern

A small repeating tile with an olive base, a few short angled grass blade
`<line>` elements, and faint dot variations:

```svg
<pattern id="grass" width="18" height="18" patternUnits="userSpaceOnUse">
  <rect width="18" height="18" fill="#7A8A4E"/>
  <!-- Slight tonal variation overlay -->
  <rect x="0" y="0" width="18" height="18" fill="#728448" opacity="0.4"/>
  <!-- Grass blades -->
  <line x1="3"  y1="16" x2="4"  y2="12" stroke="#607038" stroke-width="0.5" opacity="0.5"/>
  <line x1="10" y1="14" x2="11" y2="10" stroke="#607038" stroke-width="0.5" opacity="0.4"/>
  <line x1="15" y1="17" x2="16" y2="13" stroke="#607038" stroke-width="0.5" opacity="0.4"/>
  <!-- Ground dots -->
  <circle cx="7"  cy="8" r="0.6" fill="#617040" opacity="0.3"/>
  <circle cx="14" cy="5" r="0.5" fill="#617040" opacity="0.3"/>
</pattern>
```

Key settings:
- `patternUnits="userSpaceOnUse"` — pattern coordinates are absolute,
  ensuring the grass aligns consistently across the canvas
- Tile size 16–20px — small enough to feel textured, large enough to not
  be a noisy mess at normal viewing scale
- Keep blade strokes very faint (0.4–0.5 opacity) — they read as texture,
  not illustration

### Dirt Road Pattern

A warm tan base with scattered dark circles simulating loose soil
and pebbles:

```svg
<pattern id="dirt" width="16" height="16" patternUnits="userSpaceOnUse">
  <rect width="16" height="16" fill="#C4AA78"/>
  <circle cx="3"  cy="4"  r="1.2" fill="#B89A68" opacity="0.4"/>
  <circle cx="11" cy="10" r="1.0" fill="#B89A68" opacity="0.35"/>
  <circle cx="7"  cy="13" r="0.8" fill="#CAB080" opacity="0.3"/>
  <circle cx="14" cy="3"  r="0.9" fill="#B89A68" opacity="0.3"/>
  <circle cx="1"  cy="12" r="1.0" fill="#CAB080" opacity="0.25"/>
</pattern>
```

### Roof Tile Patterns (Three Variants)

Staggered offset rectangles simulate roof tiles. The second row starts
at half the tile width so joints alternate — exactly like real roofing.
Define all three variants you need:

**Orange/Terracotta (inns, taverns, important buildings):**
```svg
<pattern id="roof-warm" width="10" height="7" patternUnits="userSpaceOnUse">
  <rect width="10" height="7" fill="#9A5A28"/>
  <rect x="0.5" y="0.5" width="8" height="2.5" rx="0.3"
        fill="#B06030" stroke="#7A3A10" stroke-width="0.3"/>
  <rect x="5.5" y="3.5" width="8"  height="2.5" rx="0.3"
        fill="#A05820" stroke="#7A3A10" stroke-width="0.3"/>
  <rect x="-4.5" y="3.5" width="8" height="2.5" rx="0.3"
        fill="#A05820" stroke="#7A3A10" stroke-width="0.3"/>
</pattern>
```

**Slate/Gray (residential, storage buildings):**
```svg
<pattern id="roof-slate" width="10" height="7" patternUnits="userSpaceOnUse">
  <rect width="10" height="7" fill="#4A4858"/>
  <rect x="0.5" y="0.5" width="8"  height="2.5" rx="0.3"
        fill="#585668" stroke="#2A2838" stroke-width="0.3"/>
  <rect x="5.5" y="3.5" width="8"  height="2.5" rx="0.3"
        fill="#504E60" stroke="#2A2838" stroke-width="0.3"/>
  <rect x="-4.5" y="3.5" width="8" height="2.5" rx="0.3"
        fill="#504E60" stroke="#2A2838" stroke-width="0.3"/>
</pattern>
```

**Thatch (cottages, poor buildings, barns):**
```svg
<pattern id="roof-thatch" width="8" height="6" patternUnits="userSpaceOnUse">
  <rect width="8" height="6" fill="#8A7040"/>
  <line x1="0" y1="2"   x2="8" y2="2"   stroke="#7A6030" stroke-width="0.6" opacity="0.7"/>
  <line x1="0" y1="4.5" x2="8" y2="4.5" stroke="#6A5020" stroke-width="0.5" opacity="0.6"/>
  <line x1="2" y1="0"   x2="2" y2="6"   stroke="#9A8050" stroke-width="0.3" opacity="0.3"/>
  <line x1="5" y1="0"   x2="5" y2="6"   stroke="#9A8050" stroke-width="0.3" opacity="0.3"/>
</pattern>
```

Apply the grass pattern as a full-canvas `<rect>` fill as your very
first drawing operation. Everything else is painted on top.

---

## Part 3: Planning the Village Layout

### The Hub-and-Spoke Road System

The most readable village layout uses roads radiating outward from a
central plaza like the spokes of a wheel. Eight roads is the ideal
number for a medium village:

- North, South, East, West (the four cardinal roads)
- NE, NW, SE, SW (the four diagonal roads)

Each road leads to the canvas edge, implying the village connects to the
wider world in all directions. Buildings cluster in the wedge-shaped
spaces between roads.

### Planning on a Clock Face

Before writing any coordinates, mentally distribute building types
around a clock face centered on the plaza:

| Position | Building Type | Roof Colour |
|---|---|---|
| 12 o'clock | Large inn or town hall | Orange/warm |
| 10–11 o'clock | Two residential houses | Gray/slate |
| 8–9 o'clock | Cottage + large house | Mix |
| 6–7 o'clock | Workshop cluster | Orange |
| 4–5 o'clock | Large merchant building + storage | Mix |
| 2–3 o'clock | Large inn + smaller house | Orange + gray |
| 1 o'clock | Guard house or small residence | Gray |

Always alternate roof colours as you move around the circle. Two orange
buildings side by side look like the same building at a glance. The
alternation creates rhythm and helps players identify landmarks.

### Coordinate System

Establish the plaza center first. If the plaza center is at (340, 340):

```
Plaza radius: 85–90px
Road width:   30–34px base stroke
Road shadow:  36px, opacity 0.3 (edge darkening)

North road:   M340,0   → center, curves slightly
South road:   M340,680 → center, curves slightly  
East road:    M680,340 → center, curves slightly
West road:    M0,340   → center, curves slightly
NE road:      M680,80  → center, diagonal
NW road:      M0,80    → center, diagonal
SE road:      M680,600 → center, diagonal
SW road:      M0,600   → center, diagonal
```

All roads are quadratic bezier paths (`Q` command) with a slight curve
— dead straight roads look unnatural. The curve control point should
shift the road 10–20px to one side of a straight line.

---

## Part 4: Drawing Roads

### The Three-Pass Road Technique

Every road is the same bezier path drawn three times:

```svg
<!-- Pass 1: Shadow/edge — widest, darkest, semi-transparent -->
<path d="M340,250 Q330,200 310,0" fill="none"
      stroke="#A89058" stroke-width="36"
      stroke-linecap="round" opacity="0.3"/>

<!-- Pass 2: Base surface — slightly narrower, full opacity -->
<path d="M340,250 Q330,200 310,0" fill="none"
      stroke="#C4AA78" stroke-width="32"
      stroke-linecap="round"/>

<!-- Pass 3: Texture overlay — narrower still, pattern fill -->
<path d="M340,250 Q330,200 310,0" fill="none"
      stroke="url(#dirt)" stroke-width="28"
      stroke-linecap="round" opacity="0.6"/>
```

The three passes create:
- A soft shadow/darkened edge from the widest pass
- The road colour from the mid pass
- Soil/pebble texture from the pattern pass

`stroke-linecap="round"` is mandatory — it tapers road ends naturally
and makes the dirt texture wrap cleanly.

### Road Depth Trick

After all roads are drawn, add a very subtle ground variation to the
grass areas between roads. Large semi-transparent ellipses in a slightly
darker green at 0.1–0.15 opacity break up the uniform grass and make
the terrain feel like it has gentle slopes or shade variations:

```svg
<ellipse cx="200" cy="180" rx="140" ry="100" fill="#728048" opacity="0.15"/>
<ellipse cx="480" cy="420" rx="160" ry="120" fill="#728048" opacity="0.12"/>
```

---

## Part 5: The Central Plaza

The plaza is the visual anchor of the whole map. It reads as the town
square — a cleared dirt area where roads converge.

### Construction

Four elements create the plaza:

```svg
<!-- 1. Base dirt fill -->
<circle cx="340" cy="340" r="88" fill="#C0A870" opacity="0.92"/>

<!-- 2. Dirt texture overlay -->
<circle cx="340" cy="340" r="88" fill="url(#dirt)" opacity="0.7"/>

<!-- 3. Outer soft edge -->
<circle cx="340" cy="340" r="90" fill="none"
        stroke="#A89058" stroke-width="5" opacity="0.45"/>

<!-- 4. Inner subtle border -->
<circle cx="340" cy="340" r="84" fill="none"
        stroke="#B8A068" stroke-width="2" opacity="0.35"/>
```

The two `fill="none"` stroke circles with low opacity create a soft,
blurred edge between the plaza dirt and the surrounding grass — never
a hard line.

### Plaza Size

The plaza radius should be large enough that all eight roads can
comfortably connect to its edge without overlapping, but not so large
it dominates the map. For a standard village: 80–95px radius.

---

## Part 6: The Central Village Tree

The central tree is the most iconic element of the village map.
It sits in or near the plaza and uses the multi-circle canopy technique.

### Construction: Nine Layers from Shadow to Highlight

```svg
<!-- Shadow beneath the tree (slightly offset) -->
<ellipse cx="344" cy="348" rx="50" ry="36"
         fill="#2A3018" opacity="0.22"/>

<!-- Layer 1–2: Deep shadow canopy (largest, darkest) -->
<circle cx="340" cy="334" r="52" fill="#2A5218"/>
<circle cx="320" cy="324" r="34" fill="#345E20"/>
<circle cx="358" cy="320" r="32" fill="#305A1C"/>

<!-- Layer 3–5: Main canopy body -->
<circle cx="334" cy="346" r="30" fill="#3A6424"/>
<circle cx="354" cy="342" r="28" fill="#345E20"/>
<circle cx="340" cy="316" r="22" fill="#3A6424"/>

<!-- Layer 6–7: Mid highlights -->
<circle cx="326" cy="330" r="18" fill="#3E6828"/>
<circle cx="355" cy="328" r="16" fill="#3E6828"/>

<!-- Layer 8: Upper highlights -->
<circle cx="328" cy="318" r="14" fill="#4A7430"/>
<circle cx="350" cy="314" r="12" fill="#507A34"/>
<circle cx="340" cy="326" r="10" fill="#4A7430"/>

<!-- Layer 9: Top sunlit highlights (smallest, brightest) -->
<circle cx="332" cy="313" r="8"  fill="#5E8A3C"/>
<circle cx="348" cy="310" r="7"  fill="#689440"/>
<circle cx="340" cy="308" r="6"  fill="#74A048"/>

<!-- Trunk (visible below canopy) -->
<rect x="336" y="348" width="8" height="12" rx="2"
      fill="#4A2E10" stroke="#2A1A08" stroke-width="0.8"/>
```

### Key Rules for the Tree

- **Never stack circles concentrically** — offset every circle
  irregularly so the canopy looks organic, not like a bullseye
- **Shadow first** — the ground shadow ellipse goes below all
  canopy circles, slightly offset down-right
- **Nine shades minimum** — fewer shades makes the canopy look flat
- **Trunk must be visible** — a visible trunk base is what separates
  a "tree" from a "green blob"
- **Scale to context** — central feature tree: r=50–55 for base circle.
  Scattered small trees: r=12–19 for base circle

---

## Part 7: Buildings

Every building follows an identical six-step construction sequence.
Never skip a step — each one contributes something the others cannot.

### The Six-Step Building Stack

**Step 1 — Drop Shadow**

A copy of the wall rectangle, filled near-black at 0.2–0.28 opacity,
offset 4–5px right and down using `transform="translate(4,4)"` or
`transform="translate(5,5)"` for larger buildings:

```svg
<rect x="272" y="44" width="102" height="74" rx="3"
      fill="#1A1008" opacity="0.28" transform="translate(5,5)"/>
```

The shadow is what lifts the building off the ground. Without it,
buildings look painted flat onto the terrain.

**Step 2 — Wall Base**

The building footprint rectangle with the appropriate wall colour.
Use `#D0B880` (warm cream) for orange-roof buildings and `#C8C0B0`
(cool gray) for slate-roof buildings. Stroke in the matching darker
shade:

```svg
<!-- Warm building -->
<rect x="272" y="44" width="102" height="74" rx="3"
      fill="#D0B880" stroke="#8A6830" stroke-width="1.5"/>

<!-- Cool building -->
<rect x="272" y="44" width="102" height="74" rx="3"
      fill="#C8C0B0" stroke="#686478" stroke-width="1.5"/>
```

**Step 3 — Roof Area**

A rectangle the same width as the wall but covering the upper 65–75%
of the building height, filled with the chosen tile pattern:

```svg
<rect x="272" y="44" width="102" height="54"
      fill="url(#roof-warm)" opacity="0.95"/>
<rect x="272" y="44" width="102" height="54"
      fill="none" stroke="#7A3A10" stroke-width="1.2"/>
```

The roof rect always starts at the same y as the wall rect — the roof
covers the top portion, leaving the lower portion as visible wall.

**Step 4 — Ridge Line**

A horizontal `<line>` roughly halfway down the roof rect, in the
darker stroke colour at 0.5–0.55 opacity. This implies the roof peak:

```svg
<line x1="272" y1="71" x2="374" y2="71"
      stroke="#7A3A10" stroke-width="1.5" opacity="0.55"/>
```

**Step 5 — Windows**

Small rectangles (9–12px square, rx="1.5") positioned in the roof
zone, filled with the wall colour so they appear as dormer windows.
Two windows, one each side of center:

```svg
<rect x="283" y="53" width="11" height="11" rx="1.5"
      fill="#D0B880" stroke="#7A3A10" stroke-width="0.8"/>
<rect x="352" y="53" width="11" height="11" rx="1.5"
      fill="#D0B880" stroke="#7A3A10" stroke-width="0.8"/>
```

**Step 6 — Door**

A taller rectangle in the wall zone below the roof, filled dark wood
brown. Slightly taller than wide. Centered or offset to suggest
a side entrance:

```svg
<rect x="315" y="84" width="16" height="22" rx="1.5"
      fill="#8A5020" stroke="#5A3010" stroke-width="1"/>
```

### Optional: Chimneys

Small tall rectangles above the roof line (negative y from the roof
top), in a muted gray-brown. Chimneys on large buildings read as
kitchens and hearths — they make the building feel inhabited:

```svg
<rect x="292" y="34" width="9" height="14" rx="1"
      fill="#8A7050" stroke="#5A4830" stroke-width="0.8"/>
```

### Optional: Annexes

A secondary, smaller building rectangle attached to the base of the
main building. Same wall colour, reduced roof height. Breaks up the
boxy silhouette and implies the building has grown over time:

```svg
<rect x="284" y="118" width="108" height="42" rx="2"
      fill="#D0B880" stroke="#8A6830" stroke-width="1.2"/>
<rect x="284" y="118" width="108" height="30"
      fill="url(#roof-warm)" opacity="0.9"/>
<rect x="284" y="118" width="108" height="30"
      fill="none" stroke="#7A3A10" stroke-width="1"/>
```

### Building Size Hierarchy

| Building Type | Footprint | Roof Height |
|---|---|---|
| Large inn / town hall | 90–102×72–78 | 70% of height |
| Medium house | 74–84×60–68 | 68% of height |
| Small cottage | 64–74×52–60 | 72% of height |
| Storage / barn | 80–90×50–58 | 60% of height |
| Annex / lean-to | 56–72×38–42 | 66% of height |

Scale `rx` (corner radius) proportionally: 2–3px for small buildings,
3–4px for large buildings.

---

## Part 8: Scattered Tree Clusters

Small tree clusters between buildings fill visual dead zones and create
a sense of a living, organic village rather than a grid of boxes on grass.

### The Three-Circle Cluster

Every cluster uses the same three-shade technique, scaled down
from the central tree:

```svg
<!-- Dark base (largest) -->
<circle cx="202" cy="52" r="19" fill="#2A5218" opacity="0.92"/>
<!-- Mid body -->
<circle cx="192" cy="44" r="13" fill="#345E20" opacity="0.88"/>
<circle cx="212" cy="46" r="12" fill="#3A6424" opacity="0.85"/>
<!-- Bright highlight (smallest) -->
<circle cx="200" cy="46" r="7"  fill="#507A34" opacity="0.6"/>
```

### Placement Rules

- Place 8–12 clusters across the map
- Position them at road edges, behind buildings, and in corners
- Never place a cluster blocking a road or building entrance
- Vary cluster sizes: some with a 19px base, some with 12px — size
  variation implies near and far trees
- The highlight circle (brightest green) is optional — include it
  on larger clusters, skip it on the smallest ones

---

## Part 9: Village Details

These small props transform a diagram into a believable place.
All are built from basic SVG primitives.

### Well

Outer stone ring (circle), inner water fill (smaller circle),
ripple ellipse (fill none), two vertical posts, crossbeam:

```svg
<!-- Stone ring -->
<circle cx="390" cy="364" r="13"
        fill="#8A7858" stroke="#5A4838" stroke-width="1.5"/>
<!-- Water -->
<circle cx="390" cy="364" r="9"
        fill="#3A5868" stroke="#2A4858" stroke-width="1.2"/>
<!-- Ripple -->
<ellipse cx="390" cy="362" rx="5.5" ry="3.5" fill="none"
         stroke="#2A4858" stroke-width="0.8" opacity="0.7"/>
<!-- Posts and crossbeam -->
<line x1="382" y1="353" x2="382" y2="347" stroke="#7A5838" stroke-width="1.5"/>
<line x1="398" y1="353" x2="398" y2="347" stroke="#7A5838" stroke-width="1.5"/>
<line x1="380" y1="347" x2="400" y2="347" stroke="#7A5838" stroke-width="1.8"/>
```

Place in the plaza, slightly off-center from the central tree.

### Water Barrel

Two stacked ellipses — the lower one darker suggesting the shadow
underside, the upper one lighter for the rim — with two horizontal
hoop lines:

```svg
<!-- Body (lower, darker) -->
<ellipse cx="352" cy="584" rx="13" ry="9"
         fill="#507888" stroke="#305868" stroke-width="1.2"/>
<!-- Rim (upper, lighter) -->
<ellipse cx="352" cy="580" rx="13" ry="9"
         fill="#5F8898" stroke="#305868" stroke-width="1.2"/>
<!-- Hoop lines -->
<line x1="339" y1="580" x2="365" y2="580" stroke="#305868" stroke-width="1"/>
<line x1="339" y1="584" x2="365" y2="584" stroke="#305868" stroke-width="0.8"/>
```

Place near workshops, inns, or smithies.

### Fence Lines

A U-shaped enclosure using three `<line>` elements (two vertical sides,
one horizontal top) plus small `<rect>` post markers:

```svg
<!-- Fence rails -->
<line x1="40" y1="316" x2="40"  y2="368" stroke="#8A6830" stroke-width="2"/>
<line x1="130" y1="316" x2="130" y2="368" stroke="#8A6830" stroke-width="2"/>
<line x1="40" y1="316" x2="130" y2="316" stroke="#8A6830" stroke-width="2"/>
<!-- Posts (every 20–22px along the top rail) -->
<rect x="38"  y="314" width="5" height="9" rx="1" fill="#8A6830"/>
<rect x="62"  y="314" width="5" height="9" rx="1" fill="#8A6830"/>
<rect x="84"  y="314" width="5" height="9" rx="1" fill="#8A6830"/>
<rect x="106" y="314" width="5" height="9" rx="1" fill="#8A6830"/>
<rect x="127" y="314" width="5" height="9" rx="1" fill="#8A6830"/>
```

Place fences between buildings to suggest livestock paddocks or
property boundaries.

### Market Stall / Awning

Two side posts (vertical lines), a horizontal crossbeam, and a
tilted rect for the canopy:

```svg
<!-- Posts -->
<line x1="260" y1="200" x2="260" y2="226" stroke="#8A6830" stroke-width="2"/>
<line x1="300" y1="200" x2="300" y2="226" stroke="#8A6830" stroke-width="2"/>
<!-- Crossbeam -->
<line x1="258" y1="200" x2="302" y2="200" stroke="#8A6830" stroke-width="2"/>
<!-- Canopy -->
<rect x="256" y="192" width="48" height="12" rx="1"
      fill="#C86020" stroke="#8A3010" stroke-width="1" opacity="0.85"/>
```

### Haycart / Wagon

A rect body with two circle wheels:

```svg
<!-- Cart body -->
<rect x="100" y="200" width="32" height="18" rx="2"
      fill="#9A8050" stroke="#6A5030" stroke-width="1.2"/>
<!-- Wheels -->
<circle cx="108" cy="218" r="7" fill="#7A6040" stroke="#5A4020" stroke-width="1.2"/>
<circle cx="108" cy="218" r="3" fill="#9A8050" stroke="#6A5030" stroke-width="0.8"/>
<circle cx="124" cy="218" r="7" fill="#7A6040" stroke="#5A4020" stroke-width="1.2"/>
<circle cx="124" cy="218" r="3" fill="#9A8050" stroke="#6A5030" stroke-width="0.8"/>
```

---

## Part 10: The Complete Layering Order

This is the non-negotiable sequence. Draw elements in exactly this
order or the map will not render correctly:

```
 1. Full-canvas grass rectangle (base texture)
 2. Ground variation ellipses (subtle tonal darkening)
 3. Dirt roads — all eight spokes
    a. Shadow pass (widest, semi-transparent)
    b. Base colour pass
    c. Texture pattern pass
 4. Central plaza (dirt circle)
    a. Base fill
    b. Texture overlay
    c. Outer soft-edge stroke
    d. Inner border stroke
 5. Buildings — all structures
    a. Drop shadow (translate offset)
    b. Wall base rect
    c. Roof pattern rect
    d. Roof outline stroke
    e. Ridge line
    f. Windows
    g. Door
    h. Chimneys (if any)
    i. Annexes (if any)
 6. Central village tree
    a. Ground shadow ellipse
    b. Deep canopy circles (dark)
    c. Mid canopy circles
    d. Highlight circles (bright)
    e. Trunk rect
 7. Scattered tree clusters (same 3-circle technique, smaller scale)
 8. Village details
    a. Well
    b. Barrels
    c. Fences
    d. Market stalls
    e. Wagons / carts
 9. Title banner
```

---

## Part 11: The Title Banner

A semi-transparent dark rectangle with a gold serif title, placed
at the bottom-left or bottom-right corner:

```svg
<rect x="8" y="652" width="210" height="22" rx="3"
      fill="#1A1008" opacity="0.78"/>
<text font-family="serif" font-size="11" fill="#D4A840"
      font-weight="bold" x="16" y="667">
  Village of Thornhaven
</text>
```

Font choice matters: `font-family="serif"` reads as hand-lettered
cartographic text. Never use sans-serif on a village map. The gold
colour (`#D4A840`) catches the eye without being harsh.

---

## Part 12: Advanced Techniques

### Organic Road Intersections

Where two roads cross or meet, add an extra circular dirt patch to
soften the junction. A slightly larger-radius dirt circle at the
intersection point, drawn after all roads, blends the crossing
into a natural-feeling crossroads:

```svg
<circle cx="340" cy="340" r="52" fill="#C0A870" opacity="0.5"/>
```

### Pond or Small Lake

An irregular filled shape in a blue-gray tone, with wavy stroke
lines for ripples:

```svg
<!-- Pond body -->
<ellipse cx="500" cy="200" rx="45" ry="32"
         fill="#5A7888" stroke="#3A5868" stroke-width="1.5"
         opacity="0.82"/>
<!-- Shore darkening -->
<ellipse cx="500" cy="200" rx="45" ry="32" fill="none"
         stroke="#3A5868" stroke-width="4" opacity="0.3"/>
<!-- Ripple lines -->
<ellipse cx="500" cy="200" rx="28" ry="18" fill="none"
         stroke="#4A6878" stroke-width="0.8" opacity="0.5"/>
<ellipse cx="500" cy="200" rx="14" ry="9"  fill="none"
         stroke="#4A6878" stroke-width="0.6" opacity="0.4"/>
```

### Ruined Building

A building with broken walls is drawn as a standard building but
with gap sections in the roof rect. Use small dark triangles or
irregular polygons along the roof edges to suggest collapsed sections:

```svg
<!-- Normal building base -->
<rect x="100" y="100" width="80" height="60" rx="3"
      fill="#C8C0B0" stroke="#686478" stroke-width="1.2"/>
<!-- Partial roof (only covers 60% of building) -->
<rect x="100" y="100" width="50" height="42"
      fill="url(#roof-slate)" opacity="0.7"/>
<!-- Rubble pile where roof is missing -->
<ellipse cx="162" cy="122" rx="18" ry="11"
         fill="#8A8070" stroke="#5A5048" stroke-width="0.8" opacity="0.7"/>
<ellipse cx="162" cy="122" rx="10" ry="6"
         fill="#7A7060" stroke="#5A5048" stroke-width="0.6" opacity="0.6"/>
```

### Hedge Rows

Long thin rounded rectangles in dark green, slightly lighter than
tree canopy, used to mark property boundaries or garden walls:

```svg
<rect x="140" y="200" width="60" height="12" rx="6"
      fill="#2A5018" stroke="#1A3810" stroke-width="0.8"/>
<!-- Texture bumps on hedge -->
<circle cx="152" cy="206" r="5" fill="#345E20" opacity="0.8"/>
<circle cx="165" cy="204" r="6" fill="#345E20" opacity="0.8"/>
<circle cx="178" cy="206" r="5" fill="#345E20" opacity="0.8"/>
<circle cx="190" cy="204" r="5" fill="#3A6424" opacity="0.8"/>
```

### Dirt Path (Narrow)

A secondary path between buildings, narrower than a main road,
suggesting a foot-worn track:

```svg
<!-- Narrow dirt track — 10–14px wide instead of 30px -->
<path d="M160,300 Q180,320 200,340" fill="none"
      stroke="#C4AA78" stroke-width="12" stroke-linecap="round"/>
<path d="M160,300 Q180,320 200,340" fill="none"
      stroke="url(#dirt)" stroke-width="10"
      stroke-linecap="round" opacity="0.6"/>
```

---

## Part 13: Summary of Core Principles

1. **The canvas is always fully visible terrain.** No dark void.
   Grass is the universal base; everything else sits on top of it.

2. **Roads are one curve drawn three times.** Shadow pass,
   base colour pass, texture pass. Always `stroke-linecap="round"`.

3. **The plaza is stacked circles.** Base fill, texture overlay,
   two soft-edge stroke rings. Never a hard edge.

4. **Every building is a six-step stack.** Shadow → wall → roof →
   ridge → windows → door. Skip any step and something will look wrong.

5. **Two roof colours create visual hierarchy.** Orange/warm for
   important or public buildings. Gray/slate for residential.
   Thatch for the poorest structures. Never use all three on adjacent
   buildings.

6. **The central tree uses nine or more circle layers.** From deep
   shadow at the base to bright highlight at the crown. Offset every
   circle irregularly — never concentric.

7. **Scattered tree clusters use three circles and three shades.**
   Dark base, mid body, bright highlight. The same technique at any
   scale from a bush (r=6) to a forest mass (r=40).

8. **Details are all basic primitives.** Wells, barrels, fences,
   wagons — everything is circles, rectangles, ellipses, and lines.
   If you need a `<path>`, the shape is too complex — simplify it.

9. **Earth tones only, always desaturated.** The palette is warm
   grays, olive greens, sandy tans, and terracotta. No bright colours
   except the title gold. Introduce one saturated colour (blue for
   water, or red for a flag) sparingly as a landmark element.

10. **Serif text, gold colour, dark background.** These three
    choices on the title banner communicate "hand-drawn fantasy map"
    instantly and require zero additional work.

11. **Layer order is absolute.** Grass → roads → plaza → buildings
    → central tree → scattered trees → details → title. Breaking this
    order creates elements that appear to float, sink, or phase through
    each other.

12. **Plan building distribution before writing coordinates.** Use
    the clock-face mental model: assign a building type and roof colour
    to each clock position before writing a single `<rect>`. Consistent
    planning produces consistent results.
