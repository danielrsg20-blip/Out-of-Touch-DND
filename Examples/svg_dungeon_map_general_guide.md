# The Complete Guide to Generating SVG Dungeon Maps

A comprehensive technical reference for generating top-down RPG dungeon
maps in pure SVG vector graphics — the classic ink-on-parchment style
used in tabletop roleplaying games.

---

## Part 1: Foundational Philosophy

### The One Rule That Governs Everything

**Never draw walls. Draw floors instead.**

The entire dungeon is built on a single insight: a dark background
*is* the wall. Every room and corridor is a light-colored shape
punched out of that darkness. This means:

- The background fill (near-black, `#0a0a0a` or similar) covers the
  entire canvas and represents solid stone
- Every navigable space is a lighter shape drawn on top
- Anything not covered by a floor shape automatically reads as wall

This is not just a technique — it is the architecture of the whole map.
Every other decision flows from it.

### The Two-Color Foundation

Before any details, establish exactly two colors:

| Role | Suggested Value | Notes |
|---|---|---|
| Void / wall | `#0a0a0a` | Near-black, not pure black — softer |
| Floor / parchment | `#f0eeea` | Warm off-white, slightly cream |

Every other color on the map is a shade between these two. The map
should be readable in grayscale before any detail is added.

---

## Part 2: Setting Up Patterns and Definitions

Before drawing a single room, populate the `<defs>` block with all
reusable patterns. These do the heavy lifting for floor texture.

### The Grid Pattern

Every dungeon map needs a graph-paper grid. Draw only the top and
left edges of each cell — when tiled, this creates a complete grid
without doubling up lines:

```svg
<defs>
  <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
    <path d="M16 0L0 0 0 16" fill="none"
          stroke="#c8c4bc" stroke-width="0.35"/>
  </pattern>
</defs>
```

Key settings:
- `patternUnits="userSpaceOnUse"` — pattern coordinates match the
  document, so the grid aligns consistently across all rooms
- Cell size 14–16px — small enough to feel like graph paper, large
  enough to be readable
- Stroke opacity very low — the grid is background texture, not a
  dominant feature

### The Stone Texture Pattern

Staggered rectangular blocks simulate cut stone. The second row is
offset by half the tile width so joints don't align — exactly like
real masonry:

```svg
<pattern id="stone" width="28" height="20" patternUnits="userSpaceOnUse">
  <rect width="28" height="20" fill="none"/>
  <!-- Top row: two stones side by side -->
  <rect x="1" y="1" width="12" height="8" rx="0.5" fill="none"
        stroke="#c0bcb4" stroke-width="0.4"/>
  <rect x="15" y="1" width="12" height="8" rx="0.5" fill="none"
        stroke="#c0bcb4" stroke-width="0.4"/>
  <!-- Bottom row: offset — stones straddle the top joints -->
  <rect x="1"  y="11" width="8"  height="8" rx="0.5" fill="none"
        stroke="#c0bcb4" stroke-width="0.4"/>
  <rect x="11" y="11" width="10" height="8" rx="0.5" fill="none"
        stroke="#c0bcb4" stroke-width="0.4"/>
  <rect x="23" y="11" width="4"  height="8" rx="0.5" fill="none"
        stroke="#c0bcb4" stroke-width="0.4"/>
</pattern>
```

Both patterns are applied as full-canvas `<rect>` elements, clipped
to floor areas only (see Part 3).

### The ClipPath: Restricting Texture to Floors

This is the most powerful tool in the dungeon-builder's toolkit.
Define a `<clipPath>` that lists every floor shape. Apply it to your
texture rects so stone and grid appear only on navigable areas,
never bleeding into the void:

```svg
<clipPath id="floors">
  <rect x="240" y="240" width="200" height="200"/> <!-- central room -->
  <rect x="296" y="140" width="88"  height="104"/> <!-- north corridor -->
  <rect x="258" y="60"  width="164" height="84"/>  <!-- north chamber -->
  <!-- ...every other floor shape... -->
</clipPath>

<!-- Apply both textures, clipped -->
<rect width="680" height="680" fill="url(#stone)" clip-path="url(#floors)"/>
<rect width="680" height="680" fill="url(#grid)"  clip-path="url(#floors)" opacity="0.5"/>
```

When you add a new room, add its shape to the clipPath. The textures
update automatically across the entire map.

