import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type RarityTier =
  | "common"
  | "uncommon"
  | "rare"
  | "very_rare"
  | "legendary"
  | "artifact";

export const RARITY_CONFIG: Record<
  RarityTier,
  {
    border: string;
    bg: string;
    text: string;
    shadow: string;
    glow: string;
    glowColor: string;
  }
> = {
  common: {
    border: "border-[#2a2a4a]",
    bg: "bg-[rgba(26,26,62,0.6)]",
    text: "text-[#a0a0b0]",
    shadow: "",
    glow: "bg-white/5",
    glowColor: "rgba(255,255,255,0.05)",
  },
  uncommon: {
    border: "border-green-700/50",
    bg: "bg-green-950/20",
    text: "text-green-400",
    shadow: "hover:shadow-[0_0_14px_rgba(22,163,74,0.15)]",
    glow: "bg-green-500/20",
    glowColor: "rgba(34,197,94,0.2)",
  },
  rare: {
    border: "border-blue-500/60",
    bg: "bg-blue-950/25",
    text: "text-blue-400",
    shadow: "hover:shadow-[0_0_18px_rgba(59,130,246,0.25)]",
    glow: "bg-blue-500/25",
    glowColor: "rgba(59,130,246,0.25)",
  },
  very_rare: {
    border: "border-purple-500/70",
    bg: "bg-purple-950/30",
    text: "text-purple-400",
    shadow: "hover:shadow-[0_0_22px_rgba(168,85,247,0.35)]",
    glow: "bg-purple-500/30",
    glowColor: "rgba(168,85,247,0.3)",
  },
  legendary: {
    border: "border-amber-500/80",
    bg: "bg-amber-950/35",
    text: "text-amber-400",
    shadow:
      "shadow-[0_0_10px_rgba(245,158,11,0.15)] hover:shadow-[0_0_28px_rgba(245,158,11,0.45)]",
    glow: "bg-amber-500/40",
    glowColor: "rgba(245,158,11,0.4)",
  },
  artifact: {
    border: "border-red-500/90",
    bg: "bg-red-950/40",
    text: "text-red-400",
    shadow:
      "shadow-[0_0_12px_rgba(239,68,68,0.2)] hover:shadow-[0_0_32px_rgba(239,68,68,0.55)]",
    glow: "bg-red-500/50",
    glowColor: "rgba(239,68,68,0.5)",
  },
};

export function getRarityConfig(rarity?: string | null) {
  const key = (rarity ?? "common") as RarityTier;
  return RARITY_CONFIG[key] ?? RARITY_CONFIG.common;
}

export function RarityBorder({
  rarity,
  children,
  className,
}: {
  readonly rarity?: RarityTier | string | null;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const config = getRarityConfig(rarity);
  return (
    <div
      className={cn(
        "rounded-xl border backdrop-blur-sm transition-all duration-300",
        config.border,
        config.bg,
        config.shadow,
        className,
      )}
    >
      {children}
    </div>
  );
}
