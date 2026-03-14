"""
overlay_api.py

Backend API for vector overlay system.
Phase 1 MVP: basic CRUD operations and validation.
Phase 2+: procedural generation, narrative parsing, gameplay integration.
"""

from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Set, Any
from datetime import UTC, datetime
import hashlib
import math
import random
import uuid
import json


@dataclass
class Point:
    x: float
    y: float


@dataclass
class GradientStop:
    offset: float
    color: str


@dataclass
class GradientDef:
    type: str  # 'linear' or 'radial'
    start: Optional[Point] = None
    end: Optional[Point] = None
    center: Optional[Point] = None
    radius: Optional[float] = None
    stops: List[GradientStop] = None


@dataclass
class FillStyle:
    color: str
    gradient: Optional[GradientDef] = None


@dataclass
class StrokeStyle:
    color: str
    width: float
    line_cap: str = 'round'
    line_join: str = 'round'
    dash_array: Optional[List[float]] = None
    width_profile: Optional[List[float]] = None


@dataclass
class NoiseMask:
    enabled: bool
    intensity: float
    scale: float
    seed: int
    octaves: int = 3


@dataclass
class Region:
    type: str = 'polygon'
    id: str = None
    name: str = None
    points: List[Point] = None
    fill: FillStyle = None
    fill_opacity: float = 1.0
    stroke: Optional[StrokeStyle] = None
    noise_mask: Optional[NoiseMask] = None
    feather: Optional[float] = None
    tags: Optional[List[str]] = None

    def __post_init__(self):
        if self.id is None:
            self.id = f"region_{uuid.uuid4().hex[:12]}"


@dataclass
class Path:
    type: str = 'polyline'
    id: str = None
    name: str = None
    points: List[Point] = None
    stroke: StrokeStyle = None
    stroke_opacity: float = 1.0
    style_jitter: float = 0.0
    noise_mask: Optional[NoiseMask] = None
    end_cap_style: str = 'round'
    tags: Optional[List[str]] = None

    def __post_init__(self):
        if self.id is None:
            self.id = f"path_{uuid.uuid4().hex[:12]}"


@dataclass
class Decal:
    type: str = 'decal'
    id: str = None
    name: str = None
    position: Point = None
    decal_type: str = None
    scale: float = 1.0
    rotation: float = 0.0
    opacity: float = 1.0
    blend_mode: str = 'normal'
    tags: Optional[List[str]] = None

    def __post_init__(self):
        if self.id is None:
            self.id = f"decal_{uuid.uuid4().hex[:12]}"


@dataclass
class OverlayLayer:
    id: str
    name: str
    z_index: int
    visible: bool = True
    blend_mode: str = 'normal'
    opacity: float = 1.0
    elements: List[Any] = None
    clip_region: Optional[List[Point]] = None
    clipped_to_bounds: bool = True

    def __post_init__(self):
        if self.elements is None:
            self.elements = []


@dataclass
class StyleDefinition:
    id: str
    name: str
    palette: Dict[str, str] = None
    noise_seed: int = 0
    edge_feathering: float = 3.0
    jitter: float = 0.1
    decal_library: Dict[str, Any] = None

    def __post_init__(self):
        if self.palette is None:
            self.palette = {
                'primary': '#3a3a3a',
                'secondary': '#8b8b8b',
                'accent_1': '#ff6b35',
                'accent_2': '#4ecdc4',
                'accent_3': '#95e1d3',
            }
        if self.decal_library is None:
            self.decal_library = {}


@dataclass
class Overlay:
    id: str
    name: str
    version: str = '1.0'
    created_at: str = None
    map_id: Optional[str] = None
    metadata: Dict[str, Any] = None
    styles: Dict[str, StyleDefinition] = None
    layers: List[OverlayLayer] = None

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now(UTC).isoformat().replace('+00:00', 'Z')
        if self.metadata is None:
            self.metadata = {}
        if self.styles is None:
            self.styles = {
                'default': StyleDefinition(
                    id='default',
                    name='Default Style'
                )
            }
        if self.layers is None:
            self.layers = [
                OverlayLayer(id='layer_base', name='BaseBiomeOverlay', z_index=10),
                OverlayLayer(id='layer_detail', name='DetailOverlay', z_index=20),
                OverlayLayer(id='layer_weather', name='WeatherOverlay', z_index=30),
                OverlayLayer(id='layer_magic', name='MagicOverlay', z_index=40),
            ]