---

## Part 3: Planning the Layout

### Think in Room Types, Not Coordinates

Every dungeon is composed of a small vocabulary of room types:

| Type | Shape | Typical Role |
|---|---|---|
| **Hub** | Large square or rectangle | Central room, throne room, boss arena |
| **Corridor** | Narrow rectangle | Connects hub to chambers |
| **Chamber** | Medium rectangle | Guard room, barracks, storage |
| **Alcove** | Small rectangle | Closet, shrine, hidden room |
| **Terminal** | Any shape at a dead end | Boss room, treasure vault, crypt |

Plan which types you need before writing any coordinates.

### The Hub-and-Spoke Structure

The most readable dungeon layout for a single-level map:

1. Place one large **hub** at the visual center
2. Extend **corridors** from the hub's four sides (N, S, E, W)
3. Place **chambers** at the end of each corridor
4. Add **alcoves** as branches off the chambers or corridors
5. Optional: add diagonal connections for a less rigid feel

This structure is immediately readable — players always know roughly
where they are relative to the center.

### Coordinate Math

Establish the hub first, then derive every other coordinate from it.
If the hub is a 200×200 rect centered at (340, 340):

```
Hub edges:   left=240, right=440, top=240, bottom=440
Hub center:  x=340, y=340

North corridor starts at y=240 (hub top edge)
  → corridor rect: x=296, y=140, w=88, h=104
  → corridor bottom (y=244) touches hub top (y=240) ✓

West corridor starts at x=240 (hub left edge)  
  → corridor rect: x=136, y=296, w=108, h=88
  → corridor right (x=244) touches hub left (x=240) ✓
```

The pattern: corridors are always positioned so one edge exactly
touches the hub edge. Chambers are positioned so one edge exactly
touches the far corridor edge. Consistency here makes passage
openings trivial to calculate.

### Corridor Width

Standard corridor widths by feel:
- **Tight passage**: 24–32px (one person wide, tense)
- **Standard corridor**: 48–64px (two abreast, normal)
- **Grand hall approach**: 80–96px (formal entrance)

Keep all corridors in the same map at one of these widths for
consistency. Mixing widths implies different architectural intent.

---

## Part 4: Drawing Rooms

### Step 1 — Floor Shapes First

Draw every room and corridor as a solid floor-colored rectangle.
No strokes yet. This establishes the navigable space:

```svg
<!-- All floor shapes, flat color, no stroke -->
<rect x="240" y="240" width="200" height="200" fill="#f0eeea"/>
<rect x="296" y="140" width="88"  height="104" fill="#f0eeea"/>
<!-- ...all other rooms... -->
```

At this stage the map looks like a collection of pale rectangles
on a dark background. That is correct.

### Step 2 — Apply Textures via ClipPath

Apply the stone and grid patterns (see Part 2). The floor areas
now have stone texture and a grid overlay.

### Step 3 — Wall Outlines

Redraw every room's border as a `fill="none"` stroke rect in
near-black at 2.5–3px stroke-width:

```svg
<rect x="240" y="240" width="200" height="200"
      fill="none" stroke="#0f0f0f" stroke-width="3"/>
```

This creates the thick inked wall. The stroke sits exactly on the
boundary between floor and void. Do this for every room and corridor.

### Step 4 — Open the Passages (The Erase Trick)

Where a room connects to a corridor, their shared wall line needs
a gap. Paint over it with a floor-colored rectangle the exact width
of the opening:

```svg
<!-- Hub top wall has a gap where the north corridor connects -->
<!-- The corridor is 88px wide, centered: x=296 to x=384 -->
<!-- Opening is typically the corridor's interior width: ~56px centered -->
<rect x="308" y="239" width="56" height="5" fill="#f0eeea"/>
```

Position the erase rect exactly on the wall line (y = wall y ± 1–2px
to fully cover the 3px stroke). Width matches the desired opening.

**Rule of thumb for opening width**: the opening should be slightly
narrower than the corridor — leave a few pixels of wall visible on
each side. A 64px corridor typically has a 48–56px opening.

### Step 5 — Re-stroke Partial Walls

After erasing, re-draw the wall segments on either side of the
opening to clean up the edges:

