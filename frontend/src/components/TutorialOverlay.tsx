import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

const STORAGE_KEY = "otdnd_tutorial_completed";

const STEPS = [
  {
    icon: "⚔",
    title: "Create Your Character",
    body: "Choose a race, class, and roll your stats. Your character sheet tracks everything — HP, abilities, inventory, and spells.",
  },
  {
    icon: "🗺",
    title: "Explore the Map",
    body: "Click or tap the map to move your token. Fog of war reveals as you explore. Obstacles and terrain affect movement.",
  },
  {
    icon: "💬",
    title: "Talk to the DM",
    body: "Type in the chat to tell the DM what you want to do. The DM narrates the world and asks for ability checks when needed.",
  },
  {
    icon: "🎲",
    title: "Rolling Dice",
    body: "The DM calls for rolls automatically — attack rolls, saving throws, skill checks. Results appear in the narrative log.",
  },
  {
    icon: "⚡",
    title: "Combat Basics",
    body: "When combat starts, initiative is rolled. On your turn, use the action bar to attack, cast spells, or use items. Short and long rests recover resources.",
  },
] as const;

interface TutorialOverlayProps {
  onClose: () => void;
}

export default function TutorialOverlay({ onClose }: TutorialOverlayProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "1");
    onClose();
  }, [onClose]);

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else finish();
  };

  const prev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.25 }}
        className="relative w-full max-w-md mx-4 rounded-2xl border border-[rgba(228,168,83,0.3)] p-6"
        style={{
          background:
            "linear-gradient(160deg, rgba(20,28,58,0.97), rgba(12,16,36,0.98))",
          boxShadow:
            "0 0 60px rgba(228,168,83,0.12), 0 20px 40px rgba(0,0,0,0.5)",
        }}
      >
        {/* Skip */}
        <button
          onClick={finish}
          className="absolute top-3 right-3 text-[#a0a0b0] hover:text-[#e4a853] text-sm transition-colors"
        >
          Skip
        </button>

        {/* Step indicator */}
        <div className="flex gap-1.5 mb-5 justify-center">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1 rounded-full transition-all duration-300"
              style={{
                width: i === step ? 24 : 8,
                background:
                  i === step
                    ? "#e4a853"
                    : i < step
                      ? "rgba(228,168,83,0.5)"
                      : "rgba(160,160,176,0.25)",
              }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
            className="text-center"
          >
            <div className="text-4xl mb-3">{current.icon}</div>
            <h2
              className="text-lg font-bold mb-2"
              style={{ color: "#e4a853" }}
            >
              {current.title}
            </h2>
            <p className="text-[0.88rem] text-[#c8c8d8] leading-relaxed">
              {current.body}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex justify-between items-center mt-6">
          <button
            onClick={prev}
            disabled={step === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-0"
            style={{ color: "#a0a0b0" }}
          >
            ← Back
          </button>
          <span className="text-[0.75rem] text-[#6a6a7a]">
            {step + 1} / {STEPS.length}
          </span>
          <button
            onClick={next}
            className="px-4 py-2 rounded-lg text-sm font-bold transition-colors"
            style={{
              background: "rgba(228,168,83,0.2)",
              color: "#e4a853",
              border: "1px solid rgba(228,168,83,0.4)",
            }}
          >
            {step < STEPS.length - 1 ? "Next →" : "Begin Adventure ⚔"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function shouldShowTutorial(): boolean {
  return !localStorage.getItem(STORAGE_KEY);
}
