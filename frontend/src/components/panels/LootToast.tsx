import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useGameStore } from "../../stores/gameStore";
import { getItemSpriteKey, resolveSpriteUrl } from "../../data/spriteManifest";

function LootItemIcon({ name }: { readonly name: string }) {
  const fakeItem = { name, category: "gear" as const };
  const url = resolveSpriteUrl(getItemSpriteKey(fakeItem as any));
  if (!url) return <span className="loot-item-icon-fallback">•</span>;
  return <img className="loot-item-icon" src={url} alt={name} />;
}

function AnimatedGold({ target }: { readonly target: number }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    if (target <= 0) return;
    const duration = 800;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setDisplayed(Math.round(progress * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <>{displayed}</>;
}

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
    <motion.div
      className="loot-toast gold-glow-card"
      onClick={() => setLootData(null)}
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      style={{ position: "relative", overflow: "hidden" }}
    >
      <span className="loot-shimmer" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }} aria-hidden="true" />
      <div className="loot-toast-header" style={{ position: "relative", zIndex: 1 }}>⚔️ Loot Acquired!</div>
      {lootData.description && (
        <p className="loot-toast-desc" style={{ position: "relative", zIndex: 1 }}>{lootData.description}</p>
      )}
      {lootData.gold != null && lootData.gold > 0 && (
        <div className="loot-toast-gold gold-shimmer-text" style={{ position: "relative", zIndex: 1 }}>
          🪙 <AnimatedGold target={lootData.gold} /> gold pieces
        </div>
      )}
      <div className="loot-toast-items-grid" style={{ position: "relative", zIndex: 1 }}>
        {lootData.items.map((item, i) => (
          <motion.div
            key={i}
            className="loot-item-card"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <LootItemIcon name={item.name} />
            <span className="loot-item-name">
              {item.quantity && item.quantity > 1 ? `${item.quantity}× ` : ""}
              {item.name}
            </span>
            {item.value_gp != null && (
              <span className="loot-item-value">
                <span className="shop-gold-icon">◈</span> {item.value_gp}
              </span>
            )}
          </motion.div>
        ))}
      </div>
      <div className="loot-toast-dismiss" style={{ position: "relative", zIndex: 1 }}>click to dismiss</div>
    </motion.div>
  );
}