```svg
<!-- Left wall segment, hub top -->
<line x1="240" y1="240" x2="308" y2="240" stroke="#0f0f0f" stroke-width="3"/>
<!-- Right wall segment, hub top -->
<line x1="364" y1="240" x2="440" y2="240" stroke="#0f0f0f" stroke-width="3"/>
```

This is optional if your initial room stroke is clean enough, but
recommended for a professional result.

---

## Part 5: Doors

### The Standard RPG Door Symbol

Every door uses four elements drawn in order:

```svg
<!-- 1. Erase the wall cleanly with a floor-color line -->
<line x1="318" y1="241" x2="358" y2="241"
      stroke="#f0eeea" stroke-width="5"/>

<!-- 2. Draw the door leaf (thin dark line across the opening) -->
<line x1="318" y1="241" x2="358" y2="241"
      stroke="#0f0f0f" stroke-width="2"/>

<!-- 3. Draw frame ticks (perpendicular lines at each end) -->
<line x1="318" y1="237" x2="318" y2="245" stroke="#0f0f0f" stroke-width="2"/>
<line x1="358" y1="237" x2="358" y2="245" stroke="#0f0f0f" stroke-width="2"/>

<!-- 4. Draw the swing arc (dashed quarter-circle) -->
<path d="M318,241 Q338,228 358,241" fill="none"
      stroke="#0f0f0f" stroke-width="1" stroke-dasharray="3 2"/>
```

The arc uses a quadratic bezier (`Q`) curving away from the room
the door swings into. For horizontal doors it bows up or down; for
vertical doors it bows left or right.

### Door Variants

| Type | How to Draw |
|---|---|
| **Standard door** | Line + ticks + arc (above) |
| **Open archway** | Line + ticks, no arc |
| **Locked door** | Line + ticks + arc + small circle at midpoint |
| **Secret door** | Dashed line across opening, no ticks |
| **Portcullis** | Series of short vertical lines across opening |
| **Double door** | Two arcs meeting in the middle, ticks at ends and center |

---

## Part 6: Stairs

Stairs are drawn as evenly-spaced parallel lines across the corridor
with heavier bounding lines at each side:

```svg
<!-- Stair treads (8px apart) -->
<line x1="304" y1="160" x2="376" y2="160" stroke="#0f0f0f" stroke-width="1"/>
<line x1="304" y1="168" x2="376" y2="168" stroke="#0f0f0f" stroke-width="1"/>
<line x1="304" y1="176" x2="376" y2="176" stroke="#0f0f0f" stroke-width="1"/>
<line x1="304" y1="184" x2="376" y2="184" stroke="#0f0f0f" stroke-width="1"/>
<line x1="304" y1="192" x2="376" y2="192" stroke="#0f0f0f" stroke-width="1"/>

<!-- Side walls (heavier) -->
<line x1="304" y1="156" x2="304" y2="196" stroke="#0f0f0f" stroke-width="2"/>
<line x1="376" y1="156" x2="376" y2="196" stroke="#0f0f0f" stroke-width="2"/>
```

Guidelines:
- Space treads 8px apart
- Use 5–8 treads for a standard staircase
- Match tread width to corridor interior width
- Add a directional arrow (thin line with arrowhead) pointing
  toward the lower level if the map shows multiple levels

---

## Part 7: Interior Features

Every feature is built from basic SVG primitives. The rule is:
**if you need a `<path>` to draw it, simplify it until you don't.**

### Columns

The single most impactful detail. Columns imply vaulted ceilings,
make rooms feel architectural, and break up empty floor space:

```svg
<circle cx="280" cy="280" r="7" fill="#b8b4ac" stroke="#0f0f0f" stroke-width="1.5"/>
```

Placement rules:
- Always place in pairs or quads, symmetrically
- Align to the grid — column centers should fall on grid intersections
- Standard column radius: 6–8px
- Never place a column where it would block a doorway
- Large halls: 4 columns (one near each corner, inset ~20px)
- Corridor intersections: 4 columns at the crossing, one in each quadrant

### Ritual Circles / Altars

Concentric circles communicate magic, ceremony, or danger:

