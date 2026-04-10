import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useGameStore } from "../../stores/gameStore";
import { useSessionStore } from "../../stores/sessionStore";
import "./panels.css";

export default function CombatTracker() {
  const combat = useGameStore((s) => s.combat);
  const characters = useGameStore((s) => s.characters);
  const playerId = useSessionStore((s) => s.playerId);
  const players = useSessionStore((s) => s.players);
  const myCharacterId =
    players.find((p) => p.id === playerId)?.character_id ?? null;
  const isMyTurn = !!(
    combat?.is_active && combat.current_turn === myCharacterId
  );
  const [roundKey, setRoundKey] = useState(0);

  useEffect(() => {
    if (!combat?.is_active) return;
    setRoundKey((k) => k + 1);
  }, [combat?.is_active, combat?.round]);

  if (!combat || !combat.is_active) return null;

  const currentTotal = Number(combat.current_movement_total ?? 0);
  const currentRemaining = Number(combat.current_movement_remaining ?? 0);
  const currentUsed = Math.max(0, currentTotal - currentRemaining);

  return (
    <div className="combat-tracker torch-border">
      <h3 className="panel-title combat-title-row">
        <span>Combat</span>
        <motion.span
          key={roundKey}
          className="combat-round-badge"
          initial={{ scale: 1.25, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 340, damping: 20 }}
        >
          Round {combat.round}
        </motion.span>
      </h3>

      <AnimatePresence>
        {isMyTurn && (
          <motion.div
            className="your-turn-banner"
            initial={{ opacity: 0, y: -6 }}
            animate={{
              opacity: [1, 0.7, 1],
              y: 0,
              boxShadow: [
                "0 0 8px rgba(228,168,83,0.4)",
                "0 0 18px rgba(228,168,83,0.75)",
                "0 0 8px rgba(228,168,83,0.4)",
              ],
            }}
            exit={{ opacity: 0, y: -4 }}
            transition={{
              y: { duration: 0.18 },
              opacity: { duration: 1.4, repeat: Infinity, ease: "easeInOut" },
              boxShadow: { duration: 1.4, repeat: Infinity, ease: "easeInOut" },
            }}
          >
            ⚔ Your Turn
          </motion.div>
        )}
      </AnimatePresence>

      <div className="movement-status">
        Movement: {currentUsed}/{currentTotal} ft
      </div>

      <div className="initiative-list">
        {combat.initiative_order.map((entry, idx) => {
          const isCurrent = idx === combat.turn_index;
          const hpPercent =
            entry.max_hp > 0 ? (entry.hp / entry.max_hp) * 100 : 0;
          return (
            <div
              key={entry.id}
              className={`initiative-entry ${isCurrent ? "current-turn combat-active-pulse" : ""}`}
            >
              <span className="init-order">{entry.initiative}</span>
              <span className="init-name">{entry.name}</span>
              <div className="init-hp-bar">
                <motion.div
                  className="init-hp-fill"
                  initial={false}
                  animate={{ width: `${hpPercent}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
              <span className="init-hp-text">
                {entry.hp}/{entry.max_hp}
              </span>
              {/* Active conditions */}
              {(() => {
                const charData = characters[entry.id];
                const conditions: string[] = (charData?.conditions ?? []).map(
                  (c: unknown) =>
                    typeof c === "string" ? c : (c as { name?: string })?.name ?? "",
                ).filter(Boolean);
                if (conditions.length === 0) return null;
                return (
                  <div className="condition-badges" style={{ display: "flex", flexWrap: "wrap", gap: "2px", marginTop: "2px" }}>
                    {conditions.map((cond: string) => (
                      <span
                        key={cond}
                        style={{
                          fontSize: "0.6rem",
                          padding: "1px 4px",
                          borderRadius: "4px",
                          background: "rgba(228,100,60,0.2)",
                          color: "#e4a853",
                          border: "1px solid rgba(228,168,83,0.3)",
                        }}
                        title={cond}
                      >
                        {cond}
                      </span>
                    ))}
                  </div>
                );
              })()}
              {entry.hp === 0 &&
                (() => {
                  const saves = characters[entry.id]?.death_saves ?? {
                    successes: 0,
                    failures: 0,
                  };
                  return (
                    <div className="death-save-row">
                      <span className="death-save-label">☠</span>
                      <span className="death-save-group">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={`s${i}`}
                            className={`death-save-pip death-save-success${i < saves.successes ? " filled" : ""}`}
                            title="Success"
                          />
                        ))}
                      </span>
                      <span className="death-save-group">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={`f${i}`}
                            className={`death-save-pip death-save-failure${i < saves.failures ? " filled" : ""}`}
                            title="Failure"
                          />
                        ))}
                      </span>
                    </div>
                  );
                })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
