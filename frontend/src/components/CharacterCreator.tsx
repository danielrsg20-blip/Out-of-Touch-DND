import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useSessionStore } from "../stores/sessionStore";
import { useGameStore } from "../stores/gameStore";
import { invokeEdgeFunction } from "../lib/supabaseClient";
import { callBackendApi } from "../lib/backendApi";
import { useAuthStore } from "../stores/authStore";
import { getCharacterSpriteId } from "../config/characterSprites";
import type { CharacterData, SpellOption } from "../types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const RACES = [
  "Human",
  "Elf",
  "Dwarf",
  "Halfling",
  "Dragonborn",
  "Gnome",
  "Half-Elf",
  "Half-Orc",
  "Tiefling",
];
const CLASSES = [
  "Barbarian",
  "Bard",
  "Cleric",
  "Druid",
  "Fighter",
  "Monk",
  "Paladin",
  "Ranger",
  "Rogue",
  "Sorcerer",
  "Warlock",
  "Wizard",
];
const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};
const POINT_BUY_BUDGET = 27;

const RACE_ABILITY_BONUSES: Record<string, Record<string, number>> = {
  Human:      { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 },
  Elf:        { DEX: 2 },
  Dwarf:      { CON: 2 },
  Halfling:   { DEX: 2 },
  Dragonborn: { STR: 2, CHA: 1 },
  Gnome:      { INT: 2 },
  "Half-Elf": { CHA: 2 },
  "Half-Orc": { STR: 2, CON: 1 },
  Tiefling:   { CHA: 2, INT: 1 },
};

const CLASS_HIT_DICE: Record<string, number> = {
  Barbarian: 12,
  Bard: 8,
  Cleric: 8,
  Druid: 8,
  Fighter: 10,
  Monk: 8,
  Paladin: 10,
  Ranger: 10,
  Rogue: 8,
  Sorcerer: 6,
  Warlock: 8,
  Wizard: 6,
};

const RACE_SPEEDS: Record<string, number> = {
  Human: 30,
  Elf: 30,
  Dwarf: 25,
  Halfling: 25,
  Dragonborn: 30,
  Gnome: 25,
  "Half-Elf": 30,
  "Half-Orc": 30,
  Tiefling: 30,
};

const CLASS_HINTS: Record<string, string> = {
  Barbarian: "Rage-fuelled melee warrior — thrives on STR & CON.",
  Bard: "Arcane performer who inspires allies — relies on CHA.",
  Cleric: "Divine conduit of the gods — WIS governs your spells.",
  Druid: "Nature shapeshifter and caster — powered by WIS.",
  Fighter: "Master of weapons and tactics — STR or DEX focused.",
  Monk: "Martial artist channelling ki — DEX & WIS matter most.",
  Paladin: "Holy warrior of sacred oaths — STR and CHA.",
  Ranger: "Wilderness hunter and tracker — DEX & WIS.",
  Rogue: "Shadow operative with deadly precision — DEX is key.",
  Sorcerer: "Magic runs in your blood — CHA fuels your power.",
  Warlock: "Patron-bound wielder of eldritch might — CHA.",
  Wizard: "Scholar of the arcane arts — INT is everything.",
};

const CLASS_PRIMARY_STATS: Record<string, string[]> = {
  Barbarian: ["STR", "CON"],
  Bard: ["CHA"],
  Cleric: ["WIS"],
  Druid: ["WIS"],
  Fighter: ["STR", "DEX"],
  Monk: ["DEX", "WIS"],
  Paladin: ["STR", "CHA"],
  Ranger: ["DEX", "WIS"],
  Rogue: ["DEX"],
  Sorcerer: ["CHA"],
  Warlock: ["CHA"],
  Wizard: ["INT"],
};

type CharacterSpriteOption = {
  id: string;
  label: string;
  races: string[];
  classes: string[];
};

const CHARACTER_SPRITES: CharacterSpriteOption[] = [
  {
    id: "pc_knight",
    label: "Knight",
    races: ["Human", "Dragonborn", "Half-Orc"],
    classes: ["Fighter", "Paladin", "Barbarian"],
  },
  {
    id: "pc_ranger",
    label: "Ranger",
    races: ["Elf", "Half-Elf", "Human", "Halfling"],
    classes: ["Ranger", "Druid", "Rogue"],
  },
  {
    id: "pc_mage",
    label: "Mage",
    races: ["Human", "Elf", "Gnome", "Tiefling"],
    classes: ["Wizard", "Sorcerer", "Warlock"],
  },
  {
    id: "pc_cleric",
    label: "Cleric",
    races: ["Human", "Dwarf", "Half-Elf"],
    classes: ["Cleric", "Paladin"],
  },
  {
    id: "pc_bard",
    label: "Bard",
    races: ["Human", "Elf", "Half-Elf", "Tiefling"],
    classes: ["Bard", "Rogue"],
  },
  {
    id: "pc_monk",
    label: "Monk",
    races: ["Human", "Elf", "Gnome", "Half-Orc"],
    classes: ["Monk", "Rogue"],
  },
  {
    id: "pc_druid",
    label: "Druid",
    races: ["Elf", "Gnome", "Halfling", "Half-Elf"],
    classes: ["Druid", "Ranger", "Cleric"],
  },
  {
    id: "pc_rogue",
    label: "Rogue",
    races: ["Halfling", "Human", "Tiefling", "Half-Elf"],
    classes: ["Rogue", "Ranger", "Bard"],
  },
];