```svg
<!-- Outer ring -->
<circle cx="340" cy="340" r="60" fill="none"
        stroke="#0f0f0f" stroke-width="1.5"/>
<!-- Middle ring -->
<circle cx="340" cy="340" r="42" fill="none"
        stroke="#0f0f0f" stroke-width="1"/>
<!-- Filled center disc -->
<circle cx="340" cy="340" r="18" fill="#d8d4cc"
        stroke="#0f0f0f" stroke-width="1"/>
<!-- Cross-hair -->
<line x1="340" y1="326" x2="340" y2="354" stroke="#0f0f0f" stroke-width="1.5"/>
<line x1="326" y1="340" x2="354" y2="340" stroke="#0f0f0f" stroke-width="1.5"/>
<!-- Cardinal tick marks on outer ring -->
<line x1="340" y1="280" x2="340" y2="290" stroke="#0f0f0f" stroke-width="1.2"/>
<!-- Repeat for S, E, W and optionally NE, NW, SE, SW -->
```

Vary the number of rings (1–3) and whether the inner disc is filled
or empty to suggest different types of ritual space.

### Prison Bars / Portcullis

Evenly-spaced thin verticals between two horizontal rails:

```svg
<!-- Horizontal rails -->
<line x1="556" y1="244" x2="620" y2="244" stroke="#0f0f0f" stroke-width="1.2"/>
<line x1="556" y1="292" x2="620" y2="292" stroke="#0f0f0f" stroke-width="1.2"/>
<!-- Vertical bars (8px spacing) -->
<line x1="564" y1="244" x2="564" y2="292" stroke="#0f0f0f" stroke-width="1"/>
<line x1="572" y1="244" x2="572" y2="292" stroke="#0f0f0f" stroke-width="1"/>
<line x1="580" y1="244" x2="580" y2="292" stroke="#0f0f0f" stroke-width="1"/>
<!-- Continue at 8px intervals to fill width -->
```

### Treasure Chest

Two stacked rects (body + lid) with a lock:

```svg
<!-- Body -->
<rect x="100" y="100" width="24" height="16" rx="2"
      fill="#d0ccc4" stroke="#0f0f0f" stroke-width="1.2"/>
<!-- Lid (shorter, slightly lighter) -->
<rect x="100" y="96"  width="24" height="8"  rx="1"
      fill="#b8b4ac" stroke="#0f0f0f" stroke-width="1"/>
<!-- Lock (centered on seam) -->
<rect x="108" y="100" width="8"  height="7"  rx="1"
      fill="#8a8880" stroke="#0f0f0f" stroke-width="0.8"/>
```

### Well

Outer stone ring, inner water fill, ripple ellipse, and roof frame:

```svg
<circle cx="340" cy="340" r="16" fill="#d0ccc4" stroke="#0f0f0f" stroke-width="1.5"/>
<circle cx="340" cy="340" r="10" fill="#6a8898" stroke="#0f0f0f" stroke-width="1"/>
<ellipse cx="340" cy="338" rx="6" ry="4" fill="none"
         stroke="#0f0f0f" stroke-width="0.7" opacity="0.6"/>
<!-- Roof posts and crossbeam -->
<line x1="328" y1="326" x2="328" y2="320" stroke="#0f0f0f" stroke-width="1.5"/>
<line x1="352" y1="326" x2="352" y2="320" stroke="#0f0f0f" stroke-width="1.5"/>
<line x1="326" y1="320" x2="354" y2="320" stroke="#0f0f0f" stroke-width="1.5"/>
```

### Sarcophagus / Tomb

Outer case, inner lid, carved face ellipse, banding lines:

```svg
<rect x="100" y="100" width="36" height="56" rx="3"
      fill="#c8c4bc" stroke="#0f0f0f" stroke-width="1.5"/>
<rect x="106" y="106" width="24" height="44" rx="2"
      fill="#b0aca4" stroke="#0f0f0f" stroke-width="1"/>
<ellipse cx="118" cy="122" rx="8" ry="6"
         fill="#d0ccc4" stroke="#0f0f0f" stroke-width="1"/>
<line x1="106" y1="134" x2="130" y2="134" stroke="#0f0f0f" stroke-width="0.8"/>
<line x1="106" y1="142" x2="130" y2="142" stroke="#0f0f0f" stroke-width="0.8"/>
```

Orientation: tall and narrow suggests a human-sized tomb. Wide and
short suggests an animal or creature sarcophagus.

### Hearth / Fireplace

Stone surround rect with a glowing inner rect:

