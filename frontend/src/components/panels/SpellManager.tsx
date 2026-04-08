import { useEffect, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import { invokeEdgeFunction } from "../../lib/supabaseClient";
import type { SpellOption } from "../../types";

const CANTRIP_NAMES = new Set([
  "acid splash", "blade ward", "booming blade", "chill touch", "create bonfire",
  "dancing lights", "encode thoughts", "friends", "frostbite", "green-flame blade",
  "guidance", "gust", "infestation", "light", "lightning lure", "mage hand",
  "magic stone", "mending", "message", "mind sliver", "minor illusion",
  "mold earth", "poison spray", "prestidigitation", "primal savagery",
  "produce flame", "ray of frost", "resistance", "sacred flame", "shapewater",
  "shillelagh", "shocking grasp", "spare the dying", "sword burst", "thaumaturgy",
  "thorn whip", "thunderclap", "toll the dead", "true strike", "vicious mockery",
  "virtue", "word of radiance",
]);

interface SlotRow {
  level: string;
  total: number;
  remaining: number;
  state: string;
}

export function SpellManager({
  charId,
  charClass,
  charLevel,
  spellcastingMode,
  preparedSpells,
  knownSpells,
  slotRows,
  isInCombat,
  canManage,
  roomCode,
  playerId,
  mockMode,
}: {
  readonly charId: string;
  readonly charClass: string;
  readonly charLevel: number;
  readonly spellcastingMode: string | null;
  readonly preparedSpells: string[];
  readonly knownSpells: string[];
  readonly slotRows: SlotRow[];
  readonly isInCombat: boolean;
  readonly canManage: boolean;
  readonly roomCode: string | null;
  readonly playerId: string | null;
  readonly mockMode: boolean;
}) {
  const [isManagingPrepared, setIsManagingPrepared] = useState(false);
  const [loadingPreparedOptions, setLoadingPreparedOptions] = useState(false);
  const [savingPreparedOptions, setSavingPreparedOptions] = useState(false);
  const [preparedError, setPreparedError] = useState<string | null>(null);
  const [preparedLimit, setPreparedLimit] = useState(0);
  const [availablePreparedSpells, setAvailablePreparedSpells] = useState<SpellOption[]>([]);
  const [selectedPreparedSpells, setSelectedPreparedSpells] = useState<string[]>([]);

  useEffect(() => {
    if (isInCombat && isManagingPrepared) {
      setPreparedError("You cannot change prepared spells during combat.");
      setIsManagingPrepared(false);
    }
  }, [isInCombat, isManagingPrepared]);

  useEffect(() => {
    if (!isManagingPrepared) return;
    setPreparedError(null);
    setLoadingPreparedOptions(true);

    const run = async () => {
      try {
        const payload = await invokeEdgeFunction<Record<string, unknown>>(
          "dm-action",
          {
            action: "get_spell_options",
            char_class: charClass,
            level: charLevel,
            mock_mode: mockMode,
          },
        );
        if (typeof payload.error === "string") {
          setPreparedError(String(payload.error));
          return;
        }

        const spells = ((payload.spells || []) as SpellOption[]).filter(
          (s) => Number(s.level) > 0,
        );
        setAvailablePreparedSpells(spells);
        setPreparedLimit(Number(payload.prepared_limit || 0));
        setSelectedPreparedSpells(
          Array.isArray(preparedSpells) ? [...preparedSpells] : [],
        );
      } catch (err: unknown) {
        setPreparedError(
          err instanceof Error
            ? err.message
            : "Unable to load spell options right now.",
        );
      } finally {
        setLoadingPreparedOptions(false);
      }
    };

    run();
  }, [isManagingPrepared, charClass, charLevel, preparedSpells, mockMode]);

  const togglePreparedSpell = (spellName: string) => {
    setSelectedPreparedSpells((prev) => {
      if (prev.includes(spellName)) return prev.filter((s) => s !== spellName);
      if (prev.length >= preparedLimit) return prev;
      return [...prev, spellName];
    });
  };

  const savePreparedSpells = async () => {
    if (!roomCode || !playerId) return;
    if (isInCombat) {
      setPreparedError("You cannot change prepared spells during combat.");
      return;
    }
    setPreparedError(null);
    setSavingPreparedOptions(true);
    try {
      const payload = await invokeEdgeFunction<Record<string, unknown>>(
        "dm-action",
        {
          action: "level_up_prepared_spells",
          room_code: roomCode,
          player_id: playerId,
          new_level: charLevel,
          prepared_spells: selectedPreparedSpells,
          mock_mode: mockMode,
        },
      );
      if (typeof payload.error === "string") {
        setPreparedError(String(payload.error));
        return;
      }

      const state = useGameStore.getState();
      const updated = {
        ...state.characters,
        [charId]: {
          ...state.characters[charId],
          prepared_spells: selectedPreparedSpells,
        },
      };
      state.setCharacters(updated);
      setIsManagingPrepared(false);
    } catch (err: unknown) {
      setPreparedError(
        err instanceof Error
          ? err.message
          : "Unable to save prepared spells right now.",
      );
    } finally {
      setSavingPreparedOptions(false);
    }
  };

  return (
    <>
      {/* Spell slots */}
      {slotRows.length > 0 && (
        <div className="char-spell-slots">
          <h4>Spell Slots</h4>
          {slotRows.map((s) => (
            <div key={s.level} className={`slot-row slot-row-${s.state}`}>
              <span className="slot-row-level">Lvl {s.level}</span>
              <span className="slot-row-pips">
                {Array.from({ length: Number(s.total) }).map((_, i) => (
                  <span
                    key={i}
                    className={`spell-pip${i < s.remaining ? " filled" : " used"}`}
                  >
                    {i < s.remaining ? "◆" : "◇"}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Prepared spells */}
      {preparedSpells?.length > 0 && (
        <div className="char-spells">
          <h4>Prepared Spells</h4>
          {preparedSpells.map((spell) => (
            <span key={spell} className="spell-tag">
              {spell}
            </span>
          ))}
        </div>
      )}

      {/* Manage prepared spells */}
      {canManage && (
        <div className="prepared-manager">
          {!isManagingPrepared ? (
            <>
              <button
                className="prepared-manager-btn"
                onClick={() => setIsManagingPrepared(true)}
                disabled={isInCombat}
              >
                Manage Prepared Spells
              </button>
              {isInCombat && (
                <div className="prepared-manager-note">
                  Prepared spells cannot be changed during combat.
                </div>
              )}
            </>
          ) : (
            <div className="prepared-manager-editor">
              <div className="prepared-manager-header">
                <h4>Manage Prepared Spells</h4>
                <span>
                  {selectedPreparedSpells.length}/{preparedLimit}
                </span>
              </div>
              {loadingPreparedOptions ? (
                <p className="panel-empty">Loading spell options...</p>
              ) : (
                <div className="prepared-manager-list">
                  {availablePreparedSpells.map((spell) => {
                    const selected = selectedPreparedSpells.includes(spell.name);
                    const disabled = !selected && selectedPreparedSpells.length >= preparedLimit;
                    return (
                      <label
                        key={spell.name}
                        className={`prepared-manager-item ${disabled ? "disabled" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={disabled}
                          onChange={() => togglePreparedSpell(spell.name)}
                        />
                        <span>{spell.name}</span>
                        <span className="prepared-manager-level">
                          L{spell.level}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {preparedError && (
                <div className="prepared-manager-error">{preparedError}</div>
              )}
              <div className="prepared-manager-actions">
                <button
                  className="prepared-manager-btn"
                  onClick={savePreparedSpells}
                  disabled={savingPreparedOptions || loadingPreparedOptions || isInCombat}
                >
                  {savingPreparedOptions ? "Saving..." : "Save"}
                </button>
                <button
                  className="prepared-manager-btn secondary"
                  onClick={() => {
                    setPreparedError(null);
                    setIsManagingPrepared(false);
                  }}
                  disabled={savingPreparedOptions}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Known spells */}
      {knownSpells?.length > 0 &&
        (() => {
          const cantrips = knownSpells.filter((s) => CANTRIP_NAMES.has(s.toLowerCase()));
          const leveled = knownSpells.filter((s) => !CANTRIP_NAMES.has(s.toLowerCase()));
          return (
            <div className="char-spells">
              {cantrips.length > 0 && (
                <>
                  <h4>Cantrips</h4>
                  {cantrips.map((spell) => (
                    <span key={spell} className="spell-tag cantrip">
                      {spell}
                    </span>
                  ))}
                </>
              )}
              {leveled.length > 0 && (
                <>
                  <h4>Known Spells</h4>
                  {leveled.map((spell) => (
                    <span key={spell} className="spell-tag">
                      {spell}
                    </span>
                  ))}
                </>
              )}
            </div>
          );
        })()}
    </>
  );
}
