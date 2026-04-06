import { useEffect } from "react";
import { useGameStore } from "../../stores/gameStore";

export default function LootToast() {
  const lootData = useGameStore((s) => s.lootData);
  const setLootData = useGameStore((s) => s.setLootData);

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (!lootData) return;
    const t = setTimeout(() => setLootData(null), 8000);
    return () => clearTimeout(t);
  }, [lootData, setLootData]);

  if (!lootData) return null;

  return (
    <div className="loot-toast gold-glow-card" onClick={() => setLootData(null)} style={{ position: "relative", overflow: "hidden" }}>
      <span className="loot-shimmer" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }} aria-hidden="true" />
      <div className="loot-toast-header" style={{ position: "relative", zIndex: 1 }}>⚔️ Loot Acquired!</div>
      {lootData.description && (
        <p className="loot-toast-desc" style={{ position: "relative", zIndex: 1 }}>{lootData.description}</p>
      )}
      {lootData.gold != null && lootData.gold > 0 && (
        <div className="loot-toast-gold gold-shimmer-text" style={{ position: "relative", zIndex: 1 }}>🪙 {lootData.gold} gold pieces</div>
      )}
      <ul className="loot-toast-items" style={{ position: "relative", zIndex: 1 }}>
        {lootData.items.map((item, i) => (
          <li key={i}>
            {item.quantity && item.quantity > 1 ? `${item.quantity}× ` : ""}
            {item.name}
            {item.value_gp != null ? ` (${item.value_gp} gp)` : ""}
          </li>
        ))}
      </ul>
      <div className="loot-toast-dismiss" style={{ position: "relative", zIndex: 1 }}>click to dismiss</div>
    </div>
  );
}