```svg
<!-- Stone surround -->
<rect x="68" y="116" width="36" height="16" rx="1"
      fill="#c8a878" stroke="#0f0f0f" stroke-width="1.2"/>
<!-- Fire (orange, semi-transparent) -->
<rect x="74" y="120" width="24" height="8" rx="1"
      fill="#d04820" opacity="0.7" stroke="#0f0f0f" stroke-width="0.8"/>
```

Place against a wall (touching a room edge), never free-standing
in the center of a room.

### Rubble / Debris

Overlapping ellipses in two sizes:

```svg
<!-- Outer pile -->
<ellipse cx="86" cy="274" rx="18" ry="12"
         fill="#d0ccc4" stroke="#0f0f0f" stroke-width="1"/>
<!-- Inner/top stones -->
<ellipse cx="86" cy="274" rx="10" ry="6"
         fill="#b8b4ac" stroke="#0f0f0f" stroke-width="0.8"/>
```

Place 2–3 rubble piles in ruined rooms. Scatter individual smaller
ellipses (rx=3–5) around them for loose stones.

### Table / Furniture

Simple rects with a center line suggesting the seam or boards:

```svg
<!-- Table top -->
<rect x="80" y="80" width="64" height="32" rx="2"
      fill="#d0ccc4" stroke="#0f0f0f" stroke-width="1.2"/>
<!-- Center board line -->
<line x1="112" y1="80" x2="112" y2="112" stroke="#0f0f0f" stroke-width="0.8"/>
```

For chairs, add small squares or circles around the table's edges.

### Magic Circle (Arcane Lab)

Same concentric circle technique as the altar but with a dashed
middle ring to distinguish its nature:

```svg
<circle cx="340" cy="340" r="28" fill="none"
        stroke="#0f0f0f" stroke-width="1.2"/>
<circle cx="340" cy="340" r="18" fill="none"
        stroke="#0f0f0f" stroke-width="0.8" stroke-dasharray="4 3"/>
<circle cx="340" cy="340" r="6"
        fill="#c8c4bc" stroke="#0f0f0f" stroke-width="1"/>
```

### Gemstones / Treasure Hoard

Small filled circles in saturated colors, clustered near chests:

```svg
<circle cx="108" cy="112" r="3" fill="#4878c8" stroke="#0f0f0f" stroke-width="0.8"/>
<circle cx="116" cy="108" r="3" fill="#c84848" stroke="#0f0f0f" stroke-width="0.8"/>
<circle cx="120" cy="116" r="3" fill="#48c878" stroke="#0f0f0f" stroke-width="0.8"/>
<circle cx="112" cy="120" r="3" fill="#c8a840" stroke="#0f0f0f" stroke-width="0.8"/>
```

These are the only fully saturated colors on the map — they pop
immediately against the monochrome parchment tone.

---

## Part 8: Cartographic Elements

### Room Labels

Serif italic text is the cartographic standard. It reads as
hand-lettered annotation and is instantly distinguishable from
any printed or digital interface text:

```svg
<text font-family="serif" font-style="italic" font-size="9"
      fill="#2a2820" text-anchor="middle"
      x="[room center x]" y="[room center y - 10]">
  Room Name
</text>
```

Font size hierarchy:
- Primary rooms (hub, boss arena): 9–10px
- Secondary chambers: 7.5–8px
- Small alcoves and closets: 6.5–7px

Label color `#2a2820` — a very dark warm brown — reads as ink but
is softer than pure black, which suits the parchment aesthetic.

Position labels toward the top-center of each room, leaving the
lower half for interior features. Never label a corridor — it
reads as a passage, not a named space.

### Compass Rose

Built entirely from polygons and a background circle:

```svg
<circle cx="x" cy="y" r="20" fill="#e8e4dc" stroke="#0f0f0f" stroke-width="1.2"/>

<!-- North point (darkest — facing the viewer) -->
<polygon points="x,y-20 x+3,y-6 x,y-10 x-3,y-6" fill="#0f0f0f"/>
<!-- South point (lighter — in shadow) -->
<polygon points="x,y+20 x+3,y+6 x,y+10 x-3,y+6" fill="#606060"/>
<!-- East point -->
<polygon points="x+20,y x+6,y-3 x+10,y x+6,y+3" fill="#0f0f0f"/>
<!-- West point -->
<polygon points="x-20,y x-6,y-3 x-10,y x-6,y+3" fill="#0f0f0f"/>

<!-- N label above -->
<text font-family="serif" font-size="8" fill="#0f0f0f"
      text-anchor="middle" x="x" y="y-23">N</text>
```

