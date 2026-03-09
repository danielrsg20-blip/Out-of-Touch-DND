"""5e SRD item catalog: weapons, armor, tools, and adventuring gear."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Item:
    id: str
    name: str
    category: str       # weapon | armor | shield | tool | gear | ammunition
    subcategory: str    # simple/martial | light/medium/heavy | artisan/musical/gaming/specialist | adventuring
    cost_gp: float
    weight_lb: float
    description: str = ""
    # Weapon fields
    damage: str | None = None
    damage_type: str | None = None
    properties: list[str] = field(default_factory=list)
    # Armor fields
    ac_base: int | None = None
    dex_mod: bool = False
    max_dex: int | None = None
    str_req: int | None = None
    stealth_disadvantage: bool = False
    # Per-character inventory state
    equipped: bool = False
    quantity: int = 1
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "subcategory": self.subcategory,
            "cost_gp": self.cost_gp,
            "weight_lb": self.weight_lb,
            "description": self.description,
            "damage": self.damage,
            "damage_type": self.damage_type,
            "properties": list(self.properties),
            "ac_base": self.ac_base,
            "dex_mod": self.dex_mod,
            "max_dex": self.max_dex,
            "str_req": self.str_req,
            "stealth_disadvantage": self.stealth_disadvantage,
            "equipped": self.equipped,
            "quantity": self.quantity,
            "notes": self.notes,
        }


# ---------------------------------------------------------------------------
# Full SRD item catalog
# ---------------------------------------------------------------------------

ITEM_CATALOG: dict[str, Item] = {
    # -----------------------------------------------------------------------
    # Simple Melee Weapons
    # -----------------------------------------------------------------------
    "club": Item("club", "Club", "weapon", "simple", 0.1, 2,
        damage="1d4", damage_type="bludgeoning", properties=["Light"]),
    "dagger": Item("dagger", "Dagger", "weapon", "simple", 2, 1,
        damage="1d4", damage_type="piercing",
        properties=["Finesse", "Light", "Thrown (20/60)"]),
    "greatclub": Item("greatclub", "Greatclub", "weapon", "simple", 0.2, 10,
        damage="1d8", damage_type="bludgeoning", properties=["Two-Handed"]),
    "handaxe": Item("handaxe", "Handaxe", "weapon", "simple", 5, 2,
        damage="1d6", damage_type="slashing",
        properties=["Light", "Thrown (20/60)"]),
    "javelin": Item("javelin", "Javelin", "weapon", "simple", 0.5, 2,
        damage="1d6", damage_type="piercing", properties=["Thrown (30/120)"]),
    "light_hammer": Item("light_hammer", "Light Hammer", "weapon", "simple", 2, 2,
        damage="1d4", damage_type="bludgeoning",
        properties=["Light", "Thrown (20/60)"]),
    "mace": Item("mace", "Mace", "weapon", "simple", 5, 4,
        damage="1d6", damage_type="bludgeoning"),
    "quarterstaff": Item("quarterstaff", "Quarterstaff", "weapon", "simple", 0.2, 4,
        damage="1d6", damage_type="bludgeoning", properties=["Versatile (1d8)"]),
    "sickle": Item("sickle", "Sickle", "weapon", "simple", 1, 2,
        damage="1d4", damage_type="slashing", properties=["Light"]),
    "spear": Item("spear", "Spear", "weapon", "simple", 1, 3,
        damage="1d6", damage_type="piercing",
        properties=["Thrown (20/60)", "Versatile (1d8)"]),

    # Simple Ranged Weapons
    "light_crossbow": Item("light_crossbow", "Light Crossbow", "weapon", "simple", 25, 5,
        damage="1d8", damage_type="piercing",
        properties=["Ammunition (80/320)", "Loading", "Two-Handed"]),
    "shortbow": Item("shortbow", "Shortbow", "weapon", "simple", 25, 2,
        damage="1d6", damage_type="piercing",
        properties=["Ammunition (80/320)", "Two-Handed"]),
    "dart": Item("dart", "Dart", "weapon", "simple", 0.05, 0.25,
        damage="1d4", damage_type="piercing", properties=["Finesse", "Thrown (20/60)"]),
    "sling": Item("sling", "Sling", "weapon", "simple", 0.01, 0,
        damage="1d4", damage_type="bludgeoning", properties=["Ammunition (30/120)"]),

    # -----------------------------------------------------------------------
    # Martial Melee Weapons
    # -----------------------------------------------------------------------
    "battleaxe": Item("battleaxe", "Battleaxe", "weapon", "martial", 10, 4,
        damage="1d8", damage_type="slashing", properties=["Versatile (1d10)"]),
    "flail": Item("flail", "Flail", "weapon", "martial", 10, 2,
        damage="1d8", damage_type="bludgeoning"),
    "glaive": Item("glaive", "Glaive", "weapon", "martial", 20, 6,
        damage="1d10", damage_type="slashing",
        properties=["Heavy", "Reach", "Two-Handed"]),
    "greataxe": Item("greataxe", "Greataxe", "weapon", "martial", 30, 7,
        damage="1d12", damage_type="slashing", properties=["Heavy", "Two-Handed"]),
    "greatsword": Item("greatsword", "Greatsword", "weapon", "martial", 50, 6,
        damage="2d6", damage_type="slashing", properties=["Heavy", "Two-Handed"]),
    "halberd": Item("halberd", "Halberd", "weapon", "martial", 20, 6,
        damage="1d10", damage_type="slashing",
        properties=["Heavy", "Reach", "Two-Handed"]),
    "lance": Item("lance", "Lance", "weapon", "martial", 10, 6,
        damage="1d12", damage_type="piercing",
        properties=["Reach", "Special"]),
    "longsword": Item("longsword", "Longsword", "weapon", "martial", 15, 3,
        damage="1d8", damage_type="slashing", properties=["Versatile (1d10)"]),
    "maul": Item("maul", "Maul", "weapon", "martial", 10, 10,
        damage="2d6", damage_type="bludgeoning", properties=["Heavy", "Two-Handed"]),
    "morningstar": Item("morningstar", "Morningstar", "weapon", "martial", 15, 4,
        damage="1d8", damage_type="piercing"),
    "pike": Item("pike", "Pike", "weapon", "martial", 5, 18,
        damage="1d10", damage_type="piercing",
        properties=["Heavy", "Reach", "Two-Handed"]),
    "rapier": Item("rapier", "Rapier", "weapon", "martial", 25, 2,
        damage="1d8", damage_type="piercing", properties=["Finesse"]),
    "scimitar": Item("scimitar", "Scimitar", "weapon", "martial", 25, 3,
        damage="1d6", damage_type="slashing", properties=["Finesse", "Light"]),
    "shortsword": Item("shortsword", "Shortsword", "weapon", "martial", 10, 2,
        damage="1d6", damage_type="piercing", properties=["Finesse", "Light"]),
    "trident": Item("trident", "Trident", "weapon", "martial", 5, 4,
        damage="1d6", damage_type="piercing",
        properties=["Thrown (20/60)", "Versatile (1d8)"]),
    "warhammer": Item("warhammer", "Warhammer", "weapon", "martial", 15, 2,
        damage="1d8", damage_type="bludgeoning", properties=["Versatile (1d10)"]),
    "war_pick": Item("war_pick", "War Pick", "weapon", "martial", 5, 2,
        damage="1d8", damage_type="piercing"),
    "whip": Item("whip", "Whip", "weapon", "martial", 2, 3,
        damage="1d4", damage_type="slashing", properties=["Finesse", "Reach"]),

    # Martial Ranged Weapons
    "hand_crossbow": Item("hand_crossbow", "Hand Crossbow", "weapon", "martial", 75, 3,
        damage="1d6", damage_type="piercing",
        properties=["Ammunition (30/120)", "Light", "Loading"]),
    "heavy_crossbow": Item("heavy_crossbow", "Heavy Crossbow", "weapon", "martial", 50, 18,
        damage="1d10", damage_type="piercing",
        properties=["Ammunition (100/400)", "Heavy", "Loading", "Two-Handed"]),
    "longbow": Item("longbow", "Longbow", "weapon", "martial", 50, 2,
        damage="1d8", damage_type="piercing",
        properties=["Ammunition (150/600)", "Heavy", "Two-Handed"]),
    "net": Item("net", "Net", "weapon", "martial", 1, 3,
        properties=["Special", "Thrown (5/15)"]),

    # -----------------------------------------------------------------------
    # Light Armor
    # -----------------------------------------------------------------------
    "padded_armor": Item("padded_armor", "Padded Armor", "armor", "light", 5, 8,
        ac_base=11, dex_mod=True, stealth_disadvantage=True),
    "leather_armor": Item("leather_armor", "Leather Armor", "armor", "light", 10, 10,
        ac_base=11, dex_mod=True),
    "studded_leather": Item("studded_leather", "Studded Leather", "armor", "light", 45, 13,
        ac_base=12, dex_mod=True),

    # Medium Armor
    "hide_armor": Item("hide_armor", "Hide Armor", "armor", "medium", 10, 12,
        ac_base=12, dex_mod=True, max_dex=2),
    "chain_shirt": Item("chain_shirt", "Chain Shirt", "armor", "medium", 50, 20,
        ac_base=13, dex_mod=True, max_dex=2),
    "scale_mail": Item("scale_mail", "Scale Mail", "armor", "medium", 50, 45,
        ac_base=14, dex_mod=True, max_dex=2, stealth_disadvantage=True),
    "breastplate": Item("breastplate", "Breastplate", "armor", "medium", 400, 20,
        ac_base=14, dex_mod=True, max_dex=2),
    "half_plate": Item("half_plate", "Half Plate", "armor", "medium", 750, 40,
        ac_base=15, dex_mod=True, max_dex=2, stealth_disadvantage=True),

    # Heavy Armor
    "ring_mail": Item("ring_mail", "Ring Mail", "armor", "heavy", 30, 40,
        ac_base=14, dex_mod=False, stealth_disadvantage=True),
    "chain_mail": Item("chain_mail", "Chain Mail", "armor", "heavy", 75, 55,
        ac_base=16, dex_mod=False, str_req=13, stealth_disadvantage=True),
    "splint_armor": Item("splint_armor", "Splint Armor", "armor", "heavy", 200, 60,
        ac_base=17, dex_mod=False, str_req=15, stealth_disadvantage=True),
    "plate_armor": Item("plate_armor", "Plate Armor", "armor", "heavy", 1500, 65,
        ac_base=18, dex_mod=False, str_req=15, stealth_disadvantage=True),

    # Shield
    "shield": Item("shield", "Shield", "shield", "shield", 10, 6,
        description="+2 AC. Requires one free hand.",
        ac_base=2),

    # -----------------------------------------------------------------------
    # Tools
    # -----------------------------------------------------------------------
    "thieves_tools": Item("thieves_tools", "Thieves' Tools", "tool", "specialist", 25, 1,
        description="Pick locks and disarm traps. Required for Rogue's Thieves' Cant proficiency."),
    "healer_kit": Item("healer_kit", "Healer's Kit", "tool", "specialist", 5, 3,
        description="Stabilize dying creatures. 10 uses.", quantity=1),
    "herbalism_kit": Item("herbalism_kit", "Herbalism Kit", "tool", "specialist", 5, 3,
        description="Identify and apply herbs. Create antitoxin and potions."),
    "poisoner_kit": Item("poisoner_kit", "Poisoner's Kit", "tool", "specialist", 50, 2,
        description="Harvest and apply poisons."),
    "navigator_tools": Item("navigator_tools", "Navigator's Tools", "tool", "specialist", 25, 2,
        description="Navigate by stars and chart courses."),
    "disguise_kit": Item("disguise_kit", "Disguise Kit", "tool", "specialist", 25, 3,
        description="Create disguises. 1 use each component."),
    "forgery_kit": Item("forgery_kit", "Forgery Kit", "tool", "specialist", 15, 5,
        description="Create forged documents."),
    "component_pouch": Item("component_pouch", "Component Pouch", "tool", "specialist", 25, 2,
        description="Holds material spell components (not costly or consumed)."),
    "holy_symbol": Item("holy_symbol", "Holy Symbol", "tool", "specialist", 5, 1,
        description="Divine focus for clerics and paladins. Can be an amulet, emblem, or reliquary."),
    "druidic_focus": Item("druidic_focus", "Druidic Focus", "tool", "specialist", 1, 1,
        description="Sprig of mistletoe, totem, staff, or yew wand. Spell focus for druids."),
    "arcane_focus": Item("arcane_focus", "Arcane Focus", "tool", "specialist", 10, 1,
        description="Crystal, orb, rod, staff, or wand. Spell focus for arcane casters."),
    "spellbook": Item("spellbook", "Spellbook", "tool", "specialist", 50, 3,
        description="Contains wizard spells. 100 pages."),
    # Artisan Tools
    "alchemist_supplies": Item("alchemist_supplies", "Alchemist's Supplies", "tool", "artisan", 50, 8),
    "brewer_supplies": Item("brewer_supplies", "Brewer's Supplies", "tool", "artisan", 20, 9),
    "calligrapher_supplies": Item("calligrapher_supplies", "Calligrapher's Supplies", "tool", "artisan", 10, 5),
    "carpenter_tools": Item("carpenter_tools", "Carpenter's Tools", "tool", "artisan", 8, 6),
    "cartographer_tools": Item("cartographer_tools", "Cartographer's Tools", "tool", "artisan", 15, 6),
    "cobbler_tools": Item("cobbler_tools", "Cobbler's Tools", "tool", "artisan", 5, 5),
    "cook_utensils": Item("cook_utensils", "Cook's Utensils", "tool", "artisan", 1, 8),
    "glassblower_tools": Item("glassblower_tools", "Glassblower's Tools", "tool", "artisan", 30, 5),
    "jeweler_tools": Item("jeweler_tools", "Jeweler's Tools", "tool", "artisan", 25, 2),
    "leatherworker_tools": Item("leatherworker_tools", "Leatherworker's Tools", "tool", "artisan", 5, 5),
    "mason_tools": Item("mason_tools", "Mason's Tools", "tool", "artisan", 10, 8),
    "painter_supplies": Item("painter_supplies", "Painter's Supplies", "tool", "artisan", 10, 5),
    "potter_tools": Item("potter_tools", "Potter's Tools", "tool", "artisan", 10, 3),
    "smith_tools": Item("smith_tools", "Smith's Tools", "tool", "artisan", 20, 8),
    "tinker_tools": Item("tinker_tools", "Tinker's Tools", "tool", "artisan", 50, 10),
    "weaver_tools": Item("weaver_tools", "Weaver's Tools", "tool", "artisan", 1, 5),
    "woodcarver_tools": Item("woodcarver_tools", "Woodcarver's Tools", "tool", "artisan", 1, 5),
    # Musical Instruments
    "bagpipes": Item("bagpipes", "Bagpipes", "tool", "musical", 30, 6),
    "drum": Item("drum", "Drum", "tool", "musical", 6, 3),
    "dulcimer": Item("dulcimer", "Dulcimer", "tool", "musical", 25, 10),
    "flute": Item("flute", "Flute", "tool", "musical", 2, 1),
    "lute": Item("lute", "Lute", "tool", "musical", 35, 2),
    "lyre": Item("lyre", "Lyre", "tool", "musical", 30, 2),
    "horn": Item("horn", "Horn", "tool", "musical", 3, 2),
    "pan_flute": Item("pan_flute", "Pan Flute", "tool", "musical", 12, 2),
    "shawm": Item("shawm", "Shawm", "tool", "musical", 2, 1),
    "viol": Item("viol", "Viol", "tool", "musical", 30, 1),
    # Gaming Sets
    "dice_set": Item("dice_set", "Dice Set", "tool", "gaming", 0.01, 0),
    "dragonchess_set": Item("dragonchess_set", "Dragonchess Set", "tool", "gaming", 1, 0.5),
    "playing_card_set": Item("playing_card_set", "Playing Card Set", "tool", "gaming", 0.05, 0),
    "three_dragon_ante": Item("three_dragon_ante", "Three-Dragon Ante Set", "tool", "gaming", 1, 0),

    # -----------------------------------------------------------------------
    # Ammunition
    # -----------------------------------------------------------------------
    "arrow": Item("arrow", "Arrow", "ammunition", "arrow", 0.05, 0.075,
        description="Standard arrow for shortbows and longbows."),
    "bolt": Item("bolt", "Bolt", "ammunition", "bolt", 0.05, 0.075,
        description="Standard bolt for crossbows."),
    "sling_bullet": Item("sling_bullet", "Sling Bullet", "ammunition", "bullet", 0.002, 0.075),
    "blowgun_needle": Item("blowgun_needle", "Blowgun Needle", "ammunition", "needle", 0.02, 0.02),

    # -----------------------------------------------------------------------
    # Adventuring Gear
    # -----------------------------------------------------------------------
    "backpack": Item("backpack", "Backpack", "gear", "adventuring", 2, 5,
        description="Holds up to 30 lb / 1 cubic foot."),
    "bedroll": Item("bedroll", "Bedroll", "gear", "adventuring", 1, 7),
    "blanket": Item("blanket", "Blanket", "gear", "adventuring", 0.5, 3),
    "candle": Item("candle", "Candle", "gear", "adventuring", 0.01, 0,
        description="Sheds dim light in 5-foot radius for 1 hour."),
    "chain_10ft": Item("chain_10ft", "Chain (10 ft)", "gear", "adventuring", 5, 10,
        description="Iron chain. DC 20 STR to break."),
    "climbers_kit": Item("climbers_kit", "Climber's Kit", "gear", "adventuring", 25, 12,
        description="Pitons, boot tips, gloves, harness. Advantage on climbing checks."),
    "crowbar": Item("crowbar", "Crowbar", "gear", "adventuring", 2, 5,
        description="Advantage on STR checks where leverage applies."),
    "grappling_hook": Item("grappling_hook", "Grappling Hook", "gear", "adventuring", 2, 4),
    "hammer": Item("hammer", "Hammer", "gear", "adventuring", 1, 3),
    "hunting_trap": Item("hunting_trap", "Hunting Trap", "gear", "adventuring", 5, 25,
        description="DC 13 DEX or restrained. 1d4 piercing damage."),
    "lantern_bullseye": Item("lantern_bullseye", "Bullseye Lantern", "gear", "adventuring", 10, 2,
        description="60-foot cone of bright light, 120-foot cone of dim light. 6 hours per flask of oil."),
    "lantern_hooded": Item("lantern_hooded", "Hooded Lantern", "gear", "adventuring", 5, 2,
        description="30-foot bright light, 60-foot dim light. 6 hours per flask of oil. Can be shuttered."),
    "mess_kit": Item("mess_kit", "Mess Kit", "gear", "adventuring", 0.2, 1,
        description="Tin box with cup, cutlery. Cook food over fire."),
    "mirror_steel": Item("mirror_steel", "Steel Mirror", "gear", "adventuring", 5, 0.5),
    "oil_flask": Item("oil_flask", "Oil (flask)", "gear", "adventuring", 0.1, 1,
        description="Fuel for lanterns. Can be thrown (5 ft DC 10 DEX, 5 fire damage on fail for 2 rounds)."),
    "pouch": Item("pouch", "Pouch", "gear", "adventuring", 0.5, 1,
        description="Holds up to 6 lb / 1/5 cubic foot."),
    "rations": Item("rations", "Rations (1 day)", "gear", "adventuring", 0.5, 2,
        description="Dry food for one day. Hardtack, jerky, dried fruit."),
    "rope_hempen": Item("rope_hempen", "Rope, Hempen (50 ft)", "gear", "adventuring", 1, 10,
        description="DC 17 STR to break."),
    "rope_silk": Item("rope_silk", "Rope, Silk (50 ft)", "gear", "adventuring", 10, 5,
        description="DC 17 STR to break. Lighter than hempen."),
    "sack": Item("sack", "Sack", "gear", "adventuring", 0.01, 0.5,
        description="Holds up to 30 lb / 1 cubic foot."),
    "shovel": Item("shovel", "Shovel", "gear", "adventuring", 2, 5),
    "signal_whistle": Item("signal_whistle", "Signal Whistle", "gear", "adventuring", 0.05, 0),
    "tent": Item("tent", "Tent, Two-Person", "gear", "adventuring", 2, 20,
        description="Portable shelter for two."),
    "tinderbox": Item("tinderbox", "Tinderbox", "gear", "adventuring", 0.5, 1,
        description="Start fire in 1 action. DC 10 survival to light in wind."),
    "torch": Item("torch", "Torch", "gear", "adventuring", 0.01, 1,
        description="Bright light 20 ft, dim light 20 ft more. Burns 1 hour. 1 bludgeoning damage."),
    "vial": Item("vial", "Vial", "gear", "adventuring", 1, 0,
        description="Glass container holding 4 oz liquid."),
    "waterskin": Item("waterskin", "Waterskin", "gear", "adventuring", 0.2, 5,
        description="Holds 4 pints of liquid."),
    "whetstone": Item("whetstone", "Whetstone", "gear", "adventuring", 0.01, 1),
    "ink_vial": Item("ink_vial", "Ink (1 ounce bottle)", "gear", "adventuring", 10, 0),
    "ink_pen": Item("ink_pen", "Ink Pen", "gear", "adventuring", 0.02, 0),
    "parchment": Item("parchment", "Parchment (1 sheet)", "gear", "adventuring", 0.1, 0),
    "paper": Item("paper", "Paper (1 sheet)", "gear", "adventuring", 0.2, 0),
    "book": Item("book", "Book", "gear", "adventuring", 25, 5,
        description="Contains lore, recipes, or other written material."),
    "piton": Item("piton", "Piton", "gear", "adventuring", 0.05, 0.25),
    "iron_spike": Item("iron_spike", "Iron Spike", "gear", "adventuring", 0.01, 0.5),
    "caltrops_bag": Item("caltrops_bag", "Caltrops (bag of 20)", "gear", "adventuring", 1, 2,
        description="Scatter in 5-sq-ft area. DC 15 DEX or speed halved until healed."),
    "ball_bearings": Item("ball_bearings", "Ball Bearings (bag of 1000)", "gear", "adventuring", 1, 2,
        description="Scatter in 10-sq-ft area. DC 10 DEX or fall prone."),
    "soap": Item("soap", "Soap", "gear", "adventuring", 0.02, 0),
    "sealing_wax": Item("sealing_wax", "Sealing Wax", "gear", "adventuring", 0.5, 0),
    "perfume": Item("perfume", "Perfume (vial)", "gear", "adventuring", 5, 0),
    "manacles": Item("manacles", "Manacles", "gear", "adventuring", 2, 6,
        description="DC 20 DEX (thieves' tools) or STR 20 to escape."),
    "magnifying_glass": Item("magnifying_glass", "Magnifying Glass", "gear", "adventuring", 100, 0,
        description="Examine small objects. Start fire with sunlight (1 minute)."),
    "hourglass": Item("hourglass", "Hourglass", "gear", "adventuring", 25, 1),
    "healing_potion": Item("healing_potion", "Potion of Healing", "gear", "adventuring", 50, 0.5,
        description="Drink (action) to regain 2d4+2 HP."),
    "antitoxin": Item("antitoxin", "Antitoxin (vial)", "gear", "adventuring", 50, 0,
        description="Advantage on CON saves vs poison for 1 hour."),
    "holy_water": Item("holy_water", "Holy Water (flask)", "gear", "adventuring", 25, 1,
        description="Throw at fiend or undead: DC 13 DEX or 2d6 radiant damage."),
}


# ---------------------------------------------------------------------------
# Starting equipment by class (SRD defaults)
# ---------------------------------------------------------------------------

# Each entry: (item_id, quantity)
STARTING_EQUIPMENT: dict[str, list[tuple[str, int]]] = {
    "Barbarian": [
        ("greataxe", 1),
        ("handaxe", 2),
        ("backpack", 1),
        ("rations", 4),
        ("rope_hempen", 1),
        ("tinderbox", 1),
        ("torch", 10),
    ],
    "Bard": [
        ("rapier", 1),
        ("leather_armor", 1),
        ("dagger", 1),
        ("lute", 1),
        ("backpack", 1),
        ("bedroll", 1),
        ("waterskin", 1),
        ("rations", 5),
        ("candle", 5),
    ],
    "Cleric": [
        ("mace", 1),
        ("scale_mail", 1),
        ("shield", 1),
        ("holy_symbol", 1),
        ("backpack", 1),
        ("blanket", 1),
        ("candle", 10),
        ("tinderbox", 1),
        ("rations", 2),
        ("waterskin", 1),
    ],
    "Druid": [
        ("scimitar", 1),
        ("leather_armor", 1),
        ("shield", 1),
        ("druidic_focus", 1),
        ("backpack", 1),
        ("bedroll", 1),
        ("rations", 2),
        ("waterskin", 1),
        ("rope_hempen", 1),
    ],
    "Fighter": [
        ("chain_mail", 1),
        ("longsword", 1),
        ("shield", 1),
        ("handaxe", 2),
        ("backpack", 1),
        ("crowbar", 1),
        ("hammer", 1),
        ("piton", 10),
        ("torch", 10),
        ("tinderbox", 1),
        ("rations", 10),
        ("waterskin", 1),
        ("rope_hempen", 1),
    ],
    "Monk": [
        ("shortsword", 1),
        ("dart", 10),
        ("backpack", 1),
        ("bedroll", 1),
        ("tinderbox", 1),
        ("torch", 10),
        ("rations", 10),
        ("waterskin", 1),
        ("rope_hempen", 1),
    ],
    "Paladin": [
        ("longsword", 1),
        ("chain_mail", 1),
        ("shield", 1),
        ("javelin", 5),
        ("holy_symbol", 1),
        ("backpack", 1),
        ("blanket", 1),
        ("candle", 10),
        ("tinderbox", 1),
        ("rations", 2),
        ("waterskin", 1),
    ],
    "Ranger": [
        ("scale_mail", 1),
        ("shortsword", 2),
        ("longbow", 1),
        ("arrow", 20),
        ("backpack", 1),
        ("bedroll", 1),
        ("mess_kit", 1),
        ("tinderbox", 1),
        ("torch", 10),
        ("rations", 10),
        ("waterskin", 1),
        ("rope_hempen", 1),
    ],
    "Rogue": [
        ("rapier", 1),
        ("leather_armor", 1),
        ("shortbow", 1),
        ("arrow", 20),
        ("thieves_tools", 1),
        ("dagger", 2),
        ("backpack", 1),
        ("ball_bearings", 1),
        ("rope_hempen", 1),
        ("crowbar", 1),
        ("hammer", 1),
        ("piton", 10),
        ("lantern_hooded", 1),
        ("oil_flask", 2),
        ("rations", 5),
        ("tinderbox", 1),
        ("waterskin", 1),
    ],
    "Sorcerer": [
        ("dagger", 2),
        ("light_crossbow", 1),
        ("bolt", 20),
        ("component_pouch", 1),
        ("backpack", 1),
        ("bedroll", 1),
        ("mess_kit", 1),
        ("tinderbox", 1),
        ("torch", 10),
        ("rations", 10),
        ("waterskin", 1),
        ("rope_hempen", 1),
    ],
    "Warlock": [
        ("light_crossbow", 1),
        ("bolt", 20),
        ("leather_armor", 1),
        ("dagger", 2),
        ("component_pouch", 1),
        ("backpack", 1),
        ("book", 1),
        ("ink_vial", 1),
        ("ink_pen", 1),
        ("parchment", 10),
        ("waterskin", 1),
    ],
    "Wizard": [
        ("quarterstaff", 1),
        ("dagger", 1),
        ("component_pouch", 1),
        ("spellbook", 1),
        ("backpack", 1),
        ("book", 1),
        ("ink_vial", 1),
        ("ink_pen", 1),
        ("parchment", 10),
        ("waterskin", 1),
    ],
}


# ---------------------------------------------------------------------------
# Starting gold by class (SRD average values for the wealth-by-class table)
# ---------------------------------------------------------------------------

STARTING_GOLD: dict[str, int] = {
    "Barbarian": 25,
    "Bard": 62,
    "Cleric": 37,
    "Druid": 25,
    "Fighter": 62,
    "Monk": 12,
    "Paladin": 62,
    "Ranger": 62,
    "Rogue": 62,
    "Sorcerer": 37,
    "Warlock": 37,
    "Wizard": 37,
}


def get_starting_inventory(char_class: str) -> list[dict[str, Any]]:
    """Return a list of item dicts for a character's starting equipment.

    The first weapon and first armor found are auto-equipped.
    """
    items: list[dict[str, Any]] = []
    equipped_weapon = False
    equipped_armor = False
    equipped_shield = False

    for item_id, qty in STARTING_EQUIPMENT.get(char_class, []):
        item = ITEM_CATALOG.get(item_id)
        if item is None:
            continue

        item_dict = item.to_dict()
        item_dict["quantity"] = qty

        if item.category == "weapon" and not equipped_weapon:
            item_dict["equipped"] = True
            equipped_weapon = True
        elif item.category == "armor" and not equipped_armor:
            item_dict["equipped"] = True
            equipped_armor = True
        elif item.category == "shield" and not equipped_shield:
            item_dict["equipped"] = True
            equipped_shield = True

        items.append(item_dict)

    return items


def calculate_ac_from_inventory(inventory: list[dict[str, Any]], dex_modifier: int) -> int:
    """Calculate AC from equipped items in inventory."""
    armor = next(
        (i for i in inventory if i.get("equipped") and i.get("category") == "armor"),
        None,
    )
    has_shield = any(
        i.get("equipped") and i.get("category") == "shield"
        for i in inventory
    )

    if armor is None:
        ac = 10 + dex_modifier
    else:
        ac = armor["ac_base"]
        if armor["dex_mod"]:
            max_dex = armor.get("max_dex")
            dex_bonus = dex_modifier if max_dex is None else min(dex_modifier, max_dex)
            ac += dex_bonus

    if has_shield:
        ac += 2

    return ac


def find_item_in_inventory(inventory: list[dict], item_id: str) -> dict | None:
    """Find item in inventory by id or name (case-insensitive)."""
    item_id_lower = item_id.lower()
    for item in inventory:
        if item.get("id", "").lower() == item_id_lower:
            return item
        if item.get("name", "").lower() == item_id_lower:
            return item
    return None


def lookup_catalog_item(item_id: str) -> Item | None:
    """Look up an item by id or name (case-insensitive)."""
    if item_id in ITEM_CATALOG:
        return ITEM_CATALOG[item_id]
    item_id_lower = item_id.lower().replace(" ", "_").replace("'", "").replace(",", "")
    if item_id_lower in ITEM_CATALOG:
        return ITEM_CATALOG[item_id_lower]
    # Search by name
    for item in ITEM_CATALOG.values():
        if item.name.lower() == item_id.lower():
            return item
    return None
