"""Tool definitions exposed to Claude for DM actions, and dispatch logic."""

from __future__ import annotations

from typing import Any

from .map_catalog import build_automated_map
from .map_engine import GameMap, MapEntity, build_map_from_data
from .rules.characters import Character
from .rules.combat import (
    CombatState,
    attack_roll,
    death_saving_throw,
    next_turn,
    roll_initiative,
)
from .rules.dice import roll
from .rules.items import (
    calculate_ac_from_inventory,
    find_item_in_inventory,
    lookup_catalog_item,
)
from .rules.spells import (
    evaluate_cast_permission,
    restore_all_slots,
    use_spell_slot,
)
from .memory import CampaignMemory, NPCMemory, QuestMemory, LocationMemory

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
                "description": {"type": "string", "description": "Narrative description of the area for the players"},
                "environment": {"type": "string", "description": "Optional environment hint (dungeon/forest/tavern/cave/city)"},
                "encounter_type": {"type": "string", "description": "Optional encounter type hint (combat/exploration/social)"},
                "encounter_scale": {"type": "string", "description": "Optional scale hint (small/medium/large)"},
                "tactical_tags": {
                    "type": "array",
                    "description": "Optional tactical tags (cover/chokepoints/line_of_sight/flanking)",
                    "items": {"type": "string"},
                },
                "width": {"type": "integer", "description": "Map width in tiles (5-40)", "default": 20},
                "height": {"type": "integer", "description": "Map height in tiles (5-30)", "default": 15},
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
                "sprite": {"type": "string", "default": "default"},
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
                "notes": {"type": "string", "default": "", "description": "Optional notes, e.g. '+1 magical', 'cursed', 'found in dragon hoard'"},
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
            },
            "required": ["x", "y", "tile_type"],
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
    ):
        self.characters = characters
        self.game_map = game_map
        self.combat = combat
        self.memory = memory or CampaignMemory()

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

    def _tool_attack(self, inp: dict) -> dict:
        attacker = self.characters.get(inp["attacker_id"])
        target = self.characters.get(inp["target_id"])
        if not attacker:
            return {"error": f"Attacker {inp['attacker_id']} not found"}
        if not target:
            return {"error": f"Target {inp['target_id']} not found"}

        return attack_roll(
            attacker=attacker,
            target=target,
            weapon_bonus=inp.get("weapon_bonus", 0),
            damage_notation=inp.get("damage_dice", "1d8"),
            ability=inp.get("ability", "STR"),
            advantage=inp.get("advantage", False),
            disadvantage=inp.get("disadvantage", False),
        )

    def _tool_apply_damage(self, inp: dict) -> dict:
        target = self.characters.get(inp["target_id"])
        if not target:
            return {"error": f"Target {inp['target_id']} not found"}
        result = target.take_damage(inp["amount"])
        result["target"] = target.name
        result["damage_type"] = inp.get("damage_type", "untyped")
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
        return next_turn(self.combat)

    def _tool_end_combat(self, _inp: dict) -> dict:
        if self.combat:
            self.combat.is_active = False
        return {"message": "Combat ended."}

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
        return result

    def _tool_long_rest(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}

        char.hp = char.max_hp
        char.temp_hp = 0
        char.conditions = []
        char.death_saves = {"successes": 0, "failures": 0}
        slot_result = restore_all_slots(char)

        return {
            "character": char.name,
            "hp_restored": char.max_hp,
            "message": f"{char.name} completes a long rest. HP fully restored. {slot_result['message']}",
        }

    def _tool_get_character(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}
        return char.to_dict()

    def _tool_generate_map(self, inp: dict) -> dict:
        user_tiles = inp.get("tiles") or []
        if user_tiles:
            map_data = {
                "width": inp.get("width", 20),
                "height": inp.get("height", 15),
                "tiles": user_tiles,
                "entities": inp.get("entities", []),
                "metadata": {
                    "map_source": "manual",
                    "map_id": "manual_input",
                    "grid_size": 5,
                    "grid_units": "ft",
                    "cache_hit": False,
                },
            }
        else:
            map_data = build_automated_map({
                "description": str(inp.get("description", "")),
                "environment": str(inp.get("environment", "")).strip().lower(),
                "encounter_type": str(inp.get("encounter_type", "")).strip().lower(),
                "encounter_scale": str(inp.get("encounter_scale", "")).strip().lower(),
                "tactical_tags": [str(t) for t in inp.get("tactical_tags", [])],
                "width": int(inp.get("width", 20)),
                "height": int(inp.get("height", 15)),
            })

            if inp.get("entities"):
                map_data["entities"] = inp.get("entities", [])

        self.game_map = build_map_from_data(map_data)
        result = self.game_map.to_dict()
        result["description"] = inp["description"]
        return result

    def _tool_place_entity(self, inp: dict) -> dict:
        if not self.game_map:
            return {"error": "No map loaded"}
        entity = MapEntity(
            id=inp["id"],
            name=inp["name"],
            x=inp["x"],
            y=inp["y"],
            entity_type=inp.get("entity_type", "npc"),
            sprite=inp.get("sprite", "default"),
        )
        self.game_map.place_entity(entity)
        return {"placed": entity.to_dict()}

    def _tool_move_entity(self, inp: dict) -> dict:
        if not self.game_map:
            return {"error": "No map loaded"}
        ok = self.game_map.move_entity(inp["entity_id"], inp["x"], inp["y"])
        if not ok:
            return {"error": f"Entity {inp['entity_id']} not found"}
        return {"moved": inp["entity_id"], "to": {"x": inp["x"], "y": inp["y"]}}

    def _tool_remove_entity(self, inp: dict) -> dict:
        if not self.game_map:
            return {"error": "No map loaded"}
        ok = self.game_map.remove_entity(inp["entity_id"])
        return {"removed": ok, "entity_id": inp["entity_id"]}

    def _tool_record_npc(self, inp: dict) -> dict:
        npc_id = inp["id"]
        existing = self.memory.npcs.get(npc_id)
        if existing:
            if "location" in inp: existing.location = inp["location"]
            if "disposition" in inp: existing.disposition = inp["disposition"]
            if "role" in inp: existing.role = inp["role"]
            if "note" in inp: existing.notes.append(inp["note"])
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

    def _tool_give_item(self, inp: dict) -> dict:
        char = self.characters.get(inp["character_id"])
        if not char:
            return {"error": f"Character {inp['character_id']} not found"}

        item = lookup_catalog_item(inp["item_id"])
        if item is None:
            return {"error": f"Unknown item: {inp['item_id']}"}

        qty = max(1, int(inp.get("quantity", 1)))
        notes = inp.get("notes", "")

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
            return {"error": "No map loaded"}
        tile = self.game_map.set_tile(inp["x"], inp["y"], inp["tile_type"], inp.get("state"))
        return {"updated": tile.to_dict()}