Place in a corner that has no rooms nearby. The compass must never
sit over a room or corridor.

### Scale Bar

Alternating filled/empty blocks with measurement labels:

```svg
<!-- Full bar extent -->
<line x1="x"    y1="y" x2="x+80" y2="y" stroke="#0f0f0f" stroke-width="1.5"/>
<!-- End ticks -->
<line x1="x"    y1="y-5" x2="x"    y2="y+5" stroke="#0f0f0f" stroke-width="1.5"/>
<line x1="x+80" y1="y-5" x2="x+80" y2="y+5" stroke="#0f0f0f" stroke-width="1.5"/>
<!-- Mid tick -->
<line x1="x+40" y1="y-5" x2="x+40" y2="y+5" stroke="#0f0f0f" stroke-width="1.5"/>
<!-- First half: filled black -->
<rect x="x"    y="y-5" width="40" height="10" fill="#0f0f0f"/>
<!-- Second half: empty parchment -->
<rect x="x+40" y="y-5" width="40" height="10"
      fill="#e8e4dc" stroke="#0f0f0f" stroke-width="0.8"/>
<!-- Labels -->
<text font-family="serif" font-size="7" fill="#2a2820"
      text-anchor="middle" x="x"    y="y+15">0</text>
<text font-family="serif" font-size="7" fill="#2a2820"
      text-anchor="middle" x="x+40" y="y+15">10 ft</text>
<text font-family="serif" font-size="7" fill="#2a2820"
      text-anchor="middle" x="x+80" y="y+15">20 ft</text>
```

### Title Banner

A lightly filled rect with bold serif text:

```svg
<rect x="x" y="y" width="w" height="26" rx="2"
      fill="#e8e4dc" stroke="#0f0f0f" stroke-width="1"/>
<text font-family="serif" font-size="13" font-weight="bold"
      fill="#0f0f0f" text-anchor="middle" x="x + w/2" y="y+17">
  Dungeon Name
</text>
```

Place at the bottom center of the map. A subtitle line in smaller
italic text beneath the title adds polish:

```svg
<text font-family="serif" font-size="8" font-style="italic"
      fill="#5a5850" text-anchor="middle" x="x + w/2" y="y+28">
  Level 1 — The Upper Reaches
</text>
```

---

## Part 9: Advanced Techniques

### Irregular Room Shapes

Not every room has to be a rectangle. For organic caves or
throne room apses, use `<polygon>` or simple `<path>` elements:

```svg
<!-- Hexagonal chamber -->
<polygon points="340,220 380,240 380,280 340,300 300,280 300,240"
         fill="#f0eeea"/>
<!-- Curved apse -->
<path d="M280,200 L280,260 Q340,300 400,260 L400,200 Z"
      fill="#f0eeea"/>
```

Add these to the clipPath just like any other floor shape.
The wall outline stroke is drawn on the same path.

### Secret Doors

Indicated by a dashed line segment along the wall with no ticks:

```svg
<line x1="300" y1="240" x2="340" y2="240"
      stroke="#0f0f0f" stroke-width="1.5" stroke-dasharray="4 3"/>
```

Conventionally placed flush with the wall, not across an opening.

### Trap Symbols

An X mark on the floor at the trap location:

```svg
<line x1="330" y1="330" x2="350" y2="350" stroke="#0f0f0f" stroke-width="1"/>
<line x1="350" y1="330" x2="330" y2="350" stroke="#0f0f0f" stroke-width="1"/>
```

For pressure plates, a dashed rectangle:

```svg
<rect x="328" y="328" width="24" height="24" rx="1"
      fill="none" stroke="#0f0f0f" stroke-width="1"
      stroke-dasharray="3 2"/>
```

### Water / Flooded Areas

A filled blue rectangle within a room, with wavy lines for ripples:

```svg
<rect x="260" y="260" width="80" height="60"
      fill="#6a8898" stroke="#0f0f0f" stroke-width="1" opacity="0.7"/>
<!-- Ripple lines -->
<path d="M268,280 Q278,276 288,280 Q298,284 308,280 Q318,276 328,280"
      fill="none" stroke="#4a6878" stroke-width="0.8"/>
<path d="M268,292 Q278,288 288,292 Q298,296 308,292 Q318,288 328,292"
      fill="none" stroke="#4a6878" stroke-width="0.8"/>
```