const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  key: i,
  left: (Math.sin(i * 3.1) * 0.5 + 0.5) * 100,
  top: (Math.cos(i * 1.9) * 0.5 + 0.5) * 100,
  size: 1.2 + Math.abs(Math.sin(i * 4.7)) * 2.0,
  duration: 8 + Math.abs(Math.cos(i * 1.3)) * 10,
  delay: -(Math.abs(Math.sin(i * 1.2 + 0.7)) * 8),
  opacity: 0.08 + Math.abs(Math.sin(i * 2.5 + 1)) * 0.22,
  xDrift: 2 + Math.abs(Math.sin(i * 2.1)) * 5,
  yDrift: 15 + Math.abs(Math.cos(i * 1.8)) * 10,
}));

const BACKGROUNDS_FE = [
  {
    name: "Acolyte",
    skills: ["Insight", "Religion"],
    desc: "Served in a temple or holy order.",
  },
  {
    name: "Criminal",
    skills: ["Deception", "Stealth"],
    desc: "Experience with the criminal underworld.",
  },
  {
    name: "Folk Hero",
    skills: ["Animal Handling", "Survival"],
    desc: "Champion of the common people.",
  },
  {
    name: "Guild Artisan",
    skills: ["Insight", "Persuasion"],
    desc: "Skilled craftsperson and guild member.",
  },
  {
    name: "Hermit",
    skills: ["Medicine", "Religion"],
    desc: "Lived in seclusion seeking wisdom.",
  },
  {
    name: "Noble",
    skills: ["History", "Persuasion"],
    desc: "Born into wealth and privilege.",
  },
  {
    name: "Outlander",
    skills: ["Athletics", "Survival"],
    desc: "Grew up in wilderness far from civilization.",
  },
  {
    name: "Sage",
    skills: ["Arcana", "History"],
    desc: "Scholar devoted to arcane knowledge.",
  },
  {
    name: "Sailor",
    skills: ["Athletics", "Perception"],
    desc: "Lived on a ship and the open sea.",
  },
  {
    name: "Soldier",
    skills: ["Athletics", "Intimidation"],
    desc: "Trained warrior with military experience.",
  },
  {
    name: "Urchin",
    skills: ["Sleight of Hand", "Stealth"],
    desc: "Grew up poor on city streets.",
  },
] as const;

function SectionHeading({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-[0.72rem] text-[#e4a853] shrink-0">{icon}</span>
      <span className="font-fantasy text-[0.62rem] uppercase tracking-[0.12em] text-[#e4a853] font-bold whitespace-nowrap">
        {label}
      </span>
      <div
        className="flex-1 h-px"
        style={{
          background:
            "linear-gradient(90deg, rgba(228,168,83,0.3), transparent)",
        }}
      />
    </div>
  );
}

// Native select styled to match the dark theme
function ThemedSelect({
  id,
  value,
  onChange,
  children,
}: {
  id?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={onChange}
      className="w-full bg-[rgba(26,26,62,0.85)] border border-[#2a2a4a] text-[#e0e0e0] px-3 py-2.5 rounded-lg text-[0.92rem] outline-none transition-all cursor-pointer appearance-none focus:border-[#e4a853] focus:shadow-[0_0_0_3px_rgba(228,168,83,0.12)]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23a0a0b0' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.75rem center",
        paddingRight: "2.2rem",
      }}
    >
      {children}
    </select>
  );
}

function getSpriteOptionsFor(
  race: string,
  charClass: string,
): CharacterSpriteOption[] {
  const mappedSpriteId = getCharacterSpriteId(charClass, race);
  if (mappedSpriteId) {
    return [
      {
        id: mappedSpriteId,
        label: `${race} ${charClass}`,
        races: [race],
        classes: [charClass],
      },
    ];
  }
  const raceNorm = race.trim().toLowerCase();
  const classNorm = charClass.trim().toLowerCase();
  const filtered = CHARACTER_SPRITES.filter(
    (opt) =>
      opt.races.some((r) => r.toLowerCase() === raceNorm) ||
      opt.classes.some((c) => c.toLowerCase() === classNorm),
  );
  return filtered.length > 0 ? filtered : CHARACTER_SPRITES;
}