class OverlayAPI:
    """
    Main API for managing vector overlays.
    Phase 1: basic CRUD
    Phase 2+: procedural generation, gameplay integration
    """

    def __init__(self):
        self.overlays: Dict[str, Overlay] = {}

    # ========================================================================
    # CRUD OPERATIONS
    # ========================================================================

    def create_overlay(self, overlay_id: str, name: str, map_id: Optional[str] = None) -> Overlay:
        """Create a new empty overlay."""
        overlay = Overlay(
            id=overlay_id,
            name=name,
            map_id=map_id
        )
        self.overlays[overlay_id] = overlay
        return overlay

    def get_overlay(self, overlay_id: str) -> Optional[Overlay]:
        """Get overlay by ID."""
        return self.overlays.get(overlay_id)

    def delete_overlay(self, overlay_id: str) -> bool:
        """Delete overlay by ID."""
        if overlay_id in self.overlays:
            del self.overlays[overlay_id]
            return True
        return False

    def list_overlays(self) -> List[Overlay]:
        """List all overlays."""
        return list(self.overlays.values())

    # ========================================================================
    # SHAPE CREATION
    # ========================================================================

    def create_region(
        self,
        overlay_id: str,
        layer_name: str,
        name: str,
        polygon_points: List[Dict],
        fill_color: str,
        stroke_color: Optional[str] = None,
        stroke_width: float = 1.0,
        noise_intensity: float = 0.0,
        feather: float = 0.0,
        tags: Optional[List[str]] = None
    ) -> Optional[Region]:
        """Create and add a polygon region to a layer."""
        overlay = self.get_overlay(overlay_id)
        if not overlay:
            return None

        # Find layer
        layer = next((l for l in overlay.layers if l.name == layer_name), None)
        if not layer:
            return None

        # Build region
        points = [Point(x=p['x'], y=p['y']) for p in polygon_points]
        fill = FillStyle(color=fill_color)

        stroke = None
        if stroke_color:
            stroke = StrokeStyle(color=stroke_color, width=stroke_width)

        noise_mask = None
        if noise_intensity > 0:
            noise_mask = NoiseMask(
                enabled=True,
                intensity=noise_intensity,
                scale=8.0,
                seed=hash(name) % 100000
            )

        region = Region(
            name=name,
            points=points,
            fill=fill,
            stroke=stroke,
            noise_mask=noise_mask,
            feather=feather if feather > 0 else None,
            tags=tags
        )

        layer.elements.append(region)
        return region

    def create_path(
        self,
        overlay_id: str,
        layer_name: str,
        name: str,
        polyline_points: List[Dict],
        stroke_color: str,
        stroke_width: float = 1.0,
        jitter: float = 0.0,
        width_profile: Optional[List[float]] = None,
        tags: Optional[List[str]] = None
    ) -> Optional[Path]:
        """Create and add a polyline path to a layer."""
        overlay = self.get_overlay(overlay_id)
        if not overlay:
            return None

        layer = next((l for l in overlay.layers if l.name == layer_name), None)
        if not layer:
            return None

        points = [Point(x=p['x'], y=p['y']) for p in polyline_points]
        stroke = StrokeStyle(
            color=stroke_color,
            width=stroke_width,
            width_profile=width_profile
        )

        path = Path(
            name=name,
            points=points,
            stroke=stroke,
            style_jitter=jitter,
            tags=tags
        )

        layer.elements.append(path)
        return path

    def stamp_decals(
        self,
        overlay_id: str,
        layer_name: str,
        decal_type: str,
        positions: List[Dict],
        scale: float = 1.0,
        rotation: float = 0.0,
        tags: Optional[List[str]] = None
    ) -> List[Decal]:
        """Stamp multiple decals at positions."""
        overlay = self.get_overlay(overlay_id)
        if not overlay:
            return []

        layer = next((l for l in overlay.layers if l.name == layer_name), None)
        if not layer:
            return []

        decals = []
        for idx, pos in enumerate(positions):
            decal = Decal(
                name=f"{decal_type}_{idx}",
                position=Point(x=pos['x'], y=pos['y']),
                decal_type=decal_type,
                scale=scale,
                rotation=rotation,
                tags=tags
            )
            layer.elements.append(decal)
            decals.append(decal)

        return decals

    # ========================================================================
    # LAYER MANAGEMENT
    # ========================================================================

    def create_layer(
        self,
        overlay_id: str,
        name: str,
        z_index: int,
        blend_mode: str = 'normal'
    ) -> Optional[OverlayLayer]:
        """Create a new layer in the overlay."""
        overlay = self.get_overlay(overlay_id)
        if not overlay:
            return None

        layer = OverlayLayer(
            id=f"layer_{uuid.uuid4().hex[:12]}",
            name=name,
            z_index=z_index,
            blend_mode=blend_mode
        )

        overlay.layers.append(layer)
        overlay.layers.sort(key=lambda l: l.z_index)
        return layer

    def set_layer_visibility(self, overlay_id: str, layer_id: str, visible: bool) -> bool:
        """Toggle layer visibility."""
        overlay = self.get_overlay(overlay_id)
        if not overlay:
            return False

        layer = next((l for l in overlay.layers if l.id == layer_id), None)
        if layer:
            layer.visible = visible
            return True

        return False

    # ========================================================================
    # GAMEPLAY INTEGRATION (Phase 2+)
    # ========================================================================

    def get_terrain_properties_at(self, overlay_id: str, x: float, y: float) -> Set[str]:
        """
        Query terrain tags at a point.
        Phase 1: stub; Phase 2: proper point-in-polygon testing
        """
        return set()

    def point_in_polygon(self, point: Point, polygon: List[Point]) -> bool:
        """Simple point-in-polygon test."""
        if len(polygon) < 3:
            return False

        inside = False
        j = len(polygon) - 1

        for i in range(len(polygon)):
            xi, yi = polygon[i].x, polygon[i].y
            xj, yj = polygon[j].x, polygon[j].y

            if ((yi > point.y) != (yj > point.y)) and (
                point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi
            ):
                inside = not inside

            j = i

        return inside

    # ========================================================================
    # SERIALIZATION
    # ========================================================================

    def save_overlay_to_json(self, overlay_id: str) -> Optional[str]:
        """Serialize overlay to JSON string."""
        overlay = self.get_overlay(overlay_id)
        if not overlay:
            return None

        def to_dict(obj):
            if hasattr(obj, '__dataclass_fields__'):
                d = asdict(obj)
                # Filter out None values
                return {k: to_dict(v) for k, v in d.items() if v is not None}
            elif isinstance(obj, dict):
                return {k: to_dict(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [to_dict(item) for item in obj]
            else:
                return obj

        data = to_dict(overlay)
        return json.dumps(data, indent=2)

    def load_overlay_from_json(self, json_str: str, *, overlay_id: Optional[str] = None) -> Optional[Overlay]:
        """Deserialize overlay from JSON string and store it in memory."""
        try:
            data = json.loads(json_str)
            if not isinstance(data, dict):
                return None

            resolved_id = overlay_id or str(data.get("id") or f"overlay_{uuid.uuid4().hex[:10]}")
            overlay = Overlay(
                id=resolved_id,
                name=str(data.get("name") or "Loaded Overlay"),
                version=str(data.get("version") or "1.0"),
                created_at=str(data.get("created_at") or datetime.now(UTC).isoformat().replace('+00:00', 'Z')),
                map_id=data.get("map_id") if isinstance(data.get("map_id"), str) else None,
                metadata=data.get("metadata") if isinstance(data.get("metadata"), dict) else {},
            )

            styles_payload = data.get("styles")
            if isinstance(styles_payload, dict) and styles_payload:
                style_defs: Dict[str, StyleDefinition] = {}
                for key, payload in styles_payload.items():
                    if not isinstance(payload, dict):
                        continue
                    style_defs[str(key)] = StyleDefinition(
                        id=str(payload.get("id") or key),
                        name=str(payload.get("name") or key),
                        palette=payload.get("palette") if isinstance(payload.get("palette"), dict) else None,
                        noise_seed=int(payload.get("noise_seed", 0) or 0),
                        edge_feathering=float(payload.get("edge_feathering", 3.0) or 3.0),
                        jitter=float(payload.get("jitter", 0.1) or 0.1),
                        decal_library=payload.get("decal_library") if isinstance(payload.get("decal_library"), dict) else {},
                    )
                if style_defs:
                    overlay.styles = style_defs

            layers_payload = data.get("layers")
            if isinstance(layers_payload, list) and layers_payload:
                parsed_layers: List[OverlayLayer] = []
                for i, layer_data in enumerate(layers_payload):
                    if not isinstance(layer_data, dict):
                        continue
                    layer = OverlayLayer(
                        id=str(layer_data.get("id") or f"layer_{i}"),
                        name=str(layer_data.get("name") or f"Layer {i+1}"),
                        z_index=int(layer_data.get("z_index", i * 10 + 10) or (i * 10 + 10)),
                        visible=bool(layer_data.get("visible", True)),
                        blend_mode=str(layer_data.get("blend_mode") or "normal"),
                        opacity=float(layer_data.get("opacity", 1.0) or 1.0),
                    )

                    clip_points = layer_data.get("clip_region")
                    if isinstance(clip_points, list):
                        layer.clip_region = [
                            Point(x=float(p.get("x", 0.0)), y=float(p.get("y", 0.0)))
                            for p in clip_points
                            if isinstance(p, dict)
                        ]

                    elements_payload = layer_data.get("elements")
                    if isinstance(elements_payload, list):
                        for element_data in elements_payload:
                            if not isinstance(element_data, dict):
                                continue
                            etype = str(element_data.get("type") or "")
                            if etype == "polygon":
                                points = [
                                    Point(x=float(p.get("x", 0.0)), y=float(p.get("y", 0.0)))
                                    for p in (element_data.get("points") or [])
                                    if isinstance(p, dict)
                                ]
                                fill_data = element_data.get("fill") if isinstance(element_data.get("fill"), dict) else {}
                                fill = FillStyle(color=str(fill_data.get("color") or "#00000000"))
                                stroke_data = element_data.get("stroke") if isinstance(element_data.get("stroke"), dict) else None
                                stroke = None
                                if stroke_data:
                                    stroke = StrokeStyle(
                                        color=str(stroke_data.get("color") or "#000000"),
                                        width=float(stroke_data.get("width", 1.0) or 1.0),
                                        line_cap=str(stroke_data.get("line_cap") or "round"),
                                        line_join=str(stroke_data.get("line_join") or "round"),
                                        dash_array=stroke_data.get("dash_array") if isinstance(stroke_data.get("dash_array"), list) else None,
                                        width_profile=stroke_data.get("width_profile") if isinstance(stroke_data.get("width_profile"), list) else None,
                                    )
                                noise_data = element_data.get("noise_mask") if isinstance(element_data.get("noise_mask"), dict) else None
                                noise_mask = None
                                if noise_data:
                                    noise_mask = NoiseMask(
                                        enabled=bool(noise_data.get("enabled", True)),
                                        intensity=float(noise_data.get("intensity", 0.0) or 0.0),
                                        scale=float(noise_data.get("scale", 8.0) or 8.0),
                                        seed=int(noise_data.get("seed", 0) or 0),
                                        octaves=int(noise_data.get("octaves", 3) or 3),
                                    )
                                layer.elements.append(
                                    Region(
                                        id=str(element_data.get("id") or f"region_{uuid.uuid4().hex[:12]}"),
                                        name=str(element_data.get("name") or "Region"),
                                        points=points,
                                        fill=fill,
                                        fill_opacity=float(element_data.get("fill_opacity", 1.0) or 1.0),
                                        stroke=stroke,
                                        noise_mask=noise_mask,
                                        feather=float(element_data.get("feather")) if element_data.get("feather") is not None else None,
                                        tags=element_data.get("tags") if isinstance(element_data.get("tags"), list) else None,
                                    )
                                )
                            elif etype == "polyline":
                                points = [
                                    Point(x=float(p.get("x", 0.0)), y=float(p.get("y", 0.0)))
                                    for p in (element_data.get("points") or [])
                                    if isinstance(p, dict)
                                ]
                                stroke_data = element_data.get("stroke") if isinstance(element_data.get("stroke"), dict) else {}
                                stroke = StrokeStyle(
                                    color=str(stroke_data.get("color") or "#000000"),
                                    width=float(stroke_data.get("width", 1.0) or 1.0),
                                    line_cap=str(stroke_data.get("line_cap") or "round"),
                                    line_join=str(stroke_data.get("line_join") or "round"),
                                    dash_array=stroke_data.get("dash_array") if isinstance(stroke_data.get("dash_array"), list) else None,
                                    width_profile=stroke_data.get("width_profile") if isinstance(stroke_data.get("width_profile"), list) else None,
                                )
                                layer.elements.append(
                                    Path(
                                        id=str(element_data.get("id") or f"path_{uuid.uuid4().hex[:12]}"),
                                        name=str(element_data.get("name") or "Path"),
                                        points=points,
                                        stroke=stroke,
                                        stroke_opacity=float(element_data.get("stroke_opacity", 1.0) or 1.0),
                                        style_jitter=float(element_data.get("style_jitter", 0.0) or 0.0),
                                        end_cap_style=str(element_data.get("end_cap_style") or "round"),
                                        tags=element_data.get("tags") if isinstance(element_data.get("tags"), list) else None,
                                    )
                                )
                            elif etype == "decal":
                                position = element_data.get("position") if isinstance(element_data.get("position"), dict) else {}
                                layer.elements.append(
                                    Decal(
                                        id=str(element_data.get("id") or f"decal_{uuid.uuid4().hex[:12]}"),
                                        name=str(element_data.get("name") or "Decal"),
                                        position=Point(
                                            x=float(position.get("x", 0.0)),
                                            y=float(position.get("y", 0.0)),
                                        ),
                                        decal_type=str(element_data.get("decal_type") or "unknown"),
                                        scale=float(element_data.get("scale", 1.0) or 1.0),
                                        rotation=float(element_data.get("rotation", 0.0) or 0.0),
                                        opacity=float(element_data.get("opacity", 1.0) or 1.0),
                                        blend_mode=str(element_data.get("blend_mode") or "normal"),
                                        tags=element_data.get("tags") if isinstance(element_data.get("tags"), list) else None,
                                    )
                                )

                    parsed_layers.append(layer)

                if parsed_layers:
                    overlay.layers = sorted(parsed_layers, key=lambda l: l.z_index)

            self.overlays[overlay.id] = overlay
            return overlay
        except Exception as e:
            print(f"Error loading overlay: {e}")
            return None

    # ========================================================================
    # PROCEDURAL GENERATION
    # ========================================================================

    def _stable_seed(self, text: str, seed: Optional[int] = None) -> int:
        source = f"{text}|{seed if seed is not None else 'auto'}"
        digest = hashlib.sha256(source.encode("utf-8")).hexdigest()
        return int(digest[:8], 16)

    def _ensure_layer(self, overlay: Overlay, name: str, z_index: int, blend_mode: str = "normal") -> OverlayLayer:
        existing = next((l for l in overlay.layers if l.name == name), None)
        if existing:
            return existing
        created = OverlayLayer(
            id=f"layer_{uuid.uuid4().hex[:12]}",
            name=name,
            z_index=z_index,
            blend_mode=blend_mode,
            visible=True,
            opacity=1.0,
        )
        overlay.layers.append(created)
        overlay.layers.sort(key=lambda l: l.z_index)
        return created

    def _map_bounds(self, map_context: Optional[Dict[str, Any]]) -> tuple[float, float]:
        if not map_context:
            return (640.0, 480.0)
        width = float(map_context.get("width", 20))
        height = float(map_context.get("height", 15))
        tile_size = float(map_context.get("tile_size", 32))

        # If values look like tile counts, convert to world pixels.
        if width <= 200 and height <= 200:
            return (max(64.0, width * tile_size), max(64.0, height * tile_size))
        return (max(64.0, width), max(64.0, height))

    def _make_blob_polygon(self, rng: random.Random, cx: float, cy: float, rx: float, ry: float, points: int = 7) -> List[Point]:
        out: List[Point] = []
        for i in range(points):
            angle = (i / points) * 6.28318530718
            wobble = 0.75 + rng.random() * 0.5
            px = cx + (rx * wobble) * (1.0 if i % 2 == 0 else 0.92) * math.cos(angle)
            py = cy + (ry * wobble) * (1.0 if i % 2 == 1 else 0.92) * math.sin(angle)
            out.append(Point(x=px, y=py))
        return out

    def _append_battle_marks(self, overlay: Overlay, rng: random.Random, width: float, height: float) -> None:
        detail = self._ensure_layer(overlay, "DetailOverlay", 20, "normal")
        magic = self._ensure_layer(overlay, "MagicOverlay", 40, "multiply")

        for i in range(3):
            cx = rng.uniform(width * 0.15, width * 0.85)
            cy = rng.uniform(height * 0.2, height * 0.8)
            poly = self._make_blob_polygon(rng, cx, cy, rng.uniform(30, 60), rng.uniform(20, 48), points=8)
            magic.elements.append(
                Region(
                    name=f"scorch_zone_{i+1}",
                    points=poly,
                    fill=FillStyle(color="#3a2110aa"),
                    fill_opacity=0.68,
                    stroke=StrokeStyle(color="#8b4513", width=1.5),
                    noise_mask=NoiseMask(enabled=True, intensity=0.45, scale=8.0, seed=rng.randint(1, 999999), octaves=3),
                    feather=4.0,
                    tags=["battle", "scorch", "fire_damage"],
                )
            )

        decals = [
            {"x": rng.uniform(width * 0.2, width * 0.8), "y": rng.uniform(height * 0.2, height * 0.8)}
            for _ in range(8)
        ]
        self.stamp_decals(overlay.id, detail.name, "blood_stain", decals, scale=0.9, rotation=0.0, tags=["battle", "blood"])

    def _append_temple_decay(self, overlay: Overlay, rng: random.Random, width: float, height: float) -> None:
        detail = self._ensure_layer(overlay, "DetailOverlay", 20, "normal")
        for i in range(4):
            x0 = rng.uniform(width * 0.1, width * 0.9)
            y0 = rng.uniform(height * 0.1, height * 0.9)
            x1 = min(width - 8.0, x0 + rng.uniform(-120, 120))
            y1 = min(height - 8.0, y0 + rng.uniform(-90, 90))
            detail.elements.append(
                Path(
                    name=f"temple_crack_{i+1}",
                    points=[Point(x=x0, y=y0), Point(x=(x0 + x1) / 2 + rng.uniform(-16, 16), y=(y0 + y1) / 2 + rng.uniform(-16, 16)), Point(x=x1, y=y1)],
                    stroke=StrokeStyle(color="#6a6a6a", width=2.4, line_cap="round", line_join="round"),
                    stroke_opacity=0.7,
                    style_jitter=0.18,
                    tags=["ancient", "cracks"],
                )
            )
        moss_positions = [{"x": rng.uniform(24, width - 24), "y": rng.uniform(24, height - 24)} for _ in range(10)]
        self.stamp_decals(overlay.id, detail.name, "moss_tuft", moss_positions, scale=1.0, tags=["ancient", "moss"])

    def _append_winter_weather(self, overlay: Overlay, rng: random.Random, width: float, height: float) -> None:
        weather = self._ensure_layer(overlay, "WeatherOverlay", 30, "screen")
        drift = self._make_blob_polygon(rng, width * 0.55, height * 0.45, width * 0.24, height * 0.18, points=9)
        weather.elements.append(
            Region(
                name="snow_drift",
                points=drift,
                fill=FillStyle(color="#dfe8f0b8"),
                fill_opacity=0.6,
                stroke=StrokeStyle(color="#f4f8ff", width=1.0),
                noise_mask=NoiseMask(enabled=True, intensity=0.35, scale=12.0, seed=rng.randint(1, 999999), octaves=2),
                feather=6.0,
                tags=["winter", "snow", "slippery"],
            )
        )
        for i in range(3):
            y = rng.uniform(height * 0.15, height * 0.85)
            weather.elements.append(
                Path(
                    name=f"wind_streak_{i+1}",
                    points=[Point(x=0, y=y), Point(x=width * 0.45, y=y + rng.uniform(-18, 18)), Point(x=width, y=y + rng.uniform(-12, 12))],
                    stroke=StrokeStyle(color="#cde2ff", width=2.0, dash_array=[8, 10]),
                    stroke_opacity=0.35,
                    style_jitter=0.05,
                    tags=["winter", "wind"],
                )
            )

    def _append_curse(self, overlay: Overlay, rng: random.Random, width: float, height: float) -> None:
        magic = self._ensure_layer(overlay, "MagicOverlay", 40, "multiply")
        detail = self._ensure_layer(overlay, "DetailOverlay", 20, "normal")

        for i in range(2):
            pocket = self._make_blob_polygon(
                rng,
                rng.uniform(width * 0.2, width * 0.8),
                rng.uniform(height * 0.2, height * 0.8),
                rng.uniform(45, 90),
                rng.uniform(30, 70),
                points=8,
            )
            magic.elements.append(
                Region(
                    name=f"cursed_fog_{i+1}",
                    points=pocket,
                    fill=FillStyle(color="#2d224080"),
                    fill_opacity=0.58,
                    stroke=StrokeStyle(color="#5d3a7a", width=1.5),
                    noise_mask=NoiseMask(enabled=True, intensity=0.55, scale=10.0, seed=rng.randint(1, 999999), octaves=3),
                    feather=7.0,
                    tags=["cursed", "fog", "vision_obstructed"],
                )
            )

        for i in range(3):
            x0 = rng.uniform(18, width * 0.4)
            y0 = rng.uniform(18, height - 18)
            x1 = rng.uniform(width * 0.6, width - 18)
            y1 = min(height - 8.0, y0 + rng.uniform(-70, 70))
            detail.elements.append(
                Path(
                    name=f"thorn_vine_{i+1}",
                    points=[Point(x=x0, y=y0), Point(x=(x0 + x1) / 2 + rng.uniform(-22, 22), y=(y0 + y1) / 2 + rng.uniform(-22, 22)), Point(x=x1, y=y1)],
                    stroke=StrokeStyle(color="#355d2b", width=3.0),
                    stroke_opacity=0.65,
                    style_jitter=0.22,
                    tags=["cursed", "vines", "difficult_terrain"],
                )
            )

    def _append_forest_scene(self, overlay: Overlay, rng: random.Random, width: float, height: float) -> None:
        base = self._ensure_layer(overlay, "BaseBiomeOverlay", 10, "normal")
        detail = self._ensure_layer(overlay, "DetailOverlay", 20, "normal")
        weather = self._ensure_layer(overlay, "WeatherOverlay", 30, "multiply")

        clearing = self._make_blob_polygon(
            rng,
            width * 0.5,
            height * 0.58,
            width * 0.24,
            height * 0.18,
            points=10,
        )
        base.elements.append(
            Region(
                name="forest_clearing",
                points=clearing,
                fill=FillStyle(color="#6f8a5e88"),
                fill_opacity=0.6,
                stroke=StrokeStyle(color="#8ea86d", width=1.2),
                noise_mask=NoiseMask(enabled=True, intensity=0.3, scale=11.0, seed=rng.randint(1, 999999), octaves=2),
                feather=5.0,
                tags=["forest", "clearing", "passable"],
            )
        )

        path_points = [
            Point(x=width * 0.52, y=height * 0.96),
            Point(x=width * 0.47 + rng.uniform(-18, 18), y=height * 0.78),
            Point(x=width * 0.56 + rng.uniform(-22, 22), y=height * 0.63),
            Point(x=width * 0.5 + rng.uniform(-26, 26), y=height * 0.46),
            Point(x=width * 0.54 + rng.uniform(-20, 20), y=height * 0.24),
        ]
        detail.elements.append(
            Path(
                name="forest_path",
                points=path_points,
                stroke=StrokeStyle(color="#8a6b46", width=9.0, line_cap="round", line_join="round", width_profile=[1.2, 1.05, 0.95, 0.82, 0.7]),
                stroke_opacity=0.72,
                style_jitter=0.08,
                tags=["forest", "path", "trail"],
            )
        )

        for i in range(3):
            y = rng.uniform(height * 0.2, height * 0.9)
            detail.elements.append(
                Path(
                    name=f"underbrush_{i+1}",
                    points=[
                        Point(x=width * 0.08, y=y),
                        Point(x=width * 0.42 + rng.uniform(-20, 20), y=y + rng.uniform(-24, 24)),
                        Point(x=width * 0.86, y=y + rng.uniform(-18, 18)),
                    ],
                    stroke=StrokeStyle(color="#3f5a35", width=2.2, dash_array=[6, 8]),
                    stroke_opacity=0.33,
                    style_jitter=0.14,
                    tags=["forest", "underbrush"],
                )
            )

        shade = self._make_blob_polygon(
            rng,
            width * 0.5,
            height * 0.45,
            width * 0.42,
            height * 0.34,
            points=11,
        )
        weather.elements.append(
            Region(
                name="canopy_shadow",
                points=shade,
                fill=FillStyle(color="#29402f55"),
                fill_opacity=0.45,
                stroke=StrokeStyle(color="#385841", width=0.8),
                noise_mask=NoiseMask(enabled=True, intensity=0.28, scale=14.0, seed=rng.randint(1, 999999), octaves=2),
                feather=8.0,
                tags=["forest", "shade"],
            )
        )

        tree_positions: List[Dict[str, float]] = []
        for _ in range(18):
            edge_side = rng.choice(["left", "right", "top"])
            if edge_side == "left":
                tree_positions.append({"x": rng.uniform(8, width * 0.22), "y": rng.uniform(10, height - 10)})
            elif edge_side == "right":
                tree_positions.append({"x": rng.uniform(width * 0.78, width - 8), "y": rng.uniform(10, height - 10)})
            else:
                tree_positions.append({"x": rng.uniform(10, width - 10), "y": rng.uniform(8, height * 0.2)})
        self.stamp_decals(overlay.id, detail.name, "pine_tree", tree_positions, scale=0.92, rotation=0.0, tags=["forest", "trees"])

    def _append_stream_feature(self, overlay: Overlay, rng: random.Random, width: float, height: float) -> None:
        detail = self._ensure_layer(overlay, "DetailOverlay", 20, "normal")
        weather = self._ensure_layer(overlay, "WeatherOverlay", 30, "screen")

        stream_points = [
            Point(x=width * 0.1, y=height * 0.18),
            Point(x=width * 0.28 + rng.uniform(-12, 12), y=height * 0.14),
            Point(x=width * 0.48 + rng.uniform(-14, 14), y=height * 0.2),
            Point(x=width * 0.68 + rng.uniform(-10, 10), y=height * 0.15),
            Point(x=width * 0.9, y=height * 0.22),
        ]
        detail.elements.append(
            Path(
                name="forest_stream",
                points=stream_points,
                stroke=StrokeStyle(color="#6da6cf", width=7.0, line_cap="round", line_join="round", width_profile=[0.85, 1.0, 1.08, 1.0, 0.9]),
                stroke_opacity=0.7,
                style_jitter=0.06,
                tags=["water", "stream", "difficult_terrain"],
            )
        )

        weather.elements.append(
            Path(
                name="stream_highlight",
                points=stream_points,
                stroke=StrokeStyle(color="#d2ecff", width=2.0, dash_array=[10, 14]),
                stroke_opacity=0.45,
                style_jitter=0.03,
                tags=["water", "highlight"],
            )
        )

    def generate_from_narrative(
        self,
        overlay_id: str,
        narrative: str,
        map_context: Optional[Dict] = None,
        style_id: str = 'default',
        seed: Optional[int] = None,
        replace: bool = True,
    ) -> Optional[Overlay]:
        """Generate overlay geometry from a freeform narrative prompt in one call."""
        overlay = self.get_overlay(overlay_id)
        if not overlay:
            return None

        width, height = self._map_bounds(map_context)
        resolved_seed = self._stable_seed(f"{overlay_id}|{narrative}|{style_id}", seed=seed)
        rng = random.Random(resolved_seed)

        if replace:
            for layer in overlay.layers:
                layer.elements = []

        text = (narrative or "").lower()
        tags: list[str] = []

        if any(k in text for k in ["battle", "siege", "war", "skirmish", "aftermath", "scorch", "blood"]):
            self._append_battle_marks(overlay, rng, width, height)
            tags.append("battle")

        if any(k in text for k in ["temple", "ancient", "ruins", "moss", "cracked stone", "rubble"]):
            self._append_temple_decay(overlay, rng, width, height)
            tags.append("ancient")

        if any(k in text for k in ["winter", "snow", "blizzard", "storm", "icy", "frost"]):
            self._append_winter_weather(overlay, rng, width, height)
            tags.append("winter")

        if any(k in text for k in ["cursed", "corrupt", "blight", "eldritch", "haunted", "dark fog", "vines"]):
            self._append_curse(overlay, rng, width, height)
            tags.append("cursed")

        if any(k in text for k in ["forest", "woods", "pine", "clearing", "canopy", "underbrush", "path", "trail", "earth", "needles"]):
            self._append_forest_scene(overlay, rng, width, height)
            tags.append("forest")

        if any(k in text for k in ["water", "stream", "river", "creek", "brook", "running water"]):
            self._append_stream_feature(overlay, rng, width, height)
            tags.append("water")

        # Fallback: if no cue matched, add a subtle detail trail so call always yields output.
        if not tags:
            detail = self._ensure_layer(overlay, "DetailOverlay", 20, "normal")
            detail.elements.append(
                Path(
                    name="narrative_trail",
                    points=[
                        Point(x=width * 0.1, y=height * 0.5),
                        Point(x=width * 0.5 + rng.uniform(-40, 40), y=height * 0.45 + rng.uniform(-30, 30)),
                        Point(x=width * 0.9, y=height * 0.55),
                    ],
                    stroke=StrokeStyle(color="#7a6648", width=4.0),
                    stroke_opacity=0.5,
                    style_jitter=0.1,
                    tags=["trail", "narrative_generated"],
                )
            )
            tags.append("generic")

        overlay.metadata["narrative_tags"] = tags
        overlay.metadata["seed"] = resolved_seed
        overlay.metadata["story_context"] = narrative
        overlay.metadata["style_id"] = style_id
        overlay.metadata["generated_at"] = datetime.now(UTC).isoformat().replace('+00:00', 'Z')

        return overlay


# Global API instance
overlay_api = OverlayAPI()
