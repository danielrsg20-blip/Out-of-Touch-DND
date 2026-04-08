import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { getRarityConfig, type RarityTier } from "../ui/RarityBorder";
import { GlowDivider } from "../ui/GlowDivider";
import { getItemSpriteKey, resolveSpriteUrl } from "../../data/spriteManifest";
import type { ItemData } from "../../types";

function ItemCardIcon({ item }: { readonly item: ItemData }) {
  const url = resolveSpriteUrl(getItemSpriteKey(item));
  if (!url) return null;
  return (
    <img
      className="w-10 h-10 shrink-0 drop-shadow-lg object-contain"
      src={url}
      alt={item.name}
      style={{ imageRendering: "auto" }}
    />
  );
}

export function ItemCard({
  item,
  compact,
}: {
  readonly item: ItemData;
  readonly compact?: boolean;
}) {
  const safeRarity: RarityTier = (item.rarity as RarityTier) || "common";
  const config = getRarityConfig(safeRarity);
  const isMagical = item.magical ?? false;
  const isLegendaryOrArtifact =
    safeRarity === "legendary" || safeRarity === "artifact";

  return (
    <motion.div
      whileHover={compact ? undefined : { y: -4, scale: 1.015 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "relative overflow-hidden rounded-xl border backdrop-blur-sm transition-all duration-300",
        config.border,
        config.bg,
        config.shadow,
      )}
    >
      {/* Animated sheen for legendary / artifact */}
      {isLegendaryOrArtifact && (
        <motion.div
          animate={{ x: ["-150%", "250%"] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "linear",
            repeatDelay: 3,
          }}
          className={cn(
            "absolute inset-0 z-0 w-1/2 -skew-x-12 opacity-30",
            safeRarity === "legendary"
              ? "bg-gradient-to-r from-transparent via-amber-300 to-transparent"
              : "bg-gradient-to-r from-transparent via-red-400 to-transparent",
          )}
        />
      )}

      <div className={cn("relative z-10", compact ? "p-3" : "p-4")}>
        {/* Header */}
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 shrink-0 flex items-center justify-center">
              <ItemCardIcon item={item} />
            </div>
            <div>
              <h3
                className={cn(
                  "font-fantasy font-bold tracking-wide",
                  compact ? "text-sm" : "text-lg",
                  config.text,
                )}
              >
                {item.name}
                {item.quantity > 1 && (
                  <span className="text-[#a0a0b0] font-sans text-sm ml-1">
                    x{item.quantity}
                  </span>
                )}
              </h3>
              <p className="text-[0.68rem] text-[#a0a0b0] uppercase tracking-[0.08em] mt-0.5">
                {isMagical && safeRarity !== "common"
                  ? safeRarity.replace("_", " ")
                  : ""}
                {isMagical && safeRarity !== "common" ? " • " : ""}
                {item.subcategory} {item.category}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {item.equipped && (
              <span className="text-[0.6rem] uppercase tracking-wider px-1.5 py-0.5 rounded border border-[#e4a853]/40 bg-[#e4a853]/10 text-[#e4a853]">
                Equipped
              </span>
            )}
            {item.requires_attunement && (
              <span
                className={cn(
                  "text-[0.6rem] uppercase tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap",
                  item.attuned
                    ? "border-purple-500/40 bg-purple-500/10 text-purple-300"
                    : "border-[#a0a0b0]/30 bg-[#a0a0b0]/10 text-[#a0a0b0]",
                )}
              >
                {item.attuned ? "Attuned" : "Attunement"}
              </span>
            )}
          </div>
        </div>

        <GlowDivider rarity={safeRarity} />

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
          {item.damage && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[0.62rem] text-[#a0a0b0] uppercase tracking-wider">
                Damage
              </span>
              <span className="font-mono text-[#e0e0e0] text-[0.8rem]">
                {item.damage}{" "}
                <span className="text-xs text-[#a0a0b0]">
                  ({item.damage_type})
                </span>
              </span>
            </div>
          )}
          {item.ac_base != null && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[0.62rem] text-[#a0a0b0] uppercase tracking-wider">
                Armor Class
              </span>
              <span className="font-mono text-[#e0e0e0] text-[0.8rem]">
                {item.ac_base} {item.dex_mod && "+ Dex"}{" "}
                {item.max_dex ? `(Max ${item.max_dex})` : ""}
              </span>
            </div>
          )}
        </div>

        {/* Property tags */}
        {item.properties && item.properties.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {item.properties.map((prop) => (
              <span
                key={prop}
                className="text-[0.62rem] uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[#c0c0d0]"
              >
                {prop}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        {item.description && !compact && (
          <p className="text-[0.75rem] text-[#a0a0b0] leading-relaxed italic border-t border-white/5 pt-2 mt-2">
            {item.description}
          </p>
        )}

        {/* Footer: weight + cost */}
        {!compact && (item.weight_lb > 0 || item.cost_gp > 0) && (
          <div className="flex items-center gap-3 mt-2 text-[0.68rem] text-[#a0a0b0]">
            {item.weight_lb > 0 && <span>{item.weight_lb} lb</span>}
            {item.cost_gp > 0 && (
              <span>
                <span className="text-[#e4a853]">◈</span> {item.cost_gp} gp
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