export default function CharacterCreator() {
  const {
    roomCode,
    playerId,
    players,
    getSession,
    mockMode,
    campaignTitle,
    reset,
  } = useSessionStore();
  const setCharacters = useGameStore((s) => s.setCharacters);
  const token = useAuthStore((s) => s.token);

  const [name, setName] = useState("");
  const [race, setRace] = useState("Human");
  const [charClass, setCharClass] = useState("Fighter");
  const [spriteId, setSpriteId] = useState("pc_knight");
  const [abilities, setAbilities] = useState<Record<string, number>>(() => {
    const obj: Record<string, number> = {};
    ABILITIES.forEach((a, i) => {
      obj[a] = STANDARD_ARRAY[i];
    });
    return obj;
  });
  const [creating, setCreating] = useState(false);
  const [spellcastingMode, setSpellcastingMode] = useState<
    "none" | "known" | "prepared"
  >("none");
  const [knownLimit, setKnownLimit] = useState(0);
  const [preparedLimit, setPreparedLimit] = useState(0);
  const [cantripLimit, setCantripLimit] = useState(0);
  const [availableSpells, setAvailableSpells] = useState<SpellOption[]>([]);
  const [selectedKnownSpells, setSelectedKnownSpells] = useState<string[]>([]);
  const [selectedPreparedSpells, setSelectedPreparedSpells] = useState<
    string[]
  >([]);
  const [selectedCantrips, setSelectedCantrips] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [scoringMethod, setScoringMethod] = useState<
    "standard" | "pointbuy" | "roll"
  >("standard");
  const [selectedBackground, setSelectedBackground] = useState("");
  const [alignment, setAlignment] = useState("");
  const [skillChoices, setSkillChoices] = useState<{
    count: number;
    options: string[];
  } | null>(null);
  const [selectedClassSkills, setSelectedClassSkills] = useState<string[]>([]);
  const [halfElfChoices, setHalfElfChoices] = useState<string[]>([]);

  // Derived: base + racial bonuses (used for display and stat preview)
  const finalAbilities = ABILITIES.reduce(
    (acc, ab) => {
      acc[ab] = abilities[ab] + (RACE_ABILITY_BONUSES[race]?.[ab] ?? 0);
      return acc;
    },
    {} as Record<string, number>,
  );
  const abilityMod = (score: number) => Math.floor((score - 10) / 2);

  const previewHP =
    (CLASS_HIT_DICE[charClass] ?? 8) + abilityMod(finalAbilities.CON ?? 10);
  const previewAC = 10 + abilityMod(finalAbilities.DEX ?? 10);
  const previewSpeed = RACE_SPEEDS[race] ?? 30;

  const pointBuySpent =
    scoringMethod === "pointbuy"
      ? ABILITIES.reduce(
          (sum, ab) =>
            sum +
            (POINT_BUY_COST[Math.min(15, Math.max(8, abilities[ab]))] ?? 0),
          0,
        )
      : 0;
  const pointBuyRemaining = POINT_BUY_BUDGET - pointBuySpent;

  const roll4d6DropLowest = (): number => {
    const rolls = Array.from(
      { length: 4 },
      () => Math.floor(Math.random() * 6) + 1,
    );
    rolls.sort((a, b) => a - b);
    return rolls.slice(1).reduce((s, n) => s + n, 0);
  };

  const handleScoringMethodChange = (
    method: "standard" | "pointbuy" | "roll",
  ) => {
    setScoringMethod(method);
    const obj: Record<string, number> = {};
    if (method === "pointbuy") {
      ABILITIES.forEach((a) => {
        obj[a] = 8;
      });
    } else if (method === "roll") {
      ABILITIES.forEach((a) => {
        obj[a] = roll4d6DropLowest();
      });
    } else {
      ABILITIES.forEach((a, i) => {
        obj[a] = STANDARD_ARRAY[i];
      });
    }
    setAbilities(obj);
  };

  const rollSingleAbility = (ability: string) => {
    setAbilities((prev) => ({ ...prev, [ability]: roll4d6DropLowest() }));
  };

  const handleAbilityChange = (ability: string, value: number) => {
    setAbilities((prev) => ({
      ...prev,
      [ability]: Math.max(3, Math.min(20, value)),
    }));
  };

  const loadSpellOptions = async (nextClass: string) => {
    try {
      const payload = await invokeEdgeFunction<Record<string, unknown>>(
        "dm-action",
        {
          action: "get_spell_options",
          char_class: nextClass,
          level: 1,
          mock_mode: mockMode,
        },
        { authMode: "anon" },
      );

      if (typeof payload.error === "string") {
        throw new Error(payload.error);
      }

      setSpellcastingMode(
        (payload.spellcasting_mode as "none" | "known" | "prepared") || "none",
      );
      setKnownLimit(Number(payload.known_limit || 0));
      setPreparedLimit(Number(payload.prepared_limit || 0));
      setCantripLimit(Number(payload.cantrip_limit || 0));
      setAvailableSpells((payload.spells || []) as SpellOption[]);
      const sc = payload.skill_choices as { count: number; options: string[] } | null | undefined;
      setSkillChoices(sc && sc.count > 0 ? sc : null);
      setSelectedClassSkills([]);
      setError("");
      const allSpells = (payload.spells || []) as SpellOption[];
      const cantripLimit = Number(payload.cantrip_limit || 0);
      // Auto-select default cantrips (first N cantrips in the list)
      setSelectedCantrips(
        allSpells
          .filter((s) => s.level === 0)
          .slice(0, cantripLimit)
          .map((s) => s.name),
      );
      if ((payload.spellcasting_mode || "none") === "known") {
        setSelectedKnownSpells(
          allSpells
            .filter((s) => s.level > 0)
            .slice(0, Number(payload.known_limit || 0))
            .map((s) => s.name),
        );
        setSelectedPreparedSpells([]);
      } else if ((payload.spellcasting_mode || "none") === "prepared") {
        setSelectedPreparedSpells(
          allSpells
            .filter((s) => s.level > 0)
            .slice(0, Number(payload.prepared_limit || 0))
            .map((s) => s.name),
        );
        setSelectedKnownSpells([]);
      } else {
        setSelectedKnownSpells([]);
        setSelectedPreparedSpells([]);
      }
    } catch (err: unknown) {
      setSpellcastingMode("none");
      setKnownLimit(0);
      setPreparedLimit(0);
      setCantripLimit(0);
      setAvailableSpells([]);
      setSelectedKnownSpells([]);
      setSelectedPreparedSpells([]);
      setSelectedCantrips([]);
      setSkillChoices(null);
      setSelectedClassSkills([]);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load spell options right now. Spell options require the dm-action edge function.",
      );
    }
  };

  const toggleSpell = (spellName: string) => {
    if (spellcastingMode === "known") {
      setSelectedKnownSpells((prev) =>
        prev.includes(spellName)
          ? prev.filter((s) => s !== spellName)
          : prev.length >= knownLimit
            ? prev
            : [...prev, spellName],
      );
      return;
    }
    if (spellcastingMode === "prepared") {
      setSelectedPreparedSpells((prev) =>
        prev.includes(spellName)
          ? prev.filter((s) => s !== spellName)
          : prev.length >= preparedLimit
            ? prev
            : [...prev, spellName],
      );
    }
  };

  const toggleCantrip = (spellName: string) => {
    setSelectedCantrips((prev) =>
      prev.includes(spellName)
        ? prev.filter((s) => s !== spellName)
        : prev.length >= cantripLimit
          ? prev
          : [...prev, spellName],
    );
  };

  const toggleClassSkill = (skill: string) => {
    setSelectedClassSkills((prev) =>
      prev.includes(skill)
        ? prev.filter((s) => s !== skill)
        : skillChoices && prev.length >= skillChoices.count
          ? prev
          : [...prev, skill],
    );
  };

  const handleCreate = async () => {
    if (name.trim().length < 2 || !roomCode || !playerId) return;
    if (
      spellcastingMode !== "none" &&
      selectedSpells.length < spellLimit &&
      !window.confirm(
        `You've only selected ${selectedSpells.length} of ${spellLimit} starting spells. Continue anyway?`,
      )
    ) {
      return;
    }
    setCreating(true);
    setError("");
    const resolvedSpriteId = getCharacterSpriteId(charClass, race) ?? spriteId;

    const createViaEdge = async (): Promise<Record<string, unknown>> => {
      return await invokeEdgeFunction<Record<string, unknown>>(
        "dm-action",
        {
          action: "create_character",
          room_code: roomCode,
          player_id: playerId,
          name: name.trim(),
          race,
          char_class: charClass,
          sprite_id: resolvedSpriteId,
          abilities,
          known_spells:
            spellcastingMode === "known"
              ? [...selectedCantrips, ...selectedKnownSpells]
              : selectedCantrips.length > 0 ? selectedCantrips : undefined,
          prepared_spells:
            spellcastingMode === "prepared"
              ? selectedPreparedSpells
              : undefined,
          mock_mode: mockMode,
          background: selectedBackground,
          alignment,
          class_skill_choices: selectedClassSkills.length > 0 ? selectedClassSkills : undefined,
          racial_ability_choices:
            race === "Half-Elf" && halfElfChoices.length > 0
              ? Object.fromEntries(halfElfChoices.map((ab) => [ab, 1]))
              : undefined,
        },
        { authMode: "anon" },
      );
    };

    try {
      const payload = await createViaEdge();

      if (typeof payload.error === "string") throw new Error(payload.error);
      const created = payload.character as CharacterData | undefined;
      if (created?.id && typeof created.id === "string") {
        setCharacters({
          ...useGameStore.getState().characters,
          [created.id]: created,
        });
        const sessionState = useSessionStore.getState();
        sessionState.setPlayers(
          sessionState.players.map((p) =>
            p.id === playerId
              ? { ...p, character_id: created.id as string }
              : p,
          ),
        );
      }
      // Sync characters from the snapshot without touching the map.
      // The edge function returns a snapshot map that may lack image_url (since
      // the AI battlemap asset is stored separately and not written back to the
      // Supabase session_snapshots table by the ts-runtime). Replacing the map
      // via syncState would wipe the AI dungeon image currently rendered.
      if (payload.state && typeof payload.state === "object") {
        const stateObj = payload.state as Record<string, unknown>;
        if (stateObj.characters && typeof stateObj.characters === "object") {
          useGameStore
            .getState()
            .setCharacters(
              stateObj.characters as Record<string, CharacterData>,
            );
        }
      }
      // Place the PC token on whichever map is currently rendered in the store.
      if (created?.id && typeof created.id === "string") {
        const store = useGameStore.getState();
        if (store.map) {
          const spawnX = Math.max(1, Math.floor((store.map.width ?? 20) / 2));
          const spawnY = Math.max(1, Math.floor((store.map.height ?? 14) / 2));
          store.addEntity({
            id: created.id,
            name: (created.name as string | undefined) ?? "Adventurer",
            x: spawnX,
            y: spawnY,
            type: "pc",
            sprite: resolvedSpriteId ?? "default",
          });
        }
      }
      if (roomCode && token && created) {
        const allCharacters = useGameStore.getState().characters;
        const map = useGameStore.getState().map;
        callBackendApi("/api/campaign/direct-save", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: {
            room_code: roomCode,
            campaign_name: campaignTitle ?? roomCode,
            characters: allCharacters,
            map,
            conversation: [],
            my_character_id: created.id,
          },
        }).catch(() => {
          /* non-critical */
        });
      }
      useSessionStore.getState().setPhase("playing");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Unable to create character right now.";
      const isStaleSession =
        msg.toLowerCase().includes("session not found") ||
        msg.toLowerCase().includes("player not found");
      if (isStaleSession) {
        reset();
        return;
      }
      setError(msg);
      setCreating(false);
    }
  };

  useEffect(() => {
    loadSpellOptions(charClass);
  }, []);

  useEffect(() => {
    const options = getSpriteOptionsFor(race, charClass);
    if (!options.some((opt) => opt.id === spriteId)) setSpriteId(options[0].id);
  }, [race, charClass, spriteId]);

  useEffect(() => {
    if (!roomCode) return;
    getSession(roomCode).catch(() => {});
  }, [roomCode, getSession]);

  const spriteOptions = getSpriteOptionsFor(race, charClass);
  const selectedSpells =
    spellcastingMode === "known" ? selectedKnownSpells : selectedPreparedSpells;
  const spellLimit = spellcastingMode === "known" ? knownLimit : preparedLimit;

  return (
    <div
      className="w-full h-full flex items-start justify-center overflow-y-auto p-6 relative"
      style={{
        background:
          "radial-gradient(ellipse at 40% 30%, #1a2860 0%, #090d1f 55%, #0d0812 100%)",
      }}
    >
      {/* Overlays */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
        }}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.45) 100%)",
        }}
        aria-hidden="true"
      />

      {/* Particles */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
        {PARTICLES.map((p) => (
          <motion.span
            key={p.key}
            className="absolute rounded-full"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              opacity: p.opacity,
              background: "#e4a853",
              boxShadow: "0 0 5px 1px rgba(228,168,83,0.4)",
            }}
            animate={{
              x: [0, p.xDrift, -p.xDrift / 2, 0],
              y: [0, -p.yDrift, -p.yDrift * 0.4, 0],
              scale: [1, 1.1, 0.88, 1],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Card */}
      <motion.div
        className="relative z-10 w-full max-w-[540px] mb-6"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card
          className="bg-[rgba(18,27,56,0.93)] border-[rgba(228,168,83,0.28)] rounded-2xl py-7 px-8"
          style={{
            boxShadow:
              "0 8px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(228,168,83,0.06), inset 0 1px 0 rgba(228,168,83,0.1)",
          }}
        >
          {/* Header */}
          <div className="text-center mb-6">
            <motion.div
              className="text-[1.8rem] leading-none mb-1.5"
              animate={{
                filter: [
                  "drop-shadow(0 0 5px rgba(228,168,83,0.3))",
                  "drop-shadow(0 0 14px rgba(228,168,83,0.7))",
                  "drop-shadow(0 0 5px rgba(228,168,83,0.3))",
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden="true"
            >
              ⚔
            </motion.div>
            <h2 className="font-fantasy text-[1.55rem] font-bold text-[#e4a853] tracking-[0.04em] mb-1 gold-shimmer-text">
              Forge Your Hero
            </h2>
            <p className="text-[0.82rem] text-[#a0a0b0] mb-3.5 flex items-center justify-center gap-1.5 flex-wrap">
              {roomCode ? (
                <>
                  <span className="inline-block bg-[rgba(228,168,83,0.12)] text-[#e4a853] px-2 py-0.5 rounded font-mono text-[0.82rem] border border-[rgba(228,168,83,0.25)] tracking-[0.05em]">
                    {roomCode}
                  </span>
                  · {players.length} in lobby
                </>
              ) : (
                "Create your character to begin the adventure"
              )}
            </p>
            <div
              className="h-px mx-auto w-4/5"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(228,168,83,0.4), transparent)",
              }}
            />
          </div>

          <div className="flex flex-col gap-4">
            {/* Identity */}
            <SectionHeading icon="✦" label="Identity" />

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="cc-name"
                className="text-[0.7rem] uppercase tracking-[0.07em] text-[#a0a0b0]"
              >
                Character Name
              </label>
              <Input
                id="cc-name"
                type="text"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setName(e.target.value)
                }
                placeholder="Enter a name…"
                maxLength={32}
                autoFocus
                className="bg-[rgba(26,26,62,0.85)] text-[#e0e0e0] placeholder:text-[#a0a0b0]/50"
              />
              {name.trim().length === 1 && (
                <p className="text-[0.7rem] text-[#a0a0b0] italic m-0">At least 2 characters required.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="cc-race"
                  className="text-[0.7rem] uppercase tracking-[0.07em] text-[#a0a0b0]"
                >
                  Race
                </label>
                <ThemedSelect
                  id="cc-race"
                  value={race}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    setRace(e.target.value);
                    setHalfElfChoices([]);
                  }}
                >
                  {RACES.map((r) => (
                    <option key={r} value={r} style={{ background: "#16213e" }}>
                      {r}
                    </option>
                  ))}
                </ThemedSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="cc-class"
                  className="text-[0.7rem] uppercase tracking-[0.07em] text-[#a0a0b0]"
                >
                  Class
                </label>
                <ThemedSelect
                  id="cc-class"
                  value={charClass}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const nextClass = e.target.value;
                    setCharClass(nextClass);
                    loadSpellOptions(nextClass);
                  }}
                >
                  {CLASSES.map((c) => (
                    <option key={c} value={c} style={{ background: "#16213e" }}>
                      {c}
                    </option>
                  ))}
                </ThemedSelect>
              </div>
            </div>

            {/* Half-Elf flexible +1/+1 bonus picker */}
            {race === "Half-Elf" && (
              <>
                <p className="text-[0.72rem] text-[#c8a85a] leading-tight">
                  Half-Elf: choose 2 ability scores to each receive +1 (other than CHA)
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {["STR", "DEX", "CON", "INT", "WIS"].map((ab) => {
                    const selected = halfElfChoices.includes(ab);
                    const disabled = !selected && halfElfChoices.length >= 2;
                    return (
                      <button
                        key={ab}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          setHalfElfChoices((prev) =>
                            prev.includes(ab)
                              ? prev.filter((x) => x !== ab)
                              : prev.length >= 2
                                ? prev
                                : [...prev, ab],
                          )
                        }
                        className={cn(
                          "rounded-lg px-2 py-2 text-[0.75rem] font-semibold transition-all border",
                          selected
                            ? "bg-[rgba(228,168,83,0.12)] border-[rgba(228,168,83,0.5)] text-[#e4a853]"
                            : disabled
                              ? "bg-white/2 border-[#1e1e3a] text-[#555570] cursor-not-allowed"
                              : "bg-white/3 border-[#2a2a4a] text-[#a0a0b0] hover:border-[rgba(228,168,83,0.3)] hover:text-[#e0e0e0]",
                        )}
                      >
                        {ab} +1
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Class hint */}
            {CLASS_HINTS[charClass] && (
              <p className="text-[0.72rem] text-[#a0a0b0] italic -mt-2 m-0 leading-snug">
                {CLASS_HINTS[charClass]}
              </p>
            )}

            {/* Appearance */}
            <SectionHeading icon="◈" label="Appearance" />

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="cc-sprite"
                className="text-[0.7rem] uppercase tracking-[0.07em] text-[#a0a0b0]"
              >
                Sprite
              </label>
              <div className="flex items-center gap-3">
                <img
                  src={`/sprites/manifest/${spriteId}.svg`}
                  alt={spriteId}
                  className="w-10 h-10 rounded-lg border border-[#2a2a4a] bg-white/5 object-contain shrink-0 p-0.5"
                />
                <ThemedSelect
                  id="cc-sprite"
                  value={spriteId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setSpriteId(e.target.value)
                  }
                >
                  {spriteOptions.map((opt) => (
                    <option
                      key={opt.id}
                      value={opt.id}
                      style={{ background: "#16213e" }}
                    >
                      {opt.label}
                    </option>
                  ))}
                </ThemedSelect>
              </div>
              <p className="text-[0.72rem] text-[#a0a0b0] italic m-0">
                Filtered by your race &amp; class selection.
              </p>
            </div>

            {/* Starting Spells */}
            <AnimatePresence>
              {(spellcastingMode !== "none" || cantripLimit > 0) && (
                <motion.div
                  key="spells"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-col gap-4 overflow-hidden"
                >
                  <SectionHeading icon="✦" label="Starting Spells" />

                  {/* Cantrips */}
                  {cantripLimit > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[0.7rem] uppercase tracking-[0.07em] text-[#a0a0b0]">
                          Cantrips
                        </span>
                        <span className="text-[0.72rem] text-[#a0a0b0] bg-white/[0.06] px-2 py-0.5 rounded-lg border border-[#2a2a4a]">
                          {selectedCantrips.length} / {cantripLimit}
                        </span>
                      </div>
                      <div className="border border-[#2a2a4a] rounded-lg bg-white/[0.02]">
                        {availableSpells
                          .filter((s) => s.level === 0)
                          .map((spell, idx, arr) => {
                            const selected = selectedCantrips.includes(spell.name);
                            const disabled = !selected && selectedCantrips.length >= cantripLimit;
                            return (
                              <label
                                key={spell.name}
                                className={cn(
                                  "flex items-center gap-2 px-2.5 py-1.5 text-[0.85rem] cursor-pointer transition-colors",
                                  idx < arr.length - 1 && "border-b border-white/[0.04]",
                                  selected && "bg-[rgba(228,168,83,0.07)] text-[#e4a853]",
                                  !selected && !disabled && "text-[#e0e0e0] hover:bg-[rgba(228,168,83,0.05)]",
                                  disabled && "opacity-40 cursor-default text-[#e0e0e0]",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  disabled={disabled}
                                  onChange={() => toggleCantrip(spell.name)}
                                  className="accent-[#e4a853] w-3.5 h-3.5 shrink-0"
                                />
                                <span className="flex-1">{spell.name}</span>
                                <span className="text-[0.72rem] text-[#a0a0b0] bg-white/[0.06] px-1.5 py-0.5 rounded shrink-0">
                                  Cantrip
                                </span>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Leveled Spells */}
                  {spellcastingMode !== "none" && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[0.7rem] uppercase tracking-[0.07em] text-[#a0a0b0]">
                          {spellcastingMode === "known"
                            ? "Known Spells"
                            : "Prepared Spells"}
                        </span>
                        <span className="text-[0.72rem] text-[#a0a0b0] bg-white/[0.06] px-2 py-0.5 rounded-lg border border-[#2a2a4a]">
                          {selectedSpells.length} / {spellLimit}
                        </span>
                      </div>
                      <div className="max-h-[180px] overflow-y-auto border border-[#2a2a4a] rounded-lg bg-white/[0.02]">
                        {availableSpells
                          .filter((s) => s.level > 0)
                          .map((spell, idx, arr) => {
                            const selected = selectedSpells.includes(spell.name);
                            const disabled =
                              !selected && selectedSpells.length >= spellLimit;
                            return (
                              <label
                                key={spell.name}
                                className={cn(
                                  "flex items-center gap-2 px-2.5 py-1.5 text-[0.85rem] cursor-pointer transition-colors",
                                  idx < arr.length - 1 &&
                                    "border-b border-white/[0.04]",
                                  selected &&
                                    "bg-[rgba(228,168,83,0.07)] text-[#e4a853]",
                                  !selected &&
                                    !disabled &&
                                    "text-[#e0e0e0] hover:bg-[rgba(228,168,83,0.05)]",
                                  disabled &&
                                    "opacity-40 cursor-default text-[#e0e0e0]",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  disabled={disabled}
                                  onChange={() => toggleSpell(spell.name)}
                                  className="accent-[#e4a853] w-3.5 h-3.5 shrink-0"
                                />
                                <span className="flex-1">{spell.name}</span>
                                <span className="text-[0.72rem] text-[#a0a0b0] bg-white/[0.06] px-1.5 py-0.5 rounded shrink-0">
                                  L{spell.level}
                                </span>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Ability Scores */}
            <SectionHeading icon="◈" label="Ability Scores" />
            <div className="flex items-center justify-between -mt-2 gap-2">
              <p className="text-[0.72rem] text-[#a0a0b0] italic m-0">
                {scoringMethod === "pointbuy" ? (
                  <span
                    className={
                      pointBuyRemaining < 0
                        ? "text-[#e74c3c]"
                        : pointBuyRemaining === 0
                          ? "text-[#2ecc71]"
                          : undefined
                    }
                  >
                    {pointBuyRemaining} / {POINT_BUY_BUDGET} pts remaining
                  </span>
                ) : scoringMethod === "roll" ? (
                  <span>
                    Roll 4d6, drop lowest — click ⬢ to re-roll any score
                  </span>
                ) : (
                  "Standard Array: 15, 14, 13, 12, 10, 8"
                )}
              </p>
              <div className="flex rounded-md overflow-hidden border border-[#2a2a4a] shrink-0">
                <button
                  type="button"
                  onClick={() => handleScoringMethodChange("standard")}
                  className={cn(
                    "text-[0.62rem] px-2 py-1 transition-colors leading-none",
                    scoringMethod === "standard"
                      ? "bg-[rgba(228,168,83,0.2)] text-[#e4a853]"
                      : "bg-transparent text-[#a0a0b0] hover:text-[#e0e0e0]",
                  )}
                >
                  Array
                </button>
                <button
                  type="button"
                  onClick={() => handleScoringMethodChange("pointbuy")}
                  className={cn(
                    "text-[0.62rem] px-2 py-1 transition-colors leading-none border-l border-[#2a2a4a]",
                    scoringMethod === "pointbuy"
                      ? "bg-[rgba(228,168,83,0.2)] text-[#e4a853]"
                      : "bg-transparent text-[#a0a0b0] hover:text-[#e0e0e0]",
                  )}
                >
                  Point Buy
                </button>
                <button
                  type="button"
                  onClick={() => handleScoringMethodChange("roll")}
                  className={cn(
                    "text-[0.62rem] px-2 py-1 transition-colors leading-none border-l border-[#2a2a4a]",
                    scoringMethod === "roll"
                      ? "bg-[rgba(228,168,83,0.2)] text-[#e4a853]"
                      : "bg-transparent text-[#a0a0b0] hover:text-[#e0e0e0]",
                  )}
                >
                  🎲 Roll
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 max-sm:grid-cols-2">
              {ABILITIES.map((ab) => {
                const raceBonus = RACE_ABILITY_BONUSES[race]?.[ab] ?? 0;
                const finalVal = abilities[ab] + raceBonus;
                const mod = Math.floor((finalVal - 10) / 2);
                const isPrimary = (
                  CLASS_PRIMARY_STATS[charClass] ?? []
                ).includes(ab);
                return (
                  <div
                    key={ab}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl py-2.5 px-1.5 transition-all focus-within:border-[rgba(228,168,83,0.5)] focus-within:bg-[rgba(228,168,83,0.04)]",
                      isPrimary
                        ? "bg-[rgba(228,168,83,0.07)] border border-[rgba(228,168,83,0.35)]"
                        : "bg-white/3 border border-[#2a2a4a]",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[0.65rem] uppercase tracking-[0.08em] font-semibold leading-none",
                        isPrimary ? "text-[#e4a853]" : "text-[#a0a0b0]",
                      )}
                    >
                      {ab}
                      {isPrimary ? " ★" : ""}
                    </span>
                    <input
                      type="number"
                      min={scoringMethod === "pointbuy" ? 8 : 3}
                      max={scoringMethod === "pointbuy" ? 15 : 20}
                      readOnly={scoringMethod === "roll"}
                      value={abilities[ab]}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        if (scoringMethod === "roll") return;
                        const val = parseInt(e.target.value) || 8;
                        if (scoringMethod === "pointbuy") {
                          const clamped = Math.min(15, Math.max(8, val));
                          const newCost = POINT_BUY_COST[clamped] ?? 9;
                          const oldCost =
                            POINT_BUY_COST[
                              Math.min(15, Math.max(8, abilities[ab]))
                            ] ?? 0;
                          if (
                            pointBuySpent - oldCost + newCost <=
                            POINT_BUY_BUDGET
                          ) {
                            handleAbilityChange(ab, clamped);
                          }
                        } else {
                          handleAbilityChange(ab, val);
                        }
                      }}
                      className="w-[52px] bg-[rgba(26,26,62,0.8)] border border-[#2a2a4a] text-[#e0e0e0] text-center py-1 rounded-md text-[1.15rem] font-bold outline-none transition-colors focus:border-[#e4a853] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {scoringMethod === "roll" && (
                      <button
                        type="button"
                        onClick={() => rollSingleAbility(ab)}
                        className="text-[0.75rem] w-6 h-6 flex items-center justify-center rounded bg-[rgba(228,168,83,0.1)] border border-[rgba(228,168,83,0.3)] text-[#e4a853] hover:bg-[rgba(228,168,83,0.2)] transition-colors leading-none"
                        title="Re-roll this ability (4d6 drop lowest)"
                      >
                        🎲
                      </button>
                    )}
                    {raceBonus !== 0 && (
                      <span className="text-[0.6rem] text-[#e4a853] leading-none">
                        {abilities[ab]} +{raceBonus}
                      </span>
                    )}
                    <span
                      className={cn(
                        "text-[0.82rem] font-bold leading-none",
                        mod >= 0 ? "text-[#2ecc71]" : "text-[#e74c3c]",
                      )}
                    >
                      {mod >= 0 ? "+" : ""}
                      {mod}
                    </span>
                  </div>
                );
              })}
            </div>

            {scoringMethod === "roll" && (
              <button
                type="button"
                onClick={() => handleScoringMethodChange("roll")}
                className="w-full text-[0.72rem] py-1.5 rounded-lg border border-[rgba(228,168,83,0.3)] bg-[rgba(228,168,83,0.07)] text-[#e4a853] hover:bg-[rgba(228,168,83,0.15)] transition-colors"
              >
                🎲 Roll All Abilities
              </button>
            )}

            {/* Background */}
            <SectionHeading icon="✦" label="Background" />
            <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
              {BACKGROUNDS_FE.map((bg) => {
                const selected = selectedBackground === bg.name;
                return (
                  <button
                    key={bg.name}
                    type="button"
                    onClick={() =>
                      setSelectedBackground((prev) =>
                        prev === bg.name ? "" : bg.name,
                      )
                    }
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left transition-all border",
                      selected
                        ? "bg-[rgba(228,168,83,0.1)] border-[rgba(228,168,83,0.5)] text-[#e4a853]"
                        : "bg-white/3 border-[#2a2a4a] text-[#e0e0e0] hover:border-[rgba(228,168,83,0.3)]",
                    )}
                  >
                    <span className="text-[0.82rem] font-semibold leading-tight">
                      {bg.name}
                    </span>
                    <span className="text-[0.7rem] text-[#a0a0b0] leading-tight">
                      {bg.skills.join(" · ")}
                    </span>
                    {selected && (
                      <span className="text-[0.65rem] text-[#c8a85a] leading-tight italic mt-0.5">
                        {bg.desc}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Alignment */}
            <SectionHeading icon="⚖" label="Alignment" />
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  "Lawful Good", "Neutral Good", "Chaotic Good",
                  "Lawful Neutral", "True Neutral", "Chaotic Neutral",
                  "Lawful Evil", "Neutral Evil", "Chaotic Evil",
                ] as const
              ).map((al) => (
                <button
                  key={al}
                  type="button"
                  onClick={() => setAlignment((prev) => (prev === al ? "" : al))}
                  className={cn(
                    "rounded-lg px-2 py-2 text-[0.7rem] font-medium leading-tight text-center transition-all border",
                    alignment === al
                      ? "bg-[rgba(228,168,83,0.12)] border-[rgba(228,168,83,0.5)] text-[#e4a853]"
                      : "bg-white/3 border-[#2a2a4a] text-[#a0a0b0] hover:border-[rgba(228,168,83,0.3)] hover:text-[#e0e0e0]",
                  )}
                >
                  {al}
                </button>
              ))}
            </div>

            {/* Class Skill Choices */}
            {skillChoices && skillChoices.count > 0 && (
              <>
                <SectionHeading
                  icon="🎯"
                  label={`Class Skills (choose ${skillChoices.count})`}
                />
                <div className="grid grid-cols-2 gap-1.5">
                  {skillChoices.options.map((skill) => {
                    const selected = selectedClassSkills.includes(skill);
                    const disabled =
                      !selected &&
                      selectedClassSkills.length >= skillChoices.count;
                    return (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => toggleClassSkill(skill)}
                        disabled={disabled}
                        className={cn(
                          "rounded-lg px-3 py-2 text-[0.78rem] font-medium text-left transition-all border",
                          selected
                            ? "bg-[rgba(228,168,83,0.1)] border-[rgba(228,168,83,0.5)] text-[#e4a853]"
                            : disabled
                              ? "bg-white/2 border-[#1e1e3a] text-[#555570] cursor-not-allowed"
                              : "bg-white/3 border-[#2a2a4a] text-[#e0e0e0] hover:border-[rgba(228,168,83,0.3)]",
                        )}
                      >
                        {skill}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[0.68rem] text-[#a0a0b0] text-right">
                  {selectedClassSkills.length} / {skillChoices.count} selected
                </p>
              </>
            )}

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  key="error"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-[#e74c3c] text-[0.85rem] m-0 px-2.5 py-1.5 bg-[rgba(231,76,60,0.1)] border-l-[3px] border-[#e74c3c] rounded-sm"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Stat Preview Strip */}
            <div
              className="grid grid-cols-4 gap-1.5 rounded-xl px-3 py-2.5 border border-[rgba(228,168,83,0.2)]"
              style={{ background: "rgba(228,168,83,0.04)" }}
            >
              {[
                { label: "HP", value: Math.max(1, previewHP) },
                { label: "AC", value: previewAC },
                { label: "Speed", value: `${previewSpeed}ft` },
                { label: "Prof", value: "+2" },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <span className="text-[0.6rem] uppercase tracking-[0.08em] text-[#a0a0b0]">
                    {label}
                  </span>
                  <span className="text-[0.95rem] font-bold text-[#e4a853]">
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Submit */}
            <Button
              onClick={handleCreate}
              disabled={name.trim().length < 2 || creating}
              className="mt-2 min-h-[48px] text-base font-bold bg-linear-to-br from-[#e4a853] to-[#c8882a] text-[#1a1a2e] border-none hover:opacity-90 hover:-translate-y-px active:translate-y-0 disabled:opacity-40 tracking-[0.01em]"
              style={{ boxShadow: "0 4px 16px rgba(228,168,83,0.25)" }}
            >
              {creating ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-[rgba(26,26,46,0.3)] border-t-[#1a1a2e] rounded-full animate-spin mr-2" />
                  Creating…
                </>
              ) : (
                "⚔ Begin the Adventure"
              )}
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
