import { invokeEdgeFunction } from "../../lib/supabaseClient";

const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000,
  120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export function LevelUpBanner({
  charLevel,
  charXp,
  roomCode,
  playerId,
  mockMode,
}: {
  readonly charLevel: number;
  readonly charXp: number;
  readonly roomCode: string | null;
  readonly playerId: string | null;
  readonly mockMode: boolean;
}) {
  const nextThreshold = XP_THRESHOLDS[charLevel] ?? Infinity;
  const canLevelUp = charLevel < 20 && charXp >= nextThreshold;
  if (!canLevelUp) return null;

  const handleLevelUp = async () => {
    if (!roomCode || !playerId) return;
    try {
      await invokeEdgeFunction<Record<string, unknown>>(
        "dm-action",
        {
          action: "player_action",
          room_code: roomCode,
          player_id: playerId,
          content: `I have enough XP to reach level ${charLevel + 1}. Please level me up.`,
          mock_mode: mockMode,
        },
        { authMode: "anon" },
      );
    } catch {
      /* non-critical */
    }
  };

  return (
    <button
      className="levelup-banner"
      onClick={handleLevelUp}
      title="Notify DM to level up"
    >
      ⚡ Level Up Available! → Level {charLevel + 1}
    </button>
  );
}
