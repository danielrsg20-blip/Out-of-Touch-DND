import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  subValue,
  icon,
  highlight,
  className,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly subValue?: string | number;
  readonly icon?: string;
  readonly highlight?: boolean;
  readonly className?: string;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 border transition-colors",
        highlight
          ? "bg-[rgba(228,168,83,0.08)] border-[rgba(228,168,83,0.3)] shadow-[0_0_8px_rgba(228,168,83,0.1)]"
          : "bg-[rgba(255,255,255,0.04)] border-[#2a2a4a]",
        className,
      )}
    >
      <span className="text-[0.62rem] uppercase tracking-[0.08em] text-[#a0a0b0] leading-none flex items-center gap-1">
        {icon && <span className="text-[0.7rem] leading-none">{icon}</span>}
        {label}
      </span>
      <span
        className={cn(
          "font-bold text-base leading-none",
          highlight ? "text-[#e4a853]" : "text-[#e0e0e0]",
        )}
      >
        {value}
      </span>
      {subValue !== undefined && (
        <span className="text-[0.6rem] text-[#a0a0b0] leading-none">
          {subValue}
        </span>
      )}
    </motion.div>
  );
}