### Pit / Chasm

A darker filled rect with diagonal hatching:

```svg
<rect x="300" y="300" width="48" height="48"
      fill="#3a3a3a" stroke="#0f0f0f" stroke-width="1.5"/>
<!-- Hatching lines -->
<line x1="300" y1="312" x2="312" y2="300" stroke="#5a5a5a" stroke-width="0.8"/>
<line x1="300" y1="328" x2="328" y2="300" stroke="#5a5a5a" stroke-width="0.8"/>
<line x1="300" y1="344" x2="344" y2="300" stroke="#5a5a5a" stroke-width="0.8"/>
<line x1="304" y1="348" x2="348" y2="304" stroke="#5a5a5a" stroke-width="0.8"/>
<line x1="316" y1="348" x2="348" y2="316" stroke="#5a5a5a" stroke-width="0.8"/>
<line x1="332" y1="348" x2="348" y2="332" stroke="#5a5a5a" stroke-width="0.8"/>
```

---

## Part 10: The Complete Color Palette

| Role | Hex | Notes |
|---|---|---|
| Void / wall | `#0a0a0a` | Background fill |
| Floor / parchment | `#f0eeea` | All navigable areas |
| Wall stroke | `#0f0f0f` | Room outlines, feature strokes |
| Stone texture | `#c0bcb4` | Pattern lines only |
| Grid lines | `#c8c4bc` | Subtle, low opacity |
| Column / stone gray | `#b8b4ac` | Columns, feature fills |
| Feature mid-gray | `#d0ccc4` | Chests, wells, sarcophagi |
| Feature dark-gray | `#b0aca4` | Lids, inner surfaces |
| Well water | `#6a8898` | Water features |
| Flooded areas | `#6a8898` at 70% | Large water fills |
| Room label ink | `#2a2820` | Labels, all text |
| UI parchment | `#e8e4dc` | Banner, compass backgrounds |
| Fire / hearth glow | `#d04820` | Hearth inner rect only |
| Treasure gold | `#c8a840` | Chest highlights, gold gems |
| Gemstone blue | `#4878c8` | Sapphires |
| Gemstone red | `#c84848` | Rubies |
| Gemstone green | `#48c878` | Emeralds |
| Shadow/pit fill | `#3a3a3a` | Chasms, pit traps |

The palette is intentionally near-monochrome. Saturated colors appear
only for fire and gems — three or four pixels of bright color stand
out dramatically against a map that is otherwise warm gray and parchment.

---

## Part 11: The Layering Order

This is the non-negotiable sequence. Every element must be drawn
in this order or the map will not render correctly:

```
 1. Void rectangle (full canvas, near-black)
 2. Floor rectangles (all rooms and corridors, parchment color)
 3. Stone texture (full canvas, clipped to floors)
 4. Grid overlay (full canvas, clipped to floors, 0.5 opacity)
 5. Wall outline strokes (all room and corridor borders)
 6. Wall-erase passes (floor-colored rects over shared wall lines)
 7. Partial wall re-strokes (clean up erase edges if needed)
 8. Door symbols (erase + leaf + ticks + arc)
 9. Stairs
10. Water / flooded areas
11. Pit / chasm fills
12. Interior features (columns, altars, bars, chests, wells, etc.)
13. Trap markers
14. Room labels (text)
15. Compass rose
16. Scale bar
17. Title banner
```

---

## Part 12: Summary of Core Principles

1. **Background = void = wall.** Never draw walls. Draw floors.
2. **ClipPath textures to floors.** Stone and grid never bleed into void.
3. **Plan coordinates before writing SVG.** Hub first, derive everything else.
4. **Passage openings are erased, not designed.** Draw rooms fully, then paint gaps.
5. **Doors = line + ticks + arc.** Always four elements in the same order.
6. **Everything is a primitive.** Rect, circle, line, ellipse, polygon.
   No complex paths until you absolutely cannot avoid them.
7. **Columns make rooms feel real.** Add them to any room that looks empty.
8. **Monochrome palette with spot color.** Gray and parchment everywhere;
   saturated color only for gems and fire.
9. **Serif italic text only.** It communicates "hand-drawn map" instantly.
10. **Compass, scale bar, title.** All three are required for a complete map.
    They transform a diagram into a document.
