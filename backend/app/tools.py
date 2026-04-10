"""Tool definitions exposed to Claude for DM actions, and dispatch logic."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any

from .map_catalog import build_automated_map, assign_terrain_atlas_sprites
from .map_engine import GameMap, MapEntity, build_map_from_data
from .rules.characters import Character
from .rules.combat import (
    CombatState,
    attack_roll,
    death_saving_throw,
    next_turn,
    roll_initiative,
)
from .rules.conditions import (
    apply_condition,
    get_attack_modifiers,
    get_condition_names,
    has_condition_effect,
    remove_condition,
    tick_conditions,
)
from .rules.dice import roll
from .rules.items import (
    calculate_ac_from_inventory,
    find_item_in_inventory,
    lookup_catalog_item,
)
from .rules.spells import (
    evaluate_cast_permission,
    get_spell_definition,
    initialize_spell_slots,
    restore_all_slots,
    use_spell_slot,
)
from .memory import CampaignMemory, NPCMemory, QuestMemory, LocationMemory

logger = logging.getLogger(__name__)


@dataclass
class SkillChallengeState:
    """Tracks an active skill challenge (successes/failures contest)."""

    title: str = ""
    success_threshold: int = 3
    failure_threshold: int = 3
    successes: int = 0
    failures: int = 0
    participants: list[str] = field(default_factory=list)

    @property
    def is_resolved(self) -> bool:
        return self.successes >= self.success_threshold or self.failures >= self.failure_threshold

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "success_threshold": self.success_threshold,
            "failure_threshold": self.failure_threshold,
            "successes": self.successes,
            "failures": self.failures,
            "participants": self.participants,
            "is_resolved": self.is_resolved,
        }


def _parse_env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default

_LEGACY_SPRITE_PIPELINE_ENABLED = str(os.getenv("OTDND_ENABLE_LEGACY_SPRITES", "0")).strip().lower() in {
    "1", "true", "yes", "on",
}

_ERR_NO_MAP = "No map loaded"


def _map_data_from_vector_payload(payload: dict[str, Any], description: str, override_entities: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    compatibility = payload.get("compatibility") if isinstance(payload.get("compatibility"), dict) else {}
    legacy_tiles = compatibility.get("legacy_tiles") if isinstance(compatibility.get("legacy_tiles"), dict) else {}
    legacy_entities = compatibility.get("legacy_entities") if isinstance(compatibility.get("legacy_entities"), dict) else {}
    overlay = payload.get("overlay") if isinstance(payload.get("overlay"), dict) else {}
    traversal_grid = payload.get("traversal_grid") if isinstance(payload.get("traversal_grid"), dict) else None
    hashes = payload.get("hashes") if isinstance(payload.get("hashes"), dict) else {}
    movement_model = payload.get("movement_model") if isinstance(payload.get("movement_model"), dict) else {}
    overlay_metadata = overlay.get("metadata") if isinstance(overlay.get("metadata"), dict) else {}

    map_data = {
        "width": int(legacy_tiles.get("width", 0)),
        "height": int(legacy_tiles.get("height", 0)),
        "tiles": list(legacy_tiles.get("tiles", [])),
        "entities": list(override_entities if override_entities is not None else legacy_entities.get("entities", [])),
        "traversal_grid": traversal_grid,
        "metadata": {
            "map_source": "ts_vector_forwarded",
            "map_id": overlay.get("map_id") or payload.get("map_id") or "ts_vector_forwarded",
            "grid_size": 5,
            "grid_units": "ft",
            "tile_size_px": 32,
            "cache_hit": False,
            "description": description,
            "hashes": hashes,
            "movement_model": movement_model,
            "rollout_flags": overlay_metadata.get("rollout_flags", {}),
            "overlay": overlay,
            "traversal_grid": traversal_grid,
        },
    }
    return map_data


def _strip_sprite_fields_from_map_payload(map_data: dict[str, Any]) -> dict[str, int]:
    removed = {
        "tile_sprite": 0,
        "tile_variant": 0,
        "entity_sprite": 0,
    }

    for tile in map_data.get("tiles", []):
        if isinstance(tile, dict):
            if "sprite" in tile:
                tile.pop("sprite", None)
                removed["tile_sprite"] += 1
            if "variant" in tile:
                tile.pop("variant", None)
                removed["tile_variant"] += 1

    for entity in map_data.get("entities", []):
        if not isinstance(entity, dict):
            continue
        sprite = entity.get("sprite")
        if isinstance(sprite, str) and sprite.strip() and sprite.strip().lower() != "default":
            removed["entity_sprite"] += 1
        entity["sprite"] = "default"

    return removed


def _assert_sprite_free_payload(map_data: dict[str, Any]) -> None:
    tile_has_sprite = any(
        isinstance(tile, dict) and (
            isinstance(tile.get("sprite"), str)
            or isinstance(tile.get("variant"), str)
        )
        for tile in map_data.get("tiles", [])
    )
    entity_has_nondefault_sprite = any(
        isinstance(entity, dict)
        and isinstance(entity.get("sprite"), str)
        and entity.get("sprite", "").strip().lower() not in {"", "default"}
        for entity in map_data.get("entities", [])
    )

    if tile_has_sprite or entity_has_nondefault_sprite:
        raise AssertionError("Legacy sprite payload detected while sprite pipeline is disabled")

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "roll_dice",
        "description": "Roll dice using standard notation (e.g. '2d6+3', 'd20', '4d8-1'). Use this for any dice roll.",
        "input_schema": {
            "type": "object",
            "properties": {
                "notation": {"type": "string", "description": "Dice notation like '1d20+5', '2d6', '4d6kh3'"},
            },
            "required": ["notation"],
        },
    },
    {
        "name": "check_ability",
        "description": "Make an ability check or saving throw for a character. Returns the roll result including modifiers.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string", "description": "ID of the character making the check"},
                "ability": {"type": "string", "enum": ["STR", "DEX", "CON", "INT", "WIS", "CHA"], "description": "The ability to check"},
                "dc": {"type": "integer", "description": "Difficulty class to beat"},
                "skill": {"type": "string", "description": "Optional skill name (e.g. 'Perception', 'Stealth')"},
                "is_saving_throw": {"type": "boolean", "description": "Whether this is a saving throw", "default": False},
                "justification": {"type": "string", "description": "Brief reason this check is being called (e.g. 'investigating the locked chest')"},
            },
            "required": ["character_id", "ability", "dc"],
        },
    },
    {
        "name": "attack",
        "description": "Make an attack roll from one character against another. Handles hit/miss, damage, and HP updates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "attacker_id": {"type": "string"},
                "target_id": {"type": "string"},
                "weapon_bonus": {"type": "integer", "default": 0, "description": "Extra attack bonus from weapon"},
                "damage_dice": {"type": "string", "default": "1d8", "description": "Damage dice notation"},
                "ability": {"type": "string", "enum": ["STR", "DEX"], "default": "STR"},
                "advantage": {"type": "boolean", "default": False},
                "disadvantage": {"type": "boolean", "default": False},
                "justification": {"type": "string", "description": "Brief reason for this attack (e.g. 'opportunity attack as enemy leaves reach')"},
            },
            "required": ["attacker_id", "target_id"],
        },
    },
    {
        "name": "apply_damage",
        "description": "Apply damage directly to a character (for traps, spells, environmental effects).",
        "input_schema": {
            "type": "object",
            "properties": {
                "target_id": {"type": "string"},
                "amount": {"type": "integer", "description": "Amount of damage"},
                "damage_type": {"type": "string", "description": "Type of damage (fire, piercing, etc.)"},
            },
            "required": ["target_id", "amount"],
        },
    },
    {
        "name": "heal_character",
        "description": "Heal a character for a given amount of HP.",
        "input_schema": {
            "type": "object",
            "properties": {
                "target_id": {"type": "string"},
                "amount": {"type": "integer"},
            },
            "required": ["target_id", "amount"],
        },
    },
    {
        "name": "start_combat",
        "description": "Start combat and roll initiative for all specified characters.",
        "input_schema": {
            "type": "object",
            "properties": {
                "participant_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "IDs of all characters entering combat",
                },
            },
            "required": ["participant_ids"],
        },
    },
    {
        "name": "next_turn",
        "description": "Advance to the next turn in combat.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "end_combat",
        "description": "End the current combat encounter.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_character",
        "description": "Get full details of a character including stats, HP, inventory, and conditions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
            },
            "required": ["character_id"],
        },
    },
    {
        "name": "cast_spell",
        "description": "Cast a spell, expending a spell slot. Returns the slot usage result.",
        "input_schema": {
            "type": "object",
            "properties": {
                "caster_id": {"type": "string"},
                "spell_name": {"type": "string", "description": "Name of the spell being cast"},
                "slot_level": {"type": "integer", "description": "Spell slot level to expend (0 for cantrips)"},
                "target_id": {"type": "string", "description": "Target character ID (if applicable)"},
            },
            "required": ["caster_id", "spell_name", "slot_level"],
        },
    },
    {
        "name": "long_rest",
        "description": "Perform a long rest for a character, restoring HP and spell slots.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
            },
            "required": ["character_id"],
        },
    },
    {
        "name": "generate_map",
        "description": "Generate or select a new map grid automatically. If tiles are provided, they are used directly. Otherwise, the system auto-selects a library map or generates one based on context.",
        "input_schema": {
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "Vivid narrative description of the scene the players see. This text is used to generate the battlemap image, so it MUST match the narration you just delivered. Include key visual elements: terrain, lighting, weather, structures, and atmosphere.",
                },
                "location": {
                    "type": "string",
                    "enum": ["forest", "swamp", "dungeon", "city_alley", "tavern", "ruins", "mountain", "coastal"],
                    "description": "Map location type that best matches the scene.",
                },
                "biome": {
                    "type": "string",
                    "enum": ["temperate", "tropical", "arctic", "underground", "urban", "magical"],
                    "description": "Climate/biome of the scene.",
                },
                "mood_style": {
                    "type": "string",
                    "enum": ["hand-drawn", "painterly", "parchment", "gritty", "high-fantasy", "realistic"],
                    "description": "Visual art style for the generated battlemap image.",
                },
                "notable_features": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Key visual landmarks to depict on the map (e.g. 'fallen stone columns', 'glowing runes on the floor', 'a frozen lake'). Max 6 items.",
                },
                "encounter_type": {
                    "type": "string",
                    "enum": ["ambush", "siege", "chase", "investigation", "diplomacy", "exploration"],
                    "description": "Tactical encounter type that shapes the map layout.",
                },
                "environment": {"type": "string", "description": "Deprecated; use location instead. Environment hint (dungeon/forest/tavern/cave/city)"},
                "terrain_theme": {
                    "type": "string",
                    "description": "Optional terrain style hint (e.g. ruined/overgrown/ancient/volcanic/frozen/flooded/arcane)",
                },
                "encounter_scale": {"type": "string", "description": "Optional scale hint (small/medium/large)"},
                "tactical_tags": {
                    "type": "array",
                    "description": "Optional tactical tags for grid layout (cover/chokepoints/line_of_sight/flanking)",
                    "items": {"type": "string"},
                },
                "width": {"type": "integer", "description": "Map width in tiles (5-40)", "default": 30},
                "height": {"type": "integer", "description": "Map height in tiles (5-30)", "default": 21},
                "tiles": {
                    "type": "array",
                    "description": "Array of tile objects with x, y, type (wall/floor/door/water/pit/pillar/stairs_up/stairs_down/rubble), and optional state",
                    "items": {
                        "type": "object",
                        "properties": {
                            "x": {"type": "integer"},
                            "y": {"type": "integer"},
                            "type": {"type": "string"},
                            "state": {"type": "string"},
                        },
                        "required": ["x", "y", "type"],
                    },
                },
                "entities": {
                    "type": "array",
                    "description": "NPCs, monsters, objects to place on the map",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "name": {"type": "string"},
                            "x": {"type": "integer"},
                            "y": {"type": "integer"},
                            "type": {"type": "string", "enum": ["pc", "npc", "enemy", "object"]},
                            "sprite": {"type": "string"},
                        },
                        "required": ["id", "name", "x", "y", "type"],
                    },
                },
                "location_name": {
                    "type": "string",
                    "description": (
                        "Canonical name of this location (e.g. 'Riverside Tavern', 'Goblin Caves Level 1'). "
                        "If the party has visited before, setting this restores the same map layout from memory."
                    ),
                },
                "layout_hints": {
                    "type": "object",
                    "description": "Optional hints to guide procedural map layout. Soft constraints — invalid hints are ignored.",
                    "properties": {
                        "rooms": {
                            "type": "array",
                            "description": "Desired rooms with hints for size and position",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "label": {"type": "string", "description": "Room name, e.g. 'throne room'"},
                                    "size": {"type": "string", "enum": ["small", "medium", "large"]},
                                    "position_hint": {
                                        "type": "string",
                                        "enum": ["center", "north", "south", "east", "west"],
                                        "description": "Approximate position on the map",
                                    },
                                },
                                "required": ["label"],
                            },
                        },
                        "key_features": {
                            "type": "array",
                            "description": "Important terrain features to place",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "type": {"type": "string", "description": "Feature type (pit/water/pillar/chest/rubble)"},
                                    "near_room": {"type": "string", "description": "Label of room to place near"},
                                    "placement": {"type": "string", "enum": ["entrance", "center", "corner"]},
                                },
                                "required": ["type"],
                            },
                        },
                        "connectivity": {
                            "type": "string",
                            "enum": ["linear", "hub_and_spoke", "loop"],
                            "description": "How rooms connect to each other",
                        },
                    },
                },
            },
            "required": ["description"],
        },
    },
    {
        "name": "place_entity",
        "description": "Add an NPC, monster, or object to the current map.",
        "input_schema": {
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "name": {"type": "string"},
                "x": {"type": "integer"},
                "y": {"type": "integer"},
                "entity_type": {"type": "string", "enum": ["pc", "npc", "enemy", "object"]},
                "sprite": {
                    "type": "string",
                    "default": "default",
                    "description": "Optional sprite override. Supports manifest keys (e.g. enemy_goblin), environment atlas keys (e.g. env:stone floor), and monster atlas keys (e.g. monster:black_dragon_03 for exact frame).",
                },
                "blocks_movement": {"type": "boolean", "description": "Whether this entity blocks token movement", "default": True},
                "prop_category": {"type": "string", "description": "Optional prop category label such as obstacle/decorative"},
            },
            "required": ["id", "name", "x", "y", "entity_type"],
        },
    },
    {
        "name": "move_entity",
        "description": "Move an entity (NPC/monster) to a new position on the map.",
        "input_schema": {
            "type": "object",
            "properties": {
                "entity_id": {"type": "string"},
                "x": {"type": "integer"},
                "y": {"type": "integer"},
            },
            "required": ["entity_id", "x", "y"],
        },
    },
    {
        "name": "remove_entity",
        "description": "Remove an entity from the map (death, looted chest, etc.).",
        "input_schema": {
            "type": "object",
            "properties": {
                "entity_id": {"type": "string"},
            },
            "required": ["entity_id"],
        },
    },
    {
        "name": "record_npc",
        "description": "Record or update an NPC in campaign memory for long-term tracking.",
        "input_schema": {
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "name": {"type": "string"},
                "race": {"type": "string", "default": "Unknown"},
                "role": {"type": "string", "description": "NPC's role (innkeeper, quest giver, villain, etc.)"},
                "location": {"type": "string"},
                "disposition": {"type": "string", "enum": ["hostile", "unfriendly", "neutral", "friendly", "allied"]},
                "note": {"type": "string", "description": "A note about recent interactions"},
                "tts_voice": {"type": "string", "enum": ["alloy", "echo", "fable", "onyx", "nova", "shimmer"], "description": "OpenAI TTS voice for this NPC's speech"},
                "secret": {"type": "string", "description": "A DM-only secret about this NPC (never revealed to players)"},
                "relationship": {
                    "type": "object",
                    "description": "A relationship this NPC has with another character or faction",
                    "properties": {
                        "target": {"type": "string", "description": "Name or ID of the other person/faction"},
                        "description": {"type": "string", "description": "Nature of the relationship, e.g. 'estranged sister', 'owes a debt to'"},
                    },
                    "required": ["target", "description"],
                },
                "last_spoke_session": {"type": "integer", "description": "Session number when party last interacted with this NPC"},
            },
            "required": ["id", "name"],
        },
    },
    {
        "name": "record_quest",
        "description": "Record or update a quest in campaign memory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "status": {"type": "string", "enum": ["active", "completed", "failed", "abandoned"]},
                "objectives": {"type": "array", "items": {"type": "string"}},
                "complete_objective": {"type": "string", "description": "Objective text to mark as completed"},
            },
            "required": ["id", "title"],
        },
    },
    {
        "name": "record_event",
        "description": "Record a notable world event in campaign memory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "description": {"type": "string"},
                "importance": {"type": "string", "enum": ["minor", "major", "critical"]},
            },
            "required": ["description"],
        },
    },
    {
        "name": "give_item",
        "description": "Add an item to a character's inventory. Use when awarding loot, purchasing gear, or finding items. Specify the item by its SRD name or catalog ID (e.g. 'longsword', 'healing_potion', 'thieves_tools').",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string", "description": "ID of the character receiving the item"},
                "item_id": {"type": "string", "description": "Item catalog ID or name (e.g. 'longsword', 'Potion of Healing', 'chain_mail')"},
                "quantity": {"type": "integer", "default": 1, "description": "Number of items to add"},
                "notes": {"type": "string", "default": "", "description": "Optional notes, e.g. 'found in dragon hoard'"},
                "magical": {"type": "boolean", "default": False, "description": "True if this is a magical item"},
                "rarity": {"type": "string", "enum": ["common", "uncommon", "rare", "very_rare", "legendary", "artifact"], "description": "Magic item rarity"},
                "requires_attunement": {"type": "boolean", "default": False, "description": "True if attuning is required to use the item"},
            },
            "required": ["character_id", "item_id"],
        },
    },
    {
        "name": "remove_item",
        "description": "Remove an item from a character's inventory (consumed, lost, sold, destroyed).",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "item_id": {"type": "string", "description": "Item catalog ID or name"},
                "quantity": {"type": "integer", "default": 1, "description": "Number to remove. Use -1 to remove all."},
            },
            "required": ["character_id", "item_id"],
        },
    },
    {
        "name": "equip_item",
        "description": "Equip or unequip an item for a character. Equipping armor automatically recalculates AC. Only one weapon and one armor can be equipped at a time.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "item_id": {"type": "string", "description": "Item catalog ID or name to equip/unequip"},
                "equip": {"type": "boolean", "default": True, "description": "True to equip, False to unequip"},
            },
            "required": ["character_id", "item_id"],
        },
    },
    {
        "name": "grant_inspiration",
        "description": "Grant a character Bardic Inspiration or D&D Inspiration token. Use to reward excellent roleplay, clever thinking, or heroic deeds. A character can only hold one inspiration at a time.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string", "description": "ID of the character receiving inspiration"},
                "reason": {"type": "string", "description": "Optional reason (e.g. 'exceptional roleplay', 'clever plan')"},
            },
            "required": ["character_id"],
        },
    },
    {
        "name": "give_gold",
        "description": "Add gold (GP) to a character's purse. Use when awarding loot, quest rewards, or selling items.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string", "description": "ID of the character receiving gold"},
                "amount": {"type": "integer", "description": "Amount of gold pieces to add"},
                "reason": {"type": "string", "description": "Optional reason (e.g. 'sold sword', 'quest reward')"},
            },
            "required": ["character_id", "amount"],
        },
    },
    {
        "name": "spend_gold",
        "description": "Deduct gold (GP) from a character's purse. Use when purchasing items or paying costs.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string", "description": "ID of the character spending gold"},
                "amount": {"type": "integer", "description": "Amount of gold pieces to deduct"},
                "reason": {"type": "string", "description": "Optional reason (e.g. 'bought healing potion', 'paid innkeeper')"},
            },
            "required": ["character_id", "amount"],
        },
    },
    {
        "name": "update_tile",
        "description": "Change a tile on the map (open a door, collapse a wall, etc.).",
        "input_schema": {
            "type": "object",
            "properties": {
                "x": {"type": "integer"},
                "y": {"type": "integer"},
                "tile_type": {"type": "string"},
                "state": {"type": "string"},
                "sprite": {"type": "string", "description": "Optional atlas key such as 'env:grass'"},
            },
            "required": ["x", "y", "tile_type"],
        },
    },
    {
        "name": "short_rest",
        "description": "Perform a short rest for a character, spending hit dice to recover HP. Warlocks and Monks also recover certain features.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "hit_dice_to_spend": {
                    "type": "integer",
                    "description": "Number of hit dice to spend for HP recovery (1 to character_level)",
                },
            },
            "required": ["character_id", "hit_dice_to_spend"],
        },
    },
    {
        "name": "use_class_resource",
        "description": "Use one charge of a class resource (e.g. Rage, Ki, Channel Divinity, Bardic Inspiration, Wild Shape, Sorcery Points). The resource is restored on short or long rest depending on the resource type.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "resource_name": {"type": "string", "description": "Name of the class resource to spend (e.g. 'Rage', 'Ki', 'Channel Divinity')"},
            },
            "required": ["character_id", "resource_name"],
        },
    },
    {
        "name": "give_xp",
        "description": "Award XP to a character. Use after defeating enemies or completing major objectives.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "amount": {"type": "integer", "description": "XP to award"},
                "reason": {"type": "string", "description": "Why XP is being awarded"},
            },
            "required": ["character_id", "amount"],
        },
    },
    {
        "name": "level_up",
        "description": "Level up a character after they've accumulated enough XP. Increases level, adds HP, updates spell slots and class features. For multiclassing, pass class_name to level up in a different class.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "use_average_hp": {
                    "type": "boolean",
                    "description": "If true, take the average HP increase instead of rolling. Defaults to true.",
                },
                "class_name": {
                    "type": "string",
                    "description": "Class to gain the level in. Omit to level up in the character's current/primary class. Set to a different class to multiclass.",
                },
            },
            "required": ["character_id"],
        },
    },
    {
        "name": "reveal_area",
        "description": "Reveal map area around a character or specific tiles, updating fog of war.",
        "input_schema": {
            "type": "object",
            "properties": {
                "entity_id": {
                    "type": "string",
                    "description": "Entity ID whose position is used as the center of the reveal (optional)",
                },
                "tiles": {
                    "type": "array",
                    "description": "Specific coordinates to reveal",
                    "items": {
                        "type": "object",
                        "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}},
                        "required": ["x", "y"],
                    },
                },
                "vision_radius": {
                    "type": "integer",
                    "description": "Vision radius in tiles when using entity_id (default 8)",
                },
            },
        },
    },
    {
        "name": "generate_loot",
        "description": "Generate a loot table for a defeated encounter and optionally award it to a character.",
        "input_schema": {
            "type": "object",
            "properties": {
                "encounter_strength": {
                    "type": "string",
                    "enum": ["trivial", "easy", "medium", "hard", "deadly"],
                    "description": "Strength of the defeated encounter",
                },
                "award_to": {
                    "type": "string",
                    "description": "Character ID to award loot to. If omitted, loot is described but not awarded.",
                },
                "gold_multiplier": {
                    "type": "number",
                    "description": "Multiplier for gold rewards (default 1.0)",
                },
            },
            "required": ["encounter_strength"],
        },
    },
    {
        "name": "open_shop",
        "description": "Generate a shop inventory for players to browse and purchase from a merchant.",
        "input_schema": {
            "type": "object",
            "properties": {
                "shop_type": {
                    "type": "string",
                    "enum": ["general", "weapons", "armor", "magic", "potions", "blacksmith"],
                    "description": "Type of shop",
                },
                "shop_name": {
                    "type": "string",
                    "description": "Name of the shop or merchant",
                },
                "settlement_size": {
                    "type": "string",
                    "enum": ["hamlet", "village", "town", "city", "metropolis"],
                    "description": "Settlement size — affects stock variety and price range",
                },
            },
            "required": ["shop_type"],
        },
    },
    {
        "name": "start_skill_challenge",
        "description": (
            "Begin a skill challenge — a structured multi-roll contest where the party "
            "must accumulate successes before accumulating too many failures. Use for "
            "heists, chases, rituals, negotiations, and other multi-step challenges. "
            "After starting, use check_ability for each participant attempt and narrate progress."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Name of the challenge e.g. 'Chase Through Waterdeep'",
                },
                "success_threshold": {
                    "type": "integer",
                    "description": "Number of successes needed to win (typically 3-6)",
                },
                "failure_threshold": {
                    "type": "integer",
                    "description": "Number of failures that cause defeat (typically 3)",
                },
                "participants": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Character IDs participating in the challenge",
                },
            },
            "required": ["title", "success_threshold", "failure_threshold"],
        },
    },
    {
        "name": "request_player_roll",
        "description": (
            "Request that a player character rolls their own dice for an attack roll, ability check, or saving throw. "
            "Use this tool instead of attack, roll_dice, or check_ability whenever the action belongs to a player character (PC). "
            "Monsters, NPCs, environmental hazards, traps, and any hidden or behind-the-scenes checks are still rolled by the DM using the other tools."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {
                    "type": "string",
                    "description": "ID of the player character who needs to roll",
                },
                "label": {
                    "type": "string",
                    "description": "Short label for the roll, e.g. 'Attack Roll', 'Stealth Check', 'CON Saving Throw'",
                },
                "dice": {
                    "type": "string",
                    "description": "Die to roll, e.g. 'd20'",
                },
                "modifier": {
                    "type": "integer",
                    "description": "Total modifier to add to the die result (from ability score, proficiency bonus, etc.)",
                },
                "context": {
                    "type": "string",
                    "description": "What this roll is for, e.g. 'Melee attack against the Goblin (AC 13)'",
                },
            },
            "required": ["character_id", "label", "dice", "modifier", "context"],
        },
    },
    {
        "name": "summarize_session",
        "description": (
            "Record a 2-3 sentence summary of what happened this session. "
            "Call this at natural session breakpoints (long rest, end of session, major milestone) "
            "so the party's progress is preserved across sessions."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "2-3 sentence summary of this session's key events and outcomes",
                },
            },
            "required": ["summary"],
        },
    },
    {
        "name": "advance_time",
        "description": (
            "Advance the in-game world clock. Use when time passes narratively: "
            "travel, resting, waiting, or after a major event. "
            "Days roll over automatically. Always include a reason."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "hours": {"type": "integer", "description": "Hours to advance (0-23)", "default": 0},
                "minutes": {"type": "integer", "description": "Minutes to advance (0-59)", "default": 0},
                "reason": {"type": "string", "description": "Narrative reason for the time passing, e.g. 'The party takes a long rest'"},
            },
            "required": ["reason"],
        },
    },
    {
        "name": "modify_terrain",
        "description": (
            "Change terrain when narrative events alter the map: explosions, collapses, "
            "flooding, freezing water, magical effects, opening secret doors, etc. "
            "Provide a reason so the change is narrated to players."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "x": {"type": "integer", "description": "Tile X coordinate"},
                "y": {"type": "integer", "description": "Tile Y coordinate"},
                "new_type": {
                    "type": "string",
                    "enum": ["floor", "wall", "door", "water", "pit", "pillar", "rubble",
                             "stairs_up", "stairs_down", "chest"],
                    "description": "New tile type",
                },
                "reason": {
                    "type": "string",
                    "description": "Narrative reason for the change, e.g. 'The floor collapses into a pit'",
                },
            },
            "required": ["x", "y", "new_type", "reason"],
        },
    },
    {
        "name": "spawn_reinforcements",
        "description": (
            "Spawn enemy reinforcements at a logical entry point on the map. "
            "Use when enemies call for backup, reinforcements arrive narratively, "
            "or a new wave of foes appears. Entities are placed near the specified "
            "edge or nearest door."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "creatures": {
                    "type": "array",
                    "description": "List of creatures to spawn",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "Creature name, e.g. 'Goblin Archer'"},
                            "id": {"type": "string", "description": "Unique entity ID, e.g. 'goblin_archer_3'"},
                        },
                        "required": ["name", "id"],
                    },
                },
                "entry_direction": {
                    "type": "string",
                    "enum": ["N", "S", "E", "W", "nearest_door"],
                    "description": "Where reinforcements enter from",
                },
            },
            "required": ["creatures", "entry_direction"],
        },
    },
    {
        "name": "populate_encounter",
        "description": (
            "Place enemies tactically on the current map for a combat encounter. "
            "Uses map analysis to position enemies at cover, chokepoints, or guard "
            "positions. Prefer this over placing entities one-by-one for combat setup."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "enemies": {
                    "type": "array",
                    "description": "Enemies to place on the map",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string", "description": "Unique entity ID"},
                            "name": {"type": "string", "description": "Creature name"},
                        },
                        "required": ["id", "name"],
                    },
                },
                "placement_strategy": {
                    "type": "string",
                    "enum": ["tactical", "scattered", "guarding"],
                    "description": (
                        "tactical: place behind cover and at chokepoints. "
                        "scattered: distribute evenly across the map. "
                        "guarding: place near doors, stairs, and chests."
                    ),
                },
            },
            "required": ["enemies", "placement_strategy"],
        },
    },
    {
        "name": "apply_condition",
        "description": "Apply a D&D 5e condition to a character (e.g. Blinded, Frightened, Stunned, Prone). Mechanical effects are automatically enforced on subsequent rolls.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "condition": {
                    "type": "string",
                    "enum": ["Blinded", "Charmed", "Deafened", "Frightened", "Grappled",
                             "Incapacitated", "Invisible", "Paralyzed", "Petrified",
                             "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"],
                    "description": "The condition to apply",
                },
                "duration_rounds": {
                    "type": "integer",
                    "description": "Number of rounds the condition lasts. Omit for indefinite (until removed).",
                },
            },
            "required": ["character_id", "condition"],
        },
    },
    {
        "name": "remove_condition",
        "description": "Remove a condition from a character.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "condition": {"type": "string", "description": "The condition to remove"},
            },
            "required": ["character_id", "condition"],
        },
    },
    {
        "name": "resolve_aoe",
        "description": "Determine which map entities fall within an area of effect. Returns entity IDs and names of all creatures in the area. Use before applying damage/effects to each target.",
        "input_schema": {
            "type": "object",
            "properties": {
                "origin_x": {"type": "integer", "description": "X coordinate of AoE origin/center"},
                "origin_y": {"type": "integer", "description": "Y coordinate of AoE origin/center"},
                "shape": {
                    "type": "string",
                    "enum": ["sphere", "circle", "cube", "cone", "line", "cylinder"],
                    "description": "Shape of the area of effect",
                },
                "size": {
                    "type": "integer",
                    "description": "Size in feet (radius for sphere/circle/cylinder, side for cube, length for cone/line)",
                },
                "direction_x": {"type": "integer", "description": "X direction for cone/line (relative to origin). Optional."},
                "direction_y": {"type": "integer", "description": "Y direction for cone/line (relative to origin). Optional."},
                "exclude_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Entity IDs to exclude (e.g. the caster for Fireball's Sculpt Spells)",
                },
            },
            "required": ["origin_x", "origin_y", "shape", "size"],
        },
    },
    {
        "name": "choose_feat",
        "description": "Grant a feat to a character at an ASI level (4, 8, 12, 16, 19). The feat's mechanical effects are applied automatically.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "feat_name": {"type": "string", "description": "Name of the feat to grant"},
            },
            "required": ["character_id", "feat_name"],
        },
    },
    {
        "name": "choose_asi",
        "description": "Apply an Ability Score Improvement at an ASI level. Either +2 to one ability or +1 to two abilities.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "increases": {
                    "type": "object",
                    "description": "Map of ability name to increase amount. e.g. {\"STR\": 2} or {\"DEX\": 1, \"CON\": 1}",
                    "additionalProperties": {"type": "integer"},
                },
            },
            "required": ["character_id", "increases"],
        },
    },
    {
        "name": "use_reaction",
        "description": "Consume a character's reaction for the round (e.g. for opportunity attack, Shield, Counterspell). The character cannot react again until their next turn.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string", "description": "ID of the character using their reaction"},
                "reaction_type": {"type": "string", "description": "What the reaction is being used for (e.g. 'opportunity_attack', 'Shield', 'Counterspell')"},
            },
            "required": ["character_id"],
        },
    },
    {
        "name": "travel",
        "description": (
            "Resolve overland travel between locations. Automatically advances time, "
            "rolls weather, checks for random encounters, and calculates distance. "
            "Use this instead of advance_time when the party travels."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "destination": {"type": "string", "description": "Where the party is heading"},
                "terrain": {
                    "type": "string",
                    "enum": ["road", "plains", "forest", "hills", "mountains", "swamp", "desert", "arctic", "coast", "jungle", "underdark"],
                    "description": "Primary terrain type for the route",
                },
                "pace": {
                    "type": "string",
                    "enum": ["fast", "normal", "slow"],
                    "description": "Travel pace. Fast: 30 mi/day (no stealth). Normal: 24 mi/day. Slow: 18 mi/day (can stealth).",
                    "default": "normal",
                },
                "hours": {"type": "integer", "description": "Hours of travel (default 8)", "default": 8},
                "climate": {
                    "type": "string",
                    "enum": ["temperate", "tropical", "arctic", "desert", "coastal", "mountain", "underground"],
                    "description": "Climate for weather roll",
                    "default": "temperate",
                },
            },
            "required": ["destination", "terrain"],
        },
    },
    {
        "name": "forage",
        "description": "A character forages for food and water. Makes a Survival check against the terrain DC.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "terrain": {
                    "type": "string",
                    "enum": ["road", "plains", "forest", "hills", "mountains", "swamp", "desert", "arctic", "coast", "jungle", "underdark"],
                },
            },
            "required": ["character_id", "terrain"],
        },
    },
    {
        "name": "set_weather",
        "description": "Manually set the current weather condition, or roll randomly for a climate.",
        "input_schema": {
            "type": "object",
            "properties": {
                "weather": {"type": "string", "description": "Weather condition to set (e.g. 'rain', 'storm', 'clear')"},
                "climate": {
                    "type": "string",
                    "enum": ["temperate", "tropical", "arctic", "desert", "coastal", "mountain", "underground"],
                    "description": "If provided without weather, rolls random weather for this climate",
                },
            },
        },
    },
    {
        "name": "record_faction",
        "description": "Record or update a faction in the campaign codex. Tracks reputation and disposition.",
        "input_schema": {
            "type": "object",
            "properties": {
                "faction_id": {"type": "string", "description": "Unique ID (snake_case)"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "reputation": {"type": "integer", "description": "Starting reputation (-100 to 100, default 0)"},
                "known_members": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "NPC names or IDs known to belong to this faction",
                },
            },
            "required": ["faction_id", "name"],
        },
    },
    {
        "name": "adjust_reputation",
        "description": "Change party reputation with a faction. Positive = improved standing, negative = worsened. Disposition auto-updates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "faction_id": {"type": "string"},
                "amount": {"type": "integer", "description": "Reputation change (-100 to 100)"},
                "reason": {"type": "string", "description": "Why reputation changed"},
            },
            "required": ["faction_id", "amount", "reason"],
        },
    },
    {
        "name": "assess_encounter",
        "description": (
            "Calculate the difficulty of a planned encounter before spawning enemies. "
            "Returns easy/medium/hard/deadly rating and XP analysis."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "monster_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of monster names (repeat for multiples, e.g. ['Goblin', 'Goblin', 'Bugbear'])",
                },
            },
            "required": ["monster_names"],
        },
    },
    {
        "name": "suggest_encounter",
        "description": (
            "Get a balanced monster roster suggestion for the current party. "
            "Specify desired difficulty and optionally terrain for thematic monsters."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "difficulty": {
                    "type": "string",
                    "enum": ["easy", "medium", "hard", "deadly"],
                    "description": "Desired encounter difficulty",
                    "default": "medium",
                },
                "terrain": {
                    "type": "string",
                    "enum": ["forest", "plains", "mountains", "swamp", "desert", "underdark", "arctic", "coast"],
                    "description": "Optional terrain for thematic monster selection",
                },
            },
        },
    },
]


class ToolDispatcher:
    """Executes tool calls from Claude against game state."""

    def __init__(
        self,
        characters: dict[str, Character],
        game_map: GameMap | None,
        combat: CombatState | None,
        memory: CampaignMemory | None = None,
        skill_challenge: SkillChallengeState | None = None,
    ):
        self.characters = characters
        self.game_map = game_map
        self.combat = combat
        self.memory = memory or CampaignMemory()
        self.skill_challenge = skill_challenge

    def dispatch(self, tool_name: str, tool_input: dict) -> dict[str, Any]:
        handler = getattr(self, f"_tool_{tool_name}", None)
        if handler is None:
            return {"error": f"Unknown tool: {tool_name}"}
        try:
            return handler(tool_input)
        except Exception as e:
            return {"error": str(e)}

    def _tool_roll_dice(self, inp: dict) -> dict:
        result = roll(inp["notation"])
        return result.to_dict()

    def _tool_check_ability(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}

        skill = inp.get("skill")
        if skill:
            mod = char.skill_modifier(skill)
        else:
            mod = char.ability_modifier(inp["ability"])
            if inp.get("is_saving_throw") and inp["ability"] in self._get_save_proficiencies(char):
                mod += char.proficiency_bonus

        dice_result = roll("1d20")
        total = dice_result.total + mod
        dc = inp["dc"]
        success = total >= dc

        return {
            "character": char.name,
            "ability": inp["ability"],
            "skill": skill,
            "roll": dice_result.rolls[0],
            "modifier": mod,
            "total": total,
            "dc": dc,
            "success": success,
            "message": f"{char.name} {'succeeds' if success else 'fails'} ({total} vs DC {dc})",
        }

    def _get_save_proficiencies(self, char: Character) -> list[str]:
        from .rules.characters import CLASSES
        cls_data = CLASSES.get(char.char_class, {})
        return cls_data.get("saving_throws", [])

    def _get_participant(self, char_id: str):
        """Return the CombatParticipant for char_id, or None if not found/in combat."""
        if not self.combat or not self.combat.is_active:
            return None
        for p in self.combat.participants:
            if p.character.id == char_id:
                return p
        return None

    def _check_concentration_after_damage(self, char_id: str, damage: int) -> dict | None:
        """Roll CON save for concentration. Clears concentration on failure. Returns result dict or None."""
        participant = self._get_participant(char_id)
        if not participant or not participant.concentrating_on:
            return None
        dc = max(10, damage // 2)
        char = participant.character
        con_mod = char.ability_modifier("CON")
        has_prof = "CON" in self._get_save_proficiencies(char)
        mod = con_mod + (char.proficiency_bonus if has_prof else 0)
        dice_result = roll("1d20")
        total = dice_result.total + mod
        success = total >= dc
        spell_name = participant.concentrating_on
        if not success:
            participant.concentrating_on = None
            char.concentration_spell = None
        return {
            "concentration_check": True,
            "spell": spell_name,
            "dc": dc,
            "roll": dice_result.rolls[0],
            "modifier": mod,
            "total": total,
            "success": success,
            "message": (
                f"{char.name} {'maintains' if success else 'loses'} concentration on "
                f"{spell_name} (CON save {total} vs DC {dc})"
            ),
        }

    def _tool_attack(self, inp: dict) -> dict:
        attacker = self.characters.get(inp["attacker_id"])
        target = self.characters.get(inp["target_id"])
        if not attacker:
            return {"error": f"Attacker {inp['attacker_id']} not found"}
        if not target:
            return {"error": f"Target {inp['target_id']} not found"}

        # Auto-compute advantage/disadvantage from conditions
        is_melee = inp.get("ability", "STR") == "STR"
        cond_adv, cond_disadv = get_attack_modifiers(attacker, target, is_melee=is_melee)
        advantage = inp.get("advantage", False) or cond_adv
        disadvantage = inp.get("disadvantage", False) or cond_disadv

        result = attack_roll(
            attacker=attacker,
            target=target,
            weapon_bonus=inp.get("weapon_bonus", 0),
            damage_notation=inp.get("damage_dice", "1d8"),
            ability=inp.get("ability", "STR"),
            advantage=advantage,
            disadvantage=disadvantage,
        )

        # Note condition-derived modifiers in result
        if cond_adv or cond_disadv:
            result["condition_advantage"] = cond_adv
            result["condition_disadvantage"] = cond_disadv

        dmg = result.get("damage") or 0
        if dmg > 0:
            conc = self._check_concentration_after_damage(inp["target_id"], dmg)
            if conc:
                result["concentration_check"] = conc
        return result

    def _tool_apply_damage(self, inp: dict) -> dict:
        target = self.characters.get(inp["target_id"])
        if not target:
            return {"error": f"Target {inp['target_id']} not found"}
        result = target.take_damage(inp["amount"])
        result["target"] = target.name
        result["damage_type"] = inp.get("damage_type", "untyped")
        dmg = result.get("damage_taken") or 0
        if dmg > 0:
            conc = self._check_concentration_after_damage(inp["target_id"], dmg)
            if conc:
                result["concentration_check"] = conc
        # Auto-break concentration if dropped to 0 HP
        if target.hp <= 0 and target.concentration_spell:
            result["concentration_broken"] = target.concentration_spell
            target.concentration_spell = None
            participant = self._get_participant(inp["target_id"])
            if participant:
                participant.concentrating_on = None
        return result

    def _tool_heal_character(self, inp: dict) -> dict:
        target = self.characters.get(inp["target_id"])
        if not target:
            return {"error": f"Target {inp['target_id']} not found"}
        result = target.heal(inp["amount"])
        result["target"] = target.name
        return result

    def _tool_start_combat(self, inp: dict) -> dict:
        chars = []
        for cid in inp["participant_ids"]:
            char = self.characters.get(cid)
            if char:
                chars.append(char)
        if not chars:
            return {"error": "No valid participants"}

        self.combat = roll_initiative(chars)
        return self.combat.to_dict()

    def _tool_next_turn(self, _inp: dict) -> dict:
        if not self.combat or not self.combat.is_active:
            return {"error": "No active combat"}
        result = next_turn(self.combat)
        # Tick duration-based conditions on the new participant
        current = self.combat.current_participant
        if current:
            expired = tick_conditions(current.character)
            if expired:
                result["expired_conditions"] = [c["name"] for c in expired]
        return result

    def _apply_concentration(
        self, caster_id: str, caster: "Character", spell_name: str, result: dict,
    ) -> None:
        """Update concentration tracking on caster and combat participant."""
        participant = self._get_participant(caster_id)
        if participant:
            if participant.concentrating_on:
                result["concentration_dropped"] = participant.concentrating_on
            participant.concentrating_on = spell_name
        caster.concentration_spell = spell_name
        result["concentration"] = True
        result["concentration_spell"] = spell_name

    def _update_existing_npc(self, existing: "NPCMemory", inp: dict) -> None:
        """Apply partial updates from inp onto an existing NPC record."""
        if "location" in inp: existing.location = inp["location"]
        if "disposition" in inp: existing.disposition = inp["disposition"]
        if "role" in inp: existing.role = inp["role"]
        if "note" in inp: existing.notes.append(inp["note"])
        if "tts_voice" in inp: existing.tts_voice = inp["tts_voice"]
        if "secret" in inp: existing.secrets.append(inp["secret"])
        if "relationship" in inp:
            rel = inp["relationship"]
            existing.relationships[rel["target"]] = rel["description"]
        if "last_spoke_session" in inp: existing.last_spoke_session = inp["last_spoke_session"]

    def _award_loot_to_character(
        self, char: "Character", gold: int, loot_items: list[dict],
    ) -> None:
        """Add gold and loot items directly to a character's inventory."""
        char.gold_gp = getattr(char, "gold_gp", 0) + gold
        for li in loot_items:
            item = lookup_catalog_item(li["id"])
            if item:
                entry = item.to_dict()
                entry["quantity"] = 1
                entry["notes"] = "Found as loot"
                char.inventory.append(entry)

    def _tool_end_combat(self, _inp: dict) -> dict:
        if self.combat:
            self.combat.is_active = False
        return {"message": "Combat ended."}

    def _tool_use_reaction(self, inp: dict) -> dict:
        char_id = inp["character_id"]
        participant = self._get_participant(char_id)
        if not participant:
            return {"error": f"Participant {char_id} not in combat"}
        if not participant.has_reaction:
            return {"error": f"{participant.character.name} has already used their reaction this round"}
        participant.has_reaction = False
        reaction_type = inp.get("reaction_type", "reaction")
        return {
            "character": participant.character.name,
            "reaction_used": reaction_type,
            "message": f"{participant.character.name} uses their reaction ({reaction_type}).",
        }

    def _tool_resolve_aoe(self, inp: dict) -> dict:
        if not self.game_map:
            return {"error": _ERR_NO_MAP}
        from .rules.aoe import resolve_aoe
        affected = resolve_aoe(
            origin_x=int(inp["origin_x"]),
            origin_y=int(inp["origin_y"]),
            shape=inp["shape"],
            size_feet=int(inp["size"]),
            entities=self.game_map.entities,
            direction_x=int(inp.get("direction_x", 0)),
            direction_y=int(inp.get("direction_y", 1)),
            exclude_ids=inp.get("exclude_ids"),
        )
        return {
            "origin": {"x": inp["origin_x"], "y": inp["origin_y"]},
            "shape": inp["shape"],
            "size_feet": inp["size"],
            "affected_count": len(affected),
            "affected": affected,
            "message": f"AoE affects {len(affected)} {'entity' if len(affected) == 1 else 'entities'}.",
        }

    def _tool_apply_condition(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}
        result = apply_condition(char, inp["condition"], inp.get("duration_rounds"))
        result["character"] = char.name
        # Also break concentration on the combat participant if needed
        if result.get("concentration_broken"):
            participant = self._get_participant(inp["character_id"])
            if participant:
                participant.concentrating_on = None
        return result

    def _tool_remove_condition(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}
        result = remove_condition(char, inp["condition"])
        result["character"] = char.name
        return result

    def _tool_choose_feat(self, inp: dict) -> dict:
        from .rules.feats import apply_feat, is_asi_level
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}
        # Check any class just reached an ASI level
        asi_ok = any(
            is_asi_level(char.level, char.class_levels, cls)
            for cls in (char.class_levels or {char.char_class: char.level})
        ) if char.class_levels else is_asi_level(char.level)
        if not asi_ok:
            return {"error": f"{char.name} has no pending ASI/Feat choice"}
        return apply_feat(char, inp["feat_name"])

    def _tool_choose_asi(self, inp: dict) -> dict:
        from .rules.feats import apply_asi, is_asi_level
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}
        asi_ok = any(
            is_asi_level(char.level, char.class_levels, cls)
            for cls in (char.class_levels or {char.char_class: char.level})
        ) if char.class_levels else is_asi_level(char.level)
        if not asi_ok:
            return {"error": f"{char.name} has no pending ASI/Feat choice"}
        return apply_asi(char, inp["increases"])

    def _tool_cast_spell(self, inp: dict) -> dict:
        caster = self.characters.get(inp["caster_id"])
        if not caster:
            return {"error": f"Caster {inp['caster_id']} not found"}

        spell_name = inp["spell_name"]
        slot_level = inp.get("slot_level", 0)
        enforce_noncombat_restrictions = bool(inp.get("enforce_restrictions", False))
        in_combat = bool(self.combat and self.combat.is_active)

        if in_combat and self.combat and self.combat.current_turn != caster.id:
            return {"error": f"It is not {caster.name}'s turn", "reason": "not_your_turn"}

        permission = evaluate_cast_permission(
            caster,
            spell_name,
            slot_level,
            in_combat=in_combat,
            enforce_noncombat_restrictions=enforce_noncombat_restrictions,
            rules_version=caster.rules_version,
        )
        if not permission.get("allowed", False):
            return {"error": str(permission.get("error", "Spell cannot be cast")), "reason": permission.get("reason")}

        required_level = int(permission.get("spell_level", 0))

        if slot_level == 0:
            return {
                "character": caster.name,
                "spell": spell_name,
                "slot_level": 0,
                "spell_level": required_level,
                "message": f"{caster.name} casts {spell_name} (cantrip).",
            }

        result = use_spell_slot(caster, slot_level)
        if "error" not in result:
            result["spell"] = spell_name
            result["spell_level"] = required_level
            # Concentration tracking: set concentrating_on if spell requires it
            spell_def = get_spell_definition(spell_name)
            if spell_def and spell_def.get("concentration", False):
                self._apply_concentration(inp["caster_id"], caster, spell_name, result)
        return result

    def _tool_long_rest(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}

        char.hp = char.max_hp
        char.temp_hp = 0
        char.conditions = []
        char.death_saves = {"successes": 0, "failures": 0}
        char.hit_dice_used = max(0, char.hit_dice_used - max(1, char.level // 2))  # recover half level hit dice on long rest
        char.concentration_spell = None  # concentration spells end on long rest
        slot_result = restore_all_slots(char)

        # Restore all class resources (both short_rest and long_rest)
        restored_resources = []
        for res_name, res_data in char.class_resources.items():
            if res_data.get("used", 0) > 0:
                restored_resources.append(res_name)
                res_data["used"] = 0

        msg = f"{char.name} completes a long rest. HP fully restored. {slot_result['message']}"
        if restored_resources:
            msg += f" Restored: {', '.join(restored_resources)}."

        return {
            "character": char.name,
            "hp_restored": char.max_hp,
            "restored_resources": restored_resources,
            "message": msg,
        }

    def _tool_get_character(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}
        return char.to_dict()

    def _build_user_provided_map_data(self, inp: dict, user_tiles: list) -> dict:
        """Build map data dict from caller-supplied tile array."""
        tiles = [dict(tile) for tile in user_tiles]
        has_sprite_assignments = any(
            isinstance(t.get("sprite"), str) and bool(str(t.get("sprite", "")).strip())
            for t in tiles
        )
        if not has_sprite_assignments and _LEGACY_SPRITE_PIPELINE_ENABLED:
            tiles = assign_terrain_atlas_sprites(
                {
                    "description": str(inp.get("description", "")),
                    "environment": str(inp.get("environment", "")).strip().lower(),
                    "terrain_theme": str(inp.get("terrain_theme", "")).strip().lower(),
                    "encounter_type": str(inp.get("encounter_type", "")).strip().lower(),
                    "encounter_scale": str(inp.get("encounter_scale", "")).strip().lower(),
                    "tactical_tags": [str(t) for t in inp.get("tactical_tags", [])],
                    "width": int(inp.get("width", 30)),
                    "height": int(inp.get("height", 21)),
                    "seed": int(inp.get("seed")) if inp.get("seed") is not None else None,
                },
                tiles,
            )
        return {
            "width": inp.get("width", 30),
            "height": inp.get("height", 21),
            "tiles": tiles,
            "entities": inp.get("entities", []),
            "metadata": {
                "map_source": "manual",
                "map_id": "manual_input",
                "grid_size": 5,
                "grid_units": "ft",
                "tile_size_px": 32,
                "cache_hit": False,
            },
        }

    @staticmethod
    def _build_auto_generated_map_data(inp: dict) -> dict:
        """Auto-generate map via the catalog pipeline, with fallback on error."""
        params = {
            "description": str(inp.get("description", "")),
            "environment": str(inp.get("environment", "")).strip().lower(),
            "terrain_theme": str(inp.get("terrain_theme", "")).strip().lower(),
            "encounter_type": str(inp.get("encounter_type", "")).strip().lower(),
            "encounter_scale": str(inp.get("encounter_scale", "")).strip().lower(),
            "tactical_tags": [str(t) for t in inp.get("tactical_tags", [])],
            "width": int(inp.get("width", 30)),
            "height": int(inp.get("height", 21)),
            "seed": int(inp.get("seed")) if inp.get("seed") is not None else None,
        }
        try:
            map_data = build_automated_map(params)
        except Exception as map_err:
            import logging as _logging
            _logging.getLogger(__name__).warning(
                "Map generation failed (%s) — using fallback 10×10 floor grid", map_err,
            )
            w, h = 10, 10
            fallback_tiles = [
                {"x": fx, "y": fy, "type": "wall" if (fx == 0 or fx == w - 1 or fy == 0 or fy == h - 1) else "floor", "sprite": ""}
                for fy in range(h) for fx in range(w)
            ]
            map_data = {
                "width": w, "height": h, "tiles": fallback_tiles, "entities": [],
                "metadata": {
                    "map_source": "fallback", "map_id": "fallback",
                    "grid_size": 5, "grid_units": "ft", "tile_size_px": 32,
                    "cache_hit": False, "generation_error": str(map_err),
                },
            }
        if inp.get("entities"):
            map_data["entities"] = inp.get("entities", [])
        return map_data

    @staticmethod
    def _apply_scene_metadata(inp: dict, map_data: dict, map_metadata: dict) -> None:
        """Persist SceneSpec-compatible fields in map metadata."""
        _ENV_TO_LOCATION = {
            "cave": "dungeon", "city": "city_alley", "forest": "forest",
            "dungeon": "dungeon", "tavern": "tavern",
        }
        _THEME_TO_BIOME = {
            "frozen": "arctic", "volcanic": "underground", "arcane": "magical",
            "overgrown": "tropical", "flooded": "temperate",
            "ancient": "underground", "ruined": "temperate",
        }
        raw_location = str(inp.get("location", "")).strip().lower()
        raw_env = str(inp.get("environment", "")).strip().lower()
        map_metadata["location"] = raw_location if raw_location else _ENV_TO_LOCATION.get(raw_env, "ruins")
        map_metadata["description"] = str(inp.get("description", ""))

        raw_biome = str(inp.get("biome", "")).strip().lower()
        if not raw_biome:
            raw_biome = _THEME_TO_BIOME.get(str(inp.get("terrain_theme", "")).strip().lower(), "")
        if raw_biome:
            map_metadata["biome"] = raw_biome

        raw_mood = str(inp.get("mood_style", "")).strip().lower()
        if raw_mood:
            map_metadata["mood_style"] = raw_mood

        raw_features = inp.get("notable_features")
        if isinstance(raw_features, list) and raw_features:
            map_metadata["notable_features"] = [str(f) for f in raw_features[:6]]

        raw_terrain_theme = str(inp.get("terrain_theme", "")).strip().lower()
        if raw_terrain_theme:
            map_metadata["terrain_theme"] = raw_terrain_theme

        if _LEGACY_SPRITE_PIPELINE_ENABLED:
            map_metadata["sprite_pipeline_enabled"] = True
            map_metadata["sprite_render_verification"] = "legacy_enabled"
        else:
            removed = _strip_sprite_fields_from_map_payload(map_data)
            map_metadata["sprite_pipeline_enabled"] = False
            map_metadata["sprite_fields_removed"] = removed
            map_metadata["sprite_render_verification"] = "assert_sprite_free"
            _assert_sprite_free_payload(map_data)
            if any(removed.values()):
                logger.info("Sprite payload stripped during map generation: %s", removed)

    def _tool_generate_map(self, inp: dict) -> dict:
        # Phase 5: Recall map seed from location memory for revisited locations
        location_name = str(inp.get("location_name", "")).strip()
        if location_name and inp.get("seed") is None:
            loc_id = location_name.lower().replace(" ", "_")
            saved_loc = self.memory.locations.get(loc_id)
            if saved_loc and saved_loc.map_seed is not None:
                inp["seed"] = saved_loc.map_seed
                if saved_loc.map_params:
                    for key in ("environment", "terrain_theme", "encounter_type", "width", "height"):
                        if key not in inp or not inp[key]:
                            inp[key] = saved_loc.map_params.get(key, inp.get(key))
                logger.info("Restored map seed %s for location '%s'", saved_loc.map_seed, location_name)

        user_tiles = inp.get("tiles") or []
        if user_tiles:
            map_data = self._build_user_provided_map_data(inp, user_tiles)
        else:
            map_data = self._build_auto_generated_map_data(inp)

        map_metadata = map_data.setdefault("metadata", {})
        self._apply_scene_metadata(inp, map_data, map_metadata)

        # Store layout_hints in metadata for downstream consumption (Phase 4)
        layout_hints = inp.get("layout_hints")
        if isinstance(layout_hints, dict):
            map_metadata["layout_hints"] = layout_hints

        self.game_map = build_map_from_data(map_data)

        # Phase 2: Signal frontend to auto-trigger battlemap image generation
        if _parse_env_flag("OTDND_AUTO_BATTLEMAP_ENABLED", False):
            map_metadata["auto_battlemap_requested"] = True

        # Phase 5: Persist map seed to location memory
        if location_name:
            loc_id = location_name.lower().replace(" ", "_")
            seed = map_metadata.get("seed") or inp.get("seed")
            map_params = {
                "environment": str(inp.get("environment", "")),
                "terrain_theme": str(inp.get("terrain_theme", "")),
                "encounter_type": str(inp.get("encounter_type", "")),
                "width": int(inp.get("width", 30)),
                "height": int(inp.get("height", 21)),
            }
            existing_loc = self.memory.locations.get(loc_id)
            if existing_loc:
                existing_loc.visited = True
                if seed is not None:
                    existing_loc.map_seed = int(seed)
                existing_loc.map_params = map_params
            else:
                from .memory import LocationMemory as _LocMem
                self.memory.add_location(_LocMem(
                    id=loc_id,
                    name=location_name,
                    description=str(inp.get("description", ""))[:200],
                    visited=True,
                    map_seed=int(seed) if seed is not None else None,
                    map_params=map_params,
                ))

        result = self.game_map.to_dict()
        result["description"] = inp["description"]
        return result

    def _tool_place_entity(self, inp: dict) -> dict:
        if not self.game_map:
            return {"error": _ERR_NO_MAP}
        
        x = inp["x"]
        y = inp["y"]
        
        # Validate that the target is walkable
        if not self.game_map.can_occupy(x, y):
            return {"error": f"Cannot place entity on non-walkable tile at ({x}, {y})"}
        
        entity = MapEntity(
            id=inp["id"],
            name=inp["name"],
            x=x,
            y=y,
            entity_type=inp.get("entity_type", "npc"),
            sprite=inp.get("sprite", "default"),
            blocks_movement=bool(inp.get("blocks_movement", True)),
            prop_category=inp.get("prop_category"),
        )
        self.game_map.place_entity(entity)

        # Auto-create a Character stat block for enemies from monsters.json
        if inp.get("entity_type") == "enemy" and inp["id"] not in self.characters:
            self._try_create_monster_character(inp["id"], inp["name"])

        return {"placed": entity.to_dict()}

    def _tool_move_entity(self, inp: dict) -> dict:
        if not self.game_map:
            return {"error": _ERR_NO_MAP}
        entity_id = inp["entity_id"]
        x = int(inp["x"])
        y = int(inp["y"])
        if not self.game_map.can_occupy(x, y, entity_id=entity_id):
            return {"error": f"Destination ({x}, {y}) is blocked"}

        # Check for opportunity attacks before moving
        opportunity_attacks: list[dict[str, str]] = []
        entity = self.game_map.entities.get(entity_id)
        if entity and self.combat and self.combat.is_active:
            old_x, old_y = entity.x, entity.y
            # Determine which side the mover is on
            mover_type = entity.entity_type  # "pc" or "enemy"
            hostile_type = "enemy" if mover_type == "pc" else "pc"
            for other_ent in self.game_map.entities.values():
                if other_ent.id == entity_id or other_ent.entity_type != hostile_type:
                    continue
                # Check if mover was adjacent (within 1 tile) and is now leaving
                was_adjacent = max(abs(old_x - other_ent.x), abs(old_y - other_ent.y)) <= 1
                will_be_adjacent = max(abs(x - other_ent.x), abs(y - other_ent.y)) <= 1
                if was_adjacent and not will_be_adjacent:
                    # Check if the hostile has a reaction available
                    participant = self._get_participant(other_ent.id)
                    if participant and participant.has_reaction:
                        # Check not incapacitated
                        reactor_char = self.characters.get(other_ent.id)
                        if reactor_char and not has_condition_effect(reactor_char, "incapacitated"):
                            opportunity_attacks.append({
                                "reactor_id": other_ent.id,
                                "reactor_name": other_ent.name,
                            })

        ok = self.game_map.move_entity(entity_id, x, y)
        if not ok:
            return {"error": f"Entity {entity_id} not found"}
        result: dict[str, Any] = {"moved": entity_id, "to": {"x": x, "y": y}}
        if opportunity_attacks:
            result["opportunity_attacks"] = opportunity_attacks
            result["message"] = (
                f"Movement provokes opportunity attacks from: "
                f"{', '.join(oa['reactor_name'] for oa in opportunity_attacks)}. "
                f"Resolve each with the attack tool before continuing."
            )
        return result

    def _tool_remove_entity(self, inp: dict) -> dict:
        if not self.game_map:
            return {"error": _ERR_NO_MAP}
        ok = self.game_map.remove_entity(inp["entity_id"])
        return {"removed": ok, "entity_id": inp["entity_id"]}

    def _tool_record_npc(self, inp: dict) -> dict:
        npc_id = inp["id"]
        existing = self.memory.npcs.get(npc_id)
        if existing:
            self._update_existing_npc(existing, inp)
            return {"updated": existing.to_dict()}
        else:
            npc = NPCMemory(
                id=npc_id, name=inp["name"],
                race=inp.get("race", "Unknown"),
                role=inp.get("role", ""),
                location=inp.get("location", ""),
                disposition=inp.get("disposition", "neutral"),
                notes=[inp["note"]] if "note" in inp else [],
                first_met_session=self.memory.current_session,
                tts_voice=inp.get("tts_voice", ""),
                last_spoke_session=inp.get("last_spoke_session", self.memory.current_session),
                secrets=[inp["secret"]] if "secret" in inp else [],
                relationships={inp["relationship"]["target"]: inp["relationship"]["description"]} if "relationship" in inp else {},
            )
            self.memory.add_npc(npc)
            return {"recorded": npc.to_dict()}

    def _tool_record_quest(self, inp: dict) -> dict:
        quest_id = inp["id"]
        existing = self.memory.quests.get(quest_id)
        if existing:
            if "status" in inp: existing.status = inp["status"]
            if "complete_objective" in inp:
                obj = inp["complete_objective"]
                if obj in existing.objectives and obj not in existing.completed_objectives:
                    existing.completed_objectives.append(obj)
            return {"updated": existing.to_dict()}
        else:
            quest = QuestMemory(
                id=quest_id, title=inp["title"],
                description=inp.get("description", ""),
                objectives=inp.get("objectives", []),
            )
            self.memory.add_quest(quest)
            return {"recorded": quest.to_dict()}

    def _tool_record_event(self, inp: dict) -> dict:
        self.memory.record_event(
            description=inp["description"],
            importance=inp.get("importance", "minor"),
        )
        return {"recorded": True, "event": inp["description"]}

    def _tool_summarize_session(self, inp: dict) -> dict:
        summary = inp.get("summary", "").strip()
        if not summary:
            return {"error": "summary is required"}
        session_num = self.memory.current_session
        self.memory.end_session(summary)
        return {"recorded": True, "session_number": session_num, "summary": summary}

    def _tool_advance_time(self, inp: dict) -> dict:
        hours = max(0, int(inp.get("hours", 0)))
        minutes = max(0, int(inp.get("minutes", 0)))
        wt = self.memory.world_time
        total_minutes = wt.get("minute", 0) + minutes + (wt.get("hour", 8) + hours) * 60
        new_day = wt.get("day", 1) + total_minutes // (24 * 60)
        remaining = total_minutes % (24 * 60)
        new_hour = remaining // 60
        new_minute = remaining % 60
        self.memory.world_time = {"day": new_day, "hour": new_hour, "minute": new_minute}
        return {
            "advanced": True,
            "reason": inp.get("reason", ""),
            "world_time": self.memory.world_time,
        }

    def _tool_travel(self, inp: dict) -> dict:
        from .rules.exploration import calculate_travel, roll_weather, check_random_encounter, WEATHER_EFFECTS

        destination = inp["destination"]
        terrain = inp.get("terrain", "plains")
        pace = inp.get("pace", "normal")
        hours = max(1, int(inp.get("hours", 8)))
        climate = inp.get("climate", "temperate")

        # Calculate travel distance
        travel = calculate_travel(pace, terrain, hours)

        # Advance time
        wt = self.memory.world_time
        total_minutes = wt.get("minute", 0) + (wt.get("hour", 8) + hours) * 60
        new_day = wt.get("day", 1) + total_minutes // (24 * 60)
        remaining = total_minutes % (24 * 60)
        self.memory.world_time = {"day": new_day, "hour": remaining // 60, "minute": remaining % 60}

        # Roll weather
        weather = roll_weather(climate)
        self.memory.weather = weather
        weather_effects = WEATHER_EFFECTS.get(weather, {})

        # Apply weather travel modifier
        actual_miles = round(travel["miles_traveled"] * weather_effects.get("travel_modifier", 1.0), 1)

        # Check for random encounter
        avg_level = 1
        if self.characters:
            pc_levels = [c.level for c in self.characters.values() if not c.is_monster]
            if pc_levels:
                avg_level = sum(pc_levels) // len(pc_levels)
        encounter = check_random_encounter(terrain, avg_level)

        msg = f"The party travels toward {destination} at {pace} pace through {terrain}. "
        msg += f"Distance: {actual_miles} miles in {hours} hours. Weather: {weather}."
        if encounter:
            msg += f" ENCOUNTER: {encounter['count']}x {encounter['monster']} spotted!"

        result = {
            "destination": destination,
            "miles_traveled": actual_miles,
            "hours": hours,
            "pace": pace,
            "terrain": terrain,
            "weather": weather,
            "weather_effects": weather_effects,
            "nav_dc": travel["nav_dc"],
            "world_time": self.memory.world_time,
            "message": msg,
        }
        if encounter:
            result["encounter"] = encounter
        return result

    def _tool_forage(self, inp: dict) -> dict:
        from .rules.exploration import forage_dc

        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}

        terrain = inp.get("terrain", "forest")
        dc = forage_dc(terrain)
        survival_mod = char.skill_modifier("Survival")
        d20 = roll("1d20").total
        total = d20 + survival_mod
        success = total >= dc

        if success:
            rations_found = 1 if (total - dc) < 5 else 2
            msg = f"{char.name} forages successfully (rolled {d20}+{survival_mod}={total} vs DC {dc}). Found {rations_found} day(s) of food and water."
        else:
            rations_found = 0
            msg = f"{char.name} fails to find food (rolled {d20}+{survival_mod}={total} vs DC {dc})."

        return {
            "character": char.name,
            "success": success,
            "d20": d20,
            "modifier": survival_mod,
            "total": total,
            "dc": dc,
            "rations_found": rations_found,
            "terrain": terrain,
            "message": msg,
        }

    def _tool_set_weather(self, inp: dict) -> dict:
        from .rules.exploration import roll_weather, WEATHER_EFFECTS

        weather = inp.get("weather")
        if not weather:
            climate = inp.get("climate", "temperate")
            weather = roll_weather(climate)

        self.memory.weather = weather
        effects = WEATHER_EFFECTS.get(weather, {})

        return {
            "weather": weather,
            "effects": effects,
            "message": f"Weather is now: {weather}.",
        }

    def _tool_record_faction(self, inp: dict) -> dict:
        from .memory import FactionMemory
        faction_id = inp["faction_id"]
        existing = self.memory.factions.get(faction_id)
        if existing:
            if "description" in inp:
                existing.description = inp["description"]
            if "known_members" in inp:
                for m in inp["known_members"]:
                    if m not in existing.known_members:
                        existing.known_members.append(m)
            return {"updated": existing.to_dict()}
        else:
            faction = FactionMemory(
                id=faction_id,
                name=inp["name"],
                description=inp.get("description", ""),
                reputation=int(inp.get("reputation", 0)),
                known_members=inp.get("known_members", []),
            )
            # Set initial disposition from reputation
            self.memory.add_faction(faction)
            self.memory.adjust_reputation(faction_id, 0)
            return {"recorded": faction.to_dict()}

    def _tool_adjust_reputation(self, inp: dict) -> dict:
        result = self.memory.adjust_reputation(inp["faction_id"], int(inp["amount"]))
        if "error" not in result:
            result["reason"] = inp.get("reason", "")
            result["message"] = f"Reputation with {result['faction']} changed by {inp['amount']} to {result['reputation']} ({result['disposition']})."
        return result

    def _tool_assess_encounter(self, inp: dict) -> dict:
        from .rules.encounter_balance import calculate_encounter_difficulty, CR_XP
        from .rules.content_repository import get_monster_stat_block

        monster_names = inp.get("monster_names", [])
        crs: list[float] = []
        unknown: list[str] = []
        for name in monster_names:
            stats = get_monster_stat_block(name)
            if stats:
                crs.append(stats.get("challenge_rating", 0))
            else:
                unknown.append(name)

        if unknown:
            return {"error": f"Unknown monsters: {', '.join(unknown)}"}

        party_levels = [c.level for c in self.characters.values() if not c.is_monster]
        if not party_levels:
            return {"error": "No player characters to assess against"}

        result = calculate_encounter_difficulty(party_levels, crs)
        result["monsters"] = monster_names
        result["message"] = (
            f"Encounter: {', '.join(monster_names)} — "
            f"Difficulty: {result['difficulty'].upper()} "
            f"({result['adjusted_xp']} adjusted XP vs "
            f"{result['thresholds']['medium']} medium threshold)"
        )
        return result

    def _tool_suggest_encounter(self, inp: dict) -> dict:
        from .rules.encounter_balance import suggest_encounter

        party_levels = [c.level for c in self.characters.values() if not c.is_monster]
        if not party_levels:
            return {"error": "No player characters to build encounter for"}

        difficulty = inp.get("difficulty", "medium")
        terrain = inp.get("terrain")
        result = suggest_encounter(party_levels, difficulty, terrain)

        roster_desc = ", ".join(f"{r['count']}x {r['name']} (CR {r['cr']})" for r in result["roster"])
        result["message"] = (
            f"Suggested {difficulty} encounter: {roster_desc}. "
            f"Actual difficulty: {result['assessment']['difficulty']}."
        )
        return result

    def _tool_give_item(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}

        item = lookup_catalog_item(inp["item_id"])
        if item is None:
            return {"error": f"Unknown item: {inp['item_id']}"}

        qty = max(1, int(inp.get("quantity", 1)))
        notes = inp.get("notes", "")
        magical = bool(inp.get("magical", False))
        rarity = str(inp.get("rarity", "common"))
        requires_attunement = bool(inp.get("requires_attunement", False))

        # Stack with existing unequipped item of same id
        existing = find_item_in_inventory(char.inventory, item.id)
        if existing and not existing.get("equipped"):
            existing["quantity"] = existing.get("quantity", 1) + qty
            if notes:
                existing["notes"] = notes
        else:
            item_dict = item.to_dict()
            item_dict["quantity"] = qty
            item_dict["notes"] = notes
            if magical:
                item_dict["magical"] = True
                item_dict["rarity"] = rarity
            if requires_attunement:
                item_dict["requires_attunement"] = True
            char.inventory.append(item_dict)

        return {
            "character": char.name,
            "item": item.name,
            "quantity": qty,
            "message": f"{char.name} received {qty}x {item.name}.",
        }

    def _tool_remove_item(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}

        item_id = inp["item_id"]
        qty = int(inp.get("quantity", 1))

        target = find_item_in_inventory(char.inventory, item_id)
        if target is None:
            return {"error": f"{char.name} does not have '{item_id}' in inventory"}

        item_name = target["name"]
        if qty == -1 or qty >= target.get("quantity", 1):
            char.inventory.remove(target)
            return {"character": char.name, "removed": item_name, "message": f"{item_name} removed from {char.name}'s inventory."}
        else:
            target["quantity"] = target.get("quantity", 1) - qty
            return {"character": char.name, "removed": item_name, "quantity": qty,
                    "message": f"{qty}x {item_name} removed from {char.name}'s inventory."}

    def _tool_equip_item(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}

        item_id = inp["item_id"]
        equip = inp.get("equip", True)

        target = find_item_in_inventory(char.inventory, item_id)
        if target is None:
            return {"error": f"{char.name} does not have '{item_id}' in inventory"}

        category = target.get("category", "")

        if equip:
            # Unequip any existing item of same category (weapon/armor/shield)
            for item in char.inventory:
                if item is not target and item.get("category") == category:
                    item["equipped"] = False
            target["equipped"] = True
        else:
            target["equipped"] = False

        # Recalculate AC whenever armor/shield changes
        if category in ("armor", "shield"):
            dex_mod = char.ability_modifier("DEX")
            char.ac = calculate_ac_from_inventory(char.inventory, dex_mod)

        action = "equipped" if equip else "unequipped"
        return {
            "character": char.name,
            "item": target["name"],
            "action": action,
            "ac": char.ac,
            "message": f"{char.name} {action} {target['name']}. AC is now {char.ac}.",
        }

    def _tool_give_gold(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}
        amount = max(0, int(inp["amount"]))
        char.gold_gp = getattr(char, "gold_gp", 0) + amount
        reason = inp.get("reason", "")
        msg = f"{char.name} received {amount} gp{f' ({reason})' if reason else ''}. Total: {char.gold_gp} gp."
        return {"character": char.name, "amount": amount, "total_gp": char.gold_gp, "message": msg}

    def _tool_grant_inspiration(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}
        char.inspiration = True
        reason = inp.get("reason", "")
        msg = f"{char.name} received Inspiration{f' ({reason})' if reason else ''}!"
        return {"character": char.name, "inspiration": True, "message": msg}

    def _tool_spend_gold(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}
        amount = max(0, int(inp["amount"]))
        current = getattr(char, "gold_gp", 0)
        if amount > current:
            return {"error": f"{char.name} only has {current} gp (needs {amount} gp)"}
        char.gold_gp = current - amount
        reason = inp.get("reason", "")
        msg = f"{char.name} spent {amount} gp{f' ({reason})' if reason else ''}. Remaining: {char.gold_gp} gp."
        return {"character": char.name, "amount": amount, "total_gp": char.gold_gp, "message": msg}

    def _tool_update_tile(self, inp: dict) -> dict:
        if not self.game_map:
            return {"error": _ERR_NO_MAP}
        tile = self.game_map.set_tile(inp["x"], inp["y"], inp["tile_type"], inp.get("state"), inp.get("sprite"))
        return {"updated": tile.to_dict()}

    def _tool_request_player_roll(self, inp: dict) -> dict:
        char = self.characters.get(inp.get("character_id", ""))
        if not char:
            return {"error": f"Character {inp.get('character_id')} not found"}
        return {
            "awaiting_player_roll": True,
            "character_id": inp["character_id"],
            "character_name": char.name,
            "label": inp["label"],
            "dice": inp["dice"],
            "modifier": int(inp.get("modifier", 0)),
            "context": inp["context"],
        }

    def _tool_short_rest(self, inp: dict) -> dict:
        from .rules.characters import CLASSES
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}

        class_data = CLASSES.get(char.char_class, {})
        hit_die = class_data.get("hit_die", 8)
        con_mod = char.ability_modifier("CON")

        dice_to_spend = max(1, min(int(inp.get("hit_dice_to_spend", 1)), char.level))

        # Clamp to how many hit dice are actually available
        available = max(0, char.level - char.hit_dice_used)
        dice_to_spend = min(dice_to_spend, available) if available > 0 else 0

        total_healed = 0
        rolls: list[int] = []
        for _ in range(dice_to_spend):
            rolled = roll(f"1d{hit_die}")
            heal_amount = max(0, rolled.total + con_mod)
            rolls.append(rolled.total)
            old_hp = char.hp
            char.hp = min(char.max_hp, char.hp + heal_amount)
            total_healed += char.hp - old_hp

        char.hit_dice_used = min(char.level, char.hit_dice_used + dice_to_spend)

        # Warlocks recover Pact Magic slots on short rest
        pact_slots_recovered = 0
        if char.char_class == "Warlock":
            restore_all_slots(char)
            pact_slots_recovered = sum(char.spell_slots.values())

        msg = (f"{char.name} takes a short rest, spending {dice_to_spend} "
               f"hit {'die' if dice_to_spend == 1 else 'dice'} (rolled {rolls}).")
        if dice_to_spend == 0:
            msg = f"{char.name} has no hit dice remaining for a short rest."
        if total_healed > 0:
            msg += f" Recovered {total_healed} HP (now {char.hp}/{char.max_hp})."
        else:
            msg += f" Already at full HP ({char.hp}/{char.max_hp})."
        if pact_slots_recovered:
            msg += " Pact Magic slots restored."

        # Restore class resources that reset on short rest
        restored_resources = []
        for res_name, res_data in char.class_resources.items():
            if res_data.get("resets_on") == "short_rest" and res_data.get("used", 0) > 0:
                restored_resources.append(res_name)
                res_data["used"] = 0
        if restored_resources:
            msg += f" Restored: {', '.join(restored_resources)}."

        return {
            "character": char.name,
            "hit_dice_spent": dice_to_spend,
            "hit_dice_remaining": max(0, char.level - char.hit_dice_used),
            "rolls": rolls,
            "hp_recovered": total_healed,
            "current_hp": char.hp,
            "max_hp": char.max_hp,
            "pact_slots_recovered": pact_slots_recovered,
            "restored_resources": restored_resources,
            "message": msg,
        }

    def _tool_use_class_resource(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}

        resource_name = inp["resource_name"]
        res = char.class_resources.get(resource_name)
        if not res:
            available = list(char.class_resources.keys()) if char.class_resources else []
            return {"error": f"Unknown resource '{resource_name}'. Available: {available}"}

        max_uses = res.get("max", 0)
        used = res.get("used", 0)
        if used >= max_uses:
            return {
                "error": f"{char.name} has no {resource_name} uses remaining (0/{max_uses}). "
                         f"Restores on {res.get('resets_on', 'long_rest')} rest.",
            }

        res["used"] = used + 1
        remaining = max_uses - res["used"]
        return {
            "character": char.name,
            "resource": resource_name,
            "remaining": remaining,
            "max": max_uses,
            "message": f"{char.name} uses {resource_name} ({remaining}/{max_uses} remaining).",
        }

    def _tool_give_xp(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}

        amount = max(0, int(inp["amount"]))
        char.xp = getattr(char, "xp", 0) + amount
        reason = inp.get("reason", "")

        XP_FOR_LEVEL = [
            0, 300, 900, 2700, 6500, 14000, 23000, 34000,
            48000, 64000, 85000, 100000, 120000, 140000,
            165000, 195000, 225000, 265000, 305000, 355000,
        ]
        next_threshold = XP_FOR_LEVEL[min(char.level, len(XP_FOR_LEVEL) - 1)]
        level_up_ready = char.level < 20 and char.xp >= next_threshold

        msg = f"{char.name} earned {amount} XP{f' for {reason}' if reason else ''}. Total: {char.xp} XP."
        if level_up_ready:
            msg += f" {char.name} has enough XP to reach level {char.level + 1}!"

        return {
            "character": char.name,
            "xp_awarded": amount,
            "total_xp": char.xp,
            "level_up_ready": level_up_ready,
            "next_level": char.level + 1 if level_up_ready else None,
            "message": msg,
        }

    def _tool_level_up(self, inp: dict) -> dict:
        from .rules.characters import CLASSES, PROFICIENCY_BY_LEVEL, check_multiclass_eligible, get_class_resources_for
        from .rules.content_repository import get_class_features
        from .rules.feats import is_asi_level, get_available_feats

        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}

        if char.level >= 20:
            return {"error": f"{char.name} is already at max level (20)"}

        # Determine which class is being leveled
        leveling_class = inp.get("class_name", char.char_class)
        is_new_class = leveling_class not in (char.class_levels or {char.char_class: char.level})

        # Validate multiclass prerequisites if taking a new class
        if is_new_class:
            eligibility = check_multiclass_eligible(char, leveling_class)
            if not eligibility["eligible"]:
                return {"error": f"Cannot multiclass into {leveling_class}: {eligibility['reason']}"}

        # Ensure class_levels is populated (backwards compat)
        if not char.class_levels:
            char.class_levels = {char.char_class: char.level}

        # Get hit die for the leveling class
        use_average = bool(inp.get("use_average_hp", True))
        class_data = CLASSES.get(leveling_class, {})
        hit_die = class_data.get("hit_die", 8)
        con_mod = char.ability_modifier("CON")

        old_level = char.level
        char.level += 1

        # Update class_levels
        char.class_levels[leveling_class] = char.class_levels.get(leveling_class, 0) + 1
        class_level = char.class_levels[leveling_class]

        # HP: use the leveling class's hit die
        if use_average:
            hp_roll = hit_die // 2 + 1
        else:
            hp_roll = roll(f"1d{hit_die}").total

        hp_gain = max(1, hp_roll + con_mod)
        char.max_hp += hp_gain
        char.hp += hp_gain

        # Spell slots: multiclass-aware
        initialize_spell_slots(char)

        # Class features: keyed to the leveling class at its class-specific level
        new_features = get_class_features(leveling_class, level=class_level)
        level_specific = [f for f in new_features if f.get("level") == class_level]
        existing_ids = {f.get("id") or f.get("name") for f in char.class_features}
        for feat in level_specific:
            fid = feat.get("id") or feat.get("name")
            if fid and fid not in existing_ids:
                char.class_features.append(feat)
                existing_ids.add(fid)

        # Update class resources from all classes
        merged_resources: dict = {}
        for cls_name, cls_lvl in char.class_levels.items():
            for res_name, res_data in get_class_resources_for(cls_name, cls_lvl, char.abilities).items():
                if res_name in merged_resources:
                    # Keep the higher max (e.g. Channel Divinity from Cleric+Paladin)
                    if res_data["max"] > merged_resources[res_name]["max"]:
                        merged_resources[res_name]["max"] = res_data["max"]
                else:
                    # Preserve existing "used" count
                    existing = char.class_resources.get(res_name, {})
                    merged_resources[res_name] = {
                        "max": res_data["max"],
                        "used": existing.get("used", 0),
                        "resets_on": res_data["resets_on"],
                    }
        char.class_resources = merged_resources

        new_prof = PROFICIENCY_BY_LEVEL.get(char.level, 2)
        old_prof = PROFICIENCY_BY_LEVEL.get(old_level, 2)
        feature_names = [f.get("name", "?") for f in level_specific]

        # Build message
        if is_new_class:
            msg = f"{char.name} multiclasses into {leveling_class}! Now {char.class_display()}."
        else:
            msg = f"{char.name} advances to {char.class_display()}!"
        msg += f" HP +{hp_gain} (now {char.hp}/{char.max_hp})."
        if new_prof > old_prof:
            msg += f" Proficiency bonus increased to +{new_prof}."
        if feature_names:
            msg += f" New features: {', '.join(feature_names)}."

        # ASI: per-class level, not total level
        asi_available = is_asi_level(char.level, char.class_levels, leveling_class)
        if asi_available:
            msg += " ASI/Feat choice available! Use choose_asi or choose_feat."

        result = {
            "character": char.name,
            "old_level": old_level,
            "new_level": char.level,
            "class_levels": char.class_levels,
            "leveled_class": leveling_class,
            "class_level": class_level,
            "hp_gain": hp_gain,
            "current_hp": char.hp,
            "max_hp": char.max_hp,
            "new_proficiency_bonus": new_prof,
            "new_features": feature_names,
            "spell_slots": char.spell_slots,
            "asi_available": asi_available,
            "message": msg,
        }
        if asi_available:
            result["available_feats"] = [f["name"] for f in get_available_feats(char)]
        return result

    def _tool_reveal_area(self, inp: dict) -> dict:
        if not self.game_map:
            return {"error": _ERR_NO_MAP}

        radius = int(inp.get("vision_radius", 8))

        entity_id = inp.get("entity_id")
        if entity_id:
            entity = self.game_map.entities.get(entity_id)
            if entity:
                self.game_map.compute_fov(entity.x, entity.y, radius)

        for tile_coord in (inp.get("tiles") or []):
            self.game_map.revealed.add((int(tile_coord["x"]), int(tile_coord["y"])))

        return {
            "revealed": True,
            "total_revealed": len(self.game_map.revealed),
            "message": f"Area revealed. Total known tiles: {len(self.game_map.revealed)}.",
        }

    def _tool_generate_loot(self, inp: dict) -> dict:
        import random as _random
        from .rules.items import ITEM_CATALOG

        strength = inp.get("encounter_strength", "medium")
        gold_mult = float(inp.get("gold_multiplier", 1.0))

        GOLD_RANGE = {
            "trivial": (2, 10),
            "easy": (5, 25),
            "medium": (10, 50),
            "hard": (25, 100),
            "deadly": (50, 250),
        }
        ITEM_COUNT = {"trivial": 0, "easy": 1, "medium": 1, "hard": 2, "deadly": 3}

        gold_min, gold_max = GOLD_RANGE.get(strength, (10, 50))
        gold = int(_random.randint(gold_min, gold_max) * gold_mult)
        item_count = ITEM_COUNT.get(strength, 1)

        candidates = [
            item for item in ITEM_CATALOG.values()
            if 0 < item.cost_gp <= gold_max * 2
        ]
        chosen = _random.sample(candidates, min(item_count, len(candidates))) if candidates and item_count > 0 else []
        loot_items = [{"id": i.id, "name": i.name, "value_gp": i.cost_gp} for i in chosen]

        award_to = inp.get("award_to")
        if award_to:
            char = self.characters.get(award_to)
            if char:
                self._award_loot_to_character(char, gold, loot_items)

        awarded_to_name: str | None = None
        if award_to:
            c = self.characters.get(award_to)
            awarded_to_name = c.name if c else award_to

        item_names = [i["name"] for i in loot_items]
        msg = f"Loot: {gold} gp"
        if item_names:
            msg += f" and {', '.join(item_names)}"
        if awarded_to_name:
            msg += f" (awarded to {awarded_to_name})"
        msg += "."

        return {
            "gold": gold,
            "items": loot_items,
            "awarded_to": award_to,
            "message": msg,
        }

    def _tool_open_shop(self, inp: dict) -> dict:
        from .rules.items import ITEM_CATALOG

        shop_type = inp.get("shop_type", "general")
        shop_name = inp.get("shop_name", "The Merchant")
        settlement = inp.get("settlement_size", "town")

        SHOP_CATEGORIES: dict[str, list[str]] = {
            "general": ["gear", "tool", "ammunition"],
            "weapons": ["weapon"],
            "armor": ["armor", "shield"],
            "magic": ["gear"],
            "potions": ["gear"],
            "blacksmith": ["weapon", "armor", "shield", "tool"],
        }
        PRICE_CAP = {"hamlet": 5, "village": 15, "town": 50, "city": 200, "metropolis": 1000}

        max_price = PRICE_CAP.get(settlement, 50)
        categories = SHOP_CATEGORIES.get(shop_type, ["gear"])

        available = [
            {
                "id": item.id,
                "name": item.name,
                "category": item.category,
                "cost_gp": item.cost_gp,
                "description": item.description or "",
                "weight_lb": item.weight_lb,
            }
            for item in ITEM_CATALOG.values()
            if item.category in categories and 0 < item.cost_gp <= max_price
        ]
        available.sort(key=lambda x: x["cost_gp"])

        return {
            "shop_name": shop_name,
            "shop_type": shop_type,
            "settlement_size": settlement,
            "items": available,
            "message": f"{shop_name} offers {len(available)} items for sale.",
        }

    def _tool_start_skill_challenge(self, inp: dict) -> dict:
        self.skill_challenge = SkillChallengeState(
            title=inp["title"],
            success_threshold=int(inp["success_threshold"]),
            failure_threshold=int(inp["failure_threshold"]),
            participants=list(inp.get("participants") or []),
        )
        return {
            **self.skill_challenge.to_dict(),
            "message": (
                f"Skill challenge '{self.skill_challenge.title}' started. "
                f"Party needs {self.skill_challenge.success_threshold} successes "
                f"before {self.skill_challenge.failure_threshold} failures."
            ),
        }

    # ------------------------------------------------------------------
    # Phase 3: Dynamic map mutation tools
    # ------------------------------------------------------------------

    def _tool_modify_terrain(self, inp: dict) -> dict:
        if not self.game_map:
            return {"error": _ERR_NO_MAP}
        x, y = int(inp["x"]), int(inp["y"])
        if x < 0 or x >= self.game_map.width or y < 0 or y >= self.game_map.height:
            return {"error": f"Coordinates ({x}, {y}) out of bounds"}
        new_type = str(inp["new_type"])
        reason = str(inp.get("reason", ""))
        tile = self.game_map.set_tile(x, y, new_type)
        return {"modified": tile.to_dict(), "reason": reason}

    # ------------------------------------------------------------------
    # Spawn / placement helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _find_door_spawn_candidates(gm: GameMap) -> list[tuple[int, int]]:
        """Return walkable tiles on or adjacent to doors."""
        candidates: list[tuple[int, int]] = []
        for (tx, ty), tile in gm.tiles.items():
            if tile.tile_type == "door" and gm.can_occupy(tx, ty):
                candidates.append((tx, ty))
                for nx, ny in ((tx + 1, ty), (tx - 1, ty), (tx, ty + 1), (tx, ty - 1)):
                    if gm.can_occupy(nx, ny):
                        candidates.append((nx, ny))
        return candidates

    @staticmethod
    def _find_edge_spawn_candidates(gm: GameMap, direction: str) -> list[tuple[int, int]]:
        """Return walkable tiles near the map edge for a given direction."""
        w, h = gm.width, gm.height
        if direction in ("N", "NEAREST_DOOR"):
            rows, cols = range(1, min(4, h)), range(1, w - 1)
        elif direction == "S":
            rows, cols = range(max(0, h - 4), h - 1), range(1, w - 1)
        elif direction == "E":
            rows, cols = range(1, h - 1), range(max(0, w - 4), w - 1)
        else:  # W
            rows, cols = range(1, h - 1), range(1, min(4, w))
        return [(cx, ry) for ry in rows for cx in cols if gm.can_occupy(cx, ry)]

    @staticmethod
    def _place_entities(gm: GameMap, creatures: list[dict], candidates: list[tuple[int, int]], *, randomize: bool = False) -> list[dict]:
        """Place a list of creature dicts onto candidate positions. Returns placed entity dicts."""
        import random as _rng
        placed: list[dict] = []
        used: set[tuple[int, int]] = set()
        for creature in creatures:
            available = [c for c in candidates if c not in used]
            if not available:
                break
            pos = _rng.choice(available) if randomize else available[0]
            used.add(pos)
            entity = MapEntity(
                id=str(creature["id"]),
                name=str(creature["name"]),
                x=pos[0],
                y=pos[1],
                entity_type="enemy",
                blocks_movement=True,
            )
            gm.place_entity(entity)
            placed.append(entity.to_dict())
        return placed

    def _place_entities_with_stats(self, gm: GameMap, creatures: list[dict], candidates: list[tuple[int, int]], *, randomize: bool = False) -> list[dict]:
        """Place creatures and auto-create Character objects from monsters.json."""
        placed = self._place_entities(gm, creatures, candidates, randomize=randomize)
        for creature in creatures:
            cid = str(creature["id"])
            cname = str(creature["name"])
            if cid not in self.characters:
                self._try_create_monster_character(cid, cname)
        return placed

    def _try_create_monster_character(self, entity_id: str, monster_name: str) -> None:
        """Attempt to create a Character stat block for a monster and add to self.characters."""
        from .rules.characters import create_monster
        try:
            char = create_monster(monster_name, entity_id)
            self.characters[entity_id] = char
        except ValueError:
            logger.debug("No stat block found for monster '%s', skipping Character creation", monster_name)

    def _tool_spawn_reinforcements(self, inp: dict) -> dict:
        if not self.game_map:
            return {"error": _ERR_NO_MAP}
        creatures = inp.get("creatures", [])
        if not creatures:
            return {"error": "No creatures specified"}
        direction = str(inp.get("entry_direction", "N")).upper()

        candidates = []
        if direction == "NEAREST_DOOR":
            candidates = self._find_door_spawn_candidates(self.game_map)
        if not candidates:
            candidates = self._find_edge_spawn_candidates(self.game_map, direction)
        if not candidates:
            return {"error": "No walkable spawn locations found"}

        placed = self._place_entities_with_stats(self.game_map, creatures, candidates, randomize=True)
        return {"spawned": placed, "count": len(placed), "direction": direction}

    # ------------------------------------------------------------------
    # Phase 6: AI-driven tactical entity placement
    # ------------------------------------------------------------------

    @staticmethod
    def _build_encounter_candidates(gm: GameMap, strategy: str) -> list[tuple[int, int]]:
        """Build ordered candidate positions for an encounter placement strategy."""
        import random as _rng

        priority: list[tuple[int, int]] = []

        if strategy == "tactical":
            for cx, cy, _ in gm._find_cover():
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if gm.can_occupy(nx, ny):
                        priority.append((nx, ny))
            priority.extend(c for c in gm._find_chokepoints() if gm.can_occupy(c[0], c[1]))
        elif strategy == "guarding":
            for (tx, ty), tile in gm.tiles.items():
                if tile.tile_type in ("door", "stairs_up", "stairs_down", "chest"):
                    for nx, ny in ((tx + 1, ty), (tx - 1, ty), (tx, ty + 1), (tx, ty - 1)):
                        if gm.can_occupy(nx, ny):
                            priority.append((nx, ny))

        fallback = [(tx, ty) for (tx, ty), tile in gm.tiles.items() if gm.can_occupy(tx, ty)]

        seen_priority = set(priority)
        priority_deduped = list(dict.fromkeys(priority))
        fallback = [f for f in fallback if f not in seen_priority]

        if strategy == "scattered":
            _rng.shuffle(fallback)
            return fallback
        return priority_deduped + fallback

    def _tool_populate_encounter(self, inp: dict) -> dict:
        if not self.game_map:
            return {"error": _ERR_NO_MAP}
        enemies = inp.get("enemies", [])
        if not enemies:
            return {"error": "No enemies specified"}
        strategy = str(inp.get("placement_strategy", "scattered"))

        candidates = self._build_encounter_candidates(self.game_map, strategy)
        if not candidates:
            return {"error": "No valid placement positions found"}

        placed = self._place_entities_with_stats(self.game_map, enemies, candidates)
        return {"placed": placed, "count": len(placed), "strategy": strategy}

