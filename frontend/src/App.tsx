import { useEffect } from "react";
import { useSessionStore } from "./stores/sessionStore";
import { useAuthStore } from "./stores/authStore";
import AuthScreen from "./components/AuthScreen";
import SessionLobby from "./components/SessionLobby";
import CharacterCreator from "./components/CharacterCreator";
import GameBoard from "./components/GameBoard";
import TableModeView from "./components/TableModeView";

function isTableMode() {
  return new URLSearchParams(window.location.search).get("mode") === "table";
}

// ── Fantasy loading screen ───────────────────────────────────────────
function FantasyLoadingScreen() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-7"
      style={{
        background:
          "radial-gradient(ellipse at 40% 45%, #1a2860 0%, #090d1f 55%, #0d0812 100%)",
      }}
    >
      {/* Animated D20 spinner */}
      <svg
        className="d20-spinner"
        width="80"
        height="80"
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="d20LoadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e3a6e" />
            <stop offset="100%" stopColor="#0d1428" />
          </linearGradient>
        </defs>
        <polygon
          points="50,6 90,28 90,72 50,94 10,72 10,28"
          fill="url(#d20LoadGrad)"
          stroke="#e4a853"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <polygon
          points="50,6 90,28 90,72 50,94 10,72 10,28"
          fill="none"
          stroke="#e4a853"
          strokeWidth="0.8"
          strokeLinejoin="round"
          opacity="0.22"
          transform="scale(0.86) translate(7, 7)"
        />
        <line
          x1="50"
          y1="6"
          x2="10"
          y2="72"
          stroke="#e4a853"
          strokeWidth="0.7"
          opacity="0.4"
        />
        <line
          x1="50"
          y1="6"
          x2="90"
          y2="72"
          stroke="#e4a853"
          strokeWidth="0.7"
          opacity="0.4"
        />
        <line
          x1="50"
          y1="94"
          x2="10"
          y2="28"
          stroke="#e4a853"
          strokeWidth="0.7"
          opacity="0.4"
        />
        <line
          x1="50"
          y1="94"
          x2="90"
          y2="28"
          stroke="#e4a853"
          strokeWidth="0.7"
          opacity="0.4"
        />
        <line
          x1="10"
          y1="28"
          x2="90"
          y2="28"
          stroke="#e4a853"
          strokeWidth="0.6"
          opacity="0.28"
        />
        <line
          x1="10"
          y1="72"
          x2="90"
          y2="72"
          stroke="#e4a853"
          strokeWidth="0.6"
          opacity="0.28"
        />
        <text
          x="50"
          y="57"
          textAnchor="middle"
          fill="#e4a853"
          fontSize="26"
          fontWeight="bold"
          fontFamily="Georgia, 'Times New Roman', serif"
        >
          20
        </text>
      </svg>

      <p
        className="loading-text-pulse font-fantasy text-xs uppercase tracking-widest"
        style={{
          color: "var(--accent-gold)",
          fontFamily: "var(--font-fantasy)",
        }}
      >
        Preparing your adventure&hellip;
      </p>
    </div>
  );
}

export default function App() {
  const phase = useSessionStore((s) => s.phase);
  const { isAuthenticated, isLoading, hydrateFromStorage } = useAuthStore();
  const hydrateSession = useSessionStore((s) => s.hydrateSession);

  useEffect(() => {
    hydrateFromStorage();
    hydrateSession();
  }, [hydrateFromStorage, hydrateSession]);

  if (isLoading) {
    return <FantasyLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  switch (phase) {
    case "lobby":
      return <SessionLobby />;
    case "character_create":
      return <CharacterCreator />;
    case "playing":
      return isTableMode() ? <TableModeView /> : <GameBoard />;
    default:
      return <SessionLobby />;
  }
}
