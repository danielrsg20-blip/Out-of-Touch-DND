import { useState, useMemo } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { CodexNPC, CodexLocation, CodexQuest, CodexFaction } from "../../types";
import "./panels.css";

type CodexTab = "npcs" | "locations" | "quests" | "factions";

const DISPOSITION_COLORS: Record<string, string> = {
  hostile: "var(--codex-hostile)",
  unfriendly: "var(--codex-unfriendly)",
  neutral: "var(--codex-neutral)",
  friendly: "var(--codex-friendly)",
  allied: "var(--codex-allied)",
};

const STATUS_COLORS: Record<string, string> = {
  active: "var(--codex-quest-active)",
  completed: "var(--codex-quest-done)",
  failed: "var(--codex-hostile)",
  abandoned: "var(--codex-neutral)",
};

function dispositionLabel(d: string): string {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function NPCCard({
  npc,
  expanded,
  onToggle,
}: {
  readonly npc: CodexNPC;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const dotColor =
    DISPOSITION_COLORS[npc.disposition] ?? DISPOSITION_COLORS.neutral;
  return (
    <div
      className={`codex-card${expanded ? " codex-card--open" : ""}${!npc.alive ? " codex-card--dead" : ""}`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onToggle();
      }}
      aria-expanded={expanded}
    >
      <div className="codex-card-header">
        {npc.portrait_url ? (
          <img
            src={npc.portrait_url}
            alt={npc.name}
            className="codex-portrait-thumb"
          />
        ) : (
          <span
            className="codex-dot"
            style={{ background: dotColor }}
            title={dispositionLabel(npc.disposition)}
          />
        )}
        <span className="codex-card-name">{npc.name}</span>
        {!npc.alive && (
          <span className="codex-badge codex-badge--dead">Dead</span>
        )}
        <span className="codex-card-meta">
          {[npc.race, npc.role].filter(Boolean).join(" · ")}
        </span>
        <span className="codex-chevron">{expanded ? "▾" : "▸"}</span>
      </div>
      {expanded && (
        <div className="codex-card-body">
          {npc.portrait_url && (
            <img
              src={npc.portrait_url}
              alt={npc.name}
              className="codex-portrait-full"
            />
          )}
          {npc.location && (
            <div className="codex-field">
              <span className="codex-field-label">Location</span>
              <span>{npc.location}</span>
            </div>
          )}
          <div className="codex-field">
            <span className="codex-field-label">Disposition</span>
            <span style={{ color: dotColor }}>
              {dispositionLabel(npc.disposition)}
            </span>
          </div>
          {npc.relationships && Object.keys(npc.relationships).length > 0 && (
            <div className="codex-field codex-field--block">
              <span className="codex-field-label">Relationships</span>
              <ul className="codex-relationships">
                {Object.entries(npc.relationships).map(([target, desc]) => (
                  <li key={target}>
                    <strong>{target}:</strong> {desc}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {npc.notes.length > 0 && (
            <div className="codex-notes">
              {npc.notes.map((note, i) => (
                <p key={i} className="codex-note">
                  • {note}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LocationCard({
  loc,
  expanded,
  onToggle,
}: {
  readonly loc: CodexLocation;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <div
      className={`codex-card${expanded ? " codex-card--open" : ""}`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onToggle();
      }}
      aria-expanded={expanded}
    >
      <div className="codex-card-header">
        <span
          className="codex-dot"
          style={{
            background: loc.visited
              ? "var(--codex-visited)"
              : "var(--codex-unvisited)",
          }}
          title={loc.visited ? "Visited" : "Known but not visited"}
        />
        <span className="codex-card-name">{loc.name}</span>
        {loc.region && <span className="codex-card-meta">{loc.region}</span>}
        <span className="codex-chevron">{expanded ? "▾" : "▸"}</span>
      </div>
      {expanded && (
        <div className="codex-card-body">
          {loc.description && (
            <p className="codex-description">{loc.description}</p>
          )}
          {loc.notes.length > 0 && (
            <div className="codex-notes">
              {loc.notes.map((note, i) => (
                <p key={i} className="codex-note">
                  • {note}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuestCard({
  quest,
  expanded,
  onToggle,
}: {
  readonly quest: CodexQuest;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const statusColor = STATUS_COLORS[quest.status] ?? STATUS_COLORS.active;
  const doneCount = quest.completed_objectives.length;
  const totalCount = quest.objectives.length;
  return (
    <div
      className={`codex-card${expanded ? " codex-card--open" : ""}`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onToggle();
      }}
      aria-expanded={expanded}
    >
      <div className="codex-card-header">
        <span
          className="codex-dot"
          style={{ background: statusColor }}
          title={quest.status}
        />
        <span className="codex-card-name">{quest.title}</span>
        {totalCount > 0 && (
          <span className="codex-card-meta">
            {doneCount}/{totalCount}
          </span>
        )}
        <span className="codex-chevron">{expanded ? "▾" : "▸"}</span>
      </div>
      {expanded && (
        <div className="codex-card-body">
          <p className="codex-description">{quest.description}</p>
          {quest.objectives.length > 0 && (
            <div className="codex-objectives">
              {quest.objectives.map((obj, i) => {
                const done = quest.completed_objectives.includes(obj);
                return (
                  <p
                    key={i}
                    className={`codex-objective${done ? " codex-objective--done" : ""}`}
                  >
                    {done ? "✓" : "○"} {obj}
                  </p>
                );
              })}
            </div>
          )}
          {quest.reward && (
            <div className="codex-field">
              <span className="codex-field-label">Reward</span>
              <span>{quest.reward}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FactionCard({
  faction,
  expanded,
  onToggle,
}: Readonly<{
  faction: CodexFaction;
  expanded: boolean;
  onToggle: () => void;
}>) {
  const dispColor = DISPOSITION_COLORS[faction.disposition] ?? DISPOSITION_COLORS.neutral;
  const repPercent = Math.max(0, Math.min(100, (faction.reputation + 100) / 2));

  return (
    <div className={`codex-card${expanded ? " codex-card--expanded" : ""}`}>
      <button type="button" className="codex-card-header" onClick={onToggle}>
        <span
          className="codex-dot"
          style={{ background: dispColor }}
          title={faction.disposition}
        />
        <span className="codex-card-name">{faction.name}</span>
        <span className="codex-card-meta" style={{ color: dispColor }}>
          {faction.disposition} ({faction.reputation > 0 ? "+" : ""}{faction.reputation})
        </span>
      </button>
      {expanded && (
        <div className="codex-card-body">
          {faction.description && (
            <p className="codex-desc">{faction.description}</p>
          )}
          <div className="codex-field">
            <span className="codex-field-label">Reputation</span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
              <div style={{
                flex: 1, height: "6px", borderRadius: "3px",
                background: "rgba(255,255,255,0.1)", overflow: "hidden",
              }}>
                <div style={{
                  width: `${repPercent}%`, height: "100%",
                  borderRadius: "3px", background: dispColor,
                  transition: "width 0.3s ease",
                }} />
              </div>
              <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>
                {faction.reputation}
              </span>
            </div>
          </div>
          {faction.known_members.length > 0 && (
            <div className="codex-field">
              <span className="codex-field-label">Known Members</span>
              <span>{faction.known_members.join(", ")}</span>
            </div>
          )}
          {faction.notes.length > 0 && (
            <div className="codex-notes">
              {faction.notes.map((n, i) => (
                <p key={i} className="codex-note">• {n}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CodexPanel() {
  const codex = useGameStore((s) => s.codex);
  const [tab, setTab] = useState<CodexTab>("npcs");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const npcs = useMemo(() => Object.values(codex?.npcs ?? {}), [codex]);
  const locations = useMemo(
    () => Object.values(codex?.locations ?? {}),
    [codex],
  );
  const quests = useMemo(() => Object.values(codex?.quests ?? {}), [codex]);
  const factions = useMemo(() => Object.values(codex?.factions ?? {}), [codex]);

  const q = search.trim().toLowerCase();

  const filteredNpcs = useMemo(
    () =>
      q
        ? npcs.filter(
            (n) =>
              n.name.toLowerCase().includes(q) ||
              n.role.toLowerCase().includes(q) ||
              n.location.toLowerCase().includes(q),
          )
        : npcs,
    [npcs, q],
  );

  const filteredLocations = useMemo(
    () =>
      q
        ? locations.filter(
            (l) =>
              l.name.toLowerCase().includes(q) ||
              l.region.toLowerCase().includes(q) ||
              l.description.toLowerCase().includes(q),
          )
        : locations,
    [locations, q],
  );

  const filteredQuests = useMemo(
    () =>
      q
        ? quests.filter(
            (qst) =>
              qst.title.toLowerCase().includes(q) ||
              qst.description.toLowerCase().includes(q),
          )
        : quests,
    [quests, q],
  );

  const filteredFactions = useMemo(
    () =>
      q
        ? factions.filter(
            (f) =>
              f.name.toLowerCase().includes(q) ||
              f.description.toLowerCase().includes(q) ||
              f.disposition.toLowerCase().includes(q),
          )
        : factions,
    [factions, q],
  );

  const counts: Record<CodexTab, number> = {
    npcs: npcs.length,
    locations: locations.length,
    quests: quests.length,
    factions: factions.length,
  };

  const activeQuests = quests.filter((qst) => qst.status === "active").length;

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const isEmpty =
    npcs.length === 0 && locations.length === 0 && quests.length === 0 && factions.length === 0;

  return (
    <div className="codex-panel">
      <div className="codex-header">
        <h3 className="panel-title" style={{ marginBottom: 0 }}>
          Lore Codex
        </h3>
        {activeQuests > 0 && (
          <span
            className="codex-active-quests"
            title={`${activeQuests} active quest${activeQuests !== 1 ? "s" : ""}`}
          >
            {activeQuests} active
          </span>
        )}
      </div>

      {isEmpty ? (
        <p className="codex-empty">
          No lore recorded yet. The DM will populate this as the adventure
          unfolds.
        </p>
      ) : (
        <>
          <div className="codex-tabs">
            {(["npcs", "locations", "quests", "factions"] as CodexTab[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`codex-tab${tab === t ? " codex-tab--active" : ""}`}
                onClick={() => {
                  setTab(t);
                  setExpandedId(null);
                }}
              >
                {{ npcs: "NPCs", locations: "Places", quests: "Quests", factions: "Factions" }[t]}
                {counts[t] > 0 && (
                  <span className="codex-tab-count">{counts[t]}</span>
                )}
              </button>
            ))}
          </div>

          <div className="codex-search-wrap">
            <input
              type="search"
              className="codex-search"
              placeholder="Search…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setExpandedId(null);
              }}
              aria-label="Search codex"
            />
          </div>

          <div className="codex-list">
            {tab === "npcs" &&
              (filteredNpcs.length === 0 ? (
                <p className="codex-empty">No matches.</p>
              ) : (
                filteredNpcs.map((npc) => (
                  <NPCCard
                    key={npc.id}
                    npc={npc}
                    expanded={expandedId === npc.id}
                    onToggle={() => toggle(npc.id)}
                  />
                ))
              ))}
            {tab === "locations" &&
              (filteredLocations.length === 0 ? (
                <p className="codex-empty">No matches.</p>
              ) : (
                filteredLocations.map((loc) => (
                  <LocationCard
                    key={loc.id}
                    loc={loc}
                    expanded={expandedId === loc.id}
                    onToggle={() => toggle(loc.id)}
                  />
                ))
              ))}
            {tab === "quests" &&
              (filteredQuests.length === 0 ? (
                <p className="codex-empty">No matches.</p>
              ) : (
                filteredQuests.map((qst) => (
                  <QuestCard
                    key={qst.id}
                    quest={qst}
                    expanded={expandedId === qst.id}
                    onToggle={() => toggle(qst.id)}
                  />
                ))
              ))}
            {tab === "factions" &&
              (filteredFactions.length === 0 ? (
                <p className="codex-empty">No matches.</p>
              ) : (
                filteredFactions.map((f) => (
                  <FactionCard
                    key={f.id}
                    faction={f}
                    expanded={expandedId === f.id}
                    onToggle={() => toggle(f.id)}
                  />
                ))
              ))}
          </div>
        </>
      )}
    </div>
  );
}
