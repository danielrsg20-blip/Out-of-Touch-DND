import { cn } from "@/lib/utils";
import { getRarityConfig, type RarityTier } from "./RarityBorder";

export function GlowDivider({
  rarity,
  className,
}: {
  readonly rarity?: RarityTier | string | null;
  readonly className?: string;
}) {
  const config = getRarityConfig(rarity);
  return <div className={cn("h-px w-full my-3 opacity-50", config.glow, className)} />;
}
