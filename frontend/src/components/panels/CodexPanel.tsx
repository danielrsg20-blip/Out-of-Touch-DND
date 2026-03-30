import { useState, useMemo } from 'react'
import { useGameStore } from '../../stores/gameStore'
import type { CodexNPC, CodexLocation, CodexQuest } from '../../types'
import './panels.css'

type CodexTab = 'npcs' | 'locations' | 'quests'

const DISPOSITION_COLORS: Record<string, string> = {
  hostile:    'var(--codex-hostile)',
  unfriendly: 'var(--codex-unfriendly)',
  neutral:    'var(--codex-neutral)',
  friendly:   'var(--codex-friendly)',
  allied:     'var(--codex-allied)',
}

const STATUS_COLORS: Record<string, string> = {
  active:    'var(--codex-quest-active)',
  completed: 'var(--codex-quest-done)',
  failed:    'var(--codex-hostile)',
  abandoned: 'var(--codex-neutral)',
}

function dispositionLabel(d: string): string {
  return d.charAt(0).toUpperCase() + d.slice(1)
}

function NPCCard({ npc, expanded, onToggle }: { readonly npc: CodexNPC; readonly expanded: boolean; readonly onToggle: () => void }) {
  const dotColor = DISPOSITION_COLORS[npc.disposition] ?? DISPOSITION_COLORS.neutral
  return (
    <div className={`codex-card${expanded ? ' codex-card--open' : ''}${!npc.alive ? ' codex-card--dead' : ''}`} onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onToggle() }} aria-expanded={expanded}>
      <div className="codex-card-header">
        <span className="codex-dot" style={{ background: dotColor }} title={dispositionLabel(npc.disposition)} />
        <span className="codex-card-name">{npc.name}</span>
        {!npc.alive && <span className="codex-badge codex-badge--dead">Dead</span>}
        <span className="codex-card-meta">{[npc.race, npc.role].filter(Boolean).join(' · ')}</span>
        <span className="codex-chevron">{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && (
        <div className="codex-card-body">
          {npc.location && (
            <div className="codex-field">
              <span className="codex-field-label">Location</span>
              <span>{npc.location}</span>
            </div>
          )}
          <div className="codex-field">
            <span className="codex-field-label">Disposition</span>
            <span style={{ color: dotColor }}>{dispositionLabel(npc.disposition)}</span>
          </div>
          {npc.notes.length > 0 && (
            <div className="codex-notes">
              {npc.notes.map((note, i) => <p key={i} className="codex-note">• {note}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LocationCard({ loc, expanded, onToggle }: { readonly loc: CodexLocation; readonly expanded: boolean; readonly onToggle: () => void }) {
  return (
    <div className={`codex-card${expanded ? ' codex-card--open' : ''}`} onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onToggle() }} aria-expanded={expanded}>
      <div className="codex-card-header">
        <span className="codex-dot" style={{ background: loc.visited ? 'var(--codex-visited)' : 'var(--codex-unvisited)' }} title={loc.visited ? 'Visited' : 'Known but not visited'} />
        <span className="codex-card-name">{loc.name}</span>
        {loc.region && <span className="codex-card-meta">{loc.region}</span>}
        <span className="codex-chevron">{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && (
        <div className="codex-card-body">
          {loc.description && <p className="codex-description">{loc.description}</p>}
          {loc.notes.length > 0 && (
            <div className="codex-notes">
              {loc.notes.map((note, i) => <p key={i} className="codex-note">• {note}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function QuestCard({ quest, expanded, onToggle }: { readonly quest: CodexQuest; readonly expanded: boolean; readonly onToggle: () => void }) {
  const statusColor = STATUS_COLORS[quest.status] ?? STATUS_COLORS.active
  const doneCount = quest.completed_objectives.length
  const totalCount = quest.objectives.length
  return (
    <div className={`codex-card${expanded ? ' codex-card--open' : ''}`} onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onToggle() }} aria-expanded={expanded}>
      <div className="codex-card-header">
        <span className="codex-dot" style={{ background: statusColor }} title={quest.status} />
        <span className="codex-card-name">{quest.title}</span>
        {totalCount > 0 && <span className="codex-card-meta">{doneCount}/{totalCount}</span>}
        <span className="codex-chevron">{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && (
        <div className="codex-card-body">
          <p className="codex-description">{quest.description}</p>
          {quest.objectives.length > 0 && (
            <div className="codex-objectives">
              {quest.objectives.map((obj, i) => {
                const done = quest.completed_objectives.includes(obj)
                return (
                  <p key={i} className={`codex-objective${done ? ' codex-objective--done' : ''}`}>
                    {done ? '✓' : '○'} {obj}
                  </p>
                )
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
  )
}

export default function CodexPanel() {
  const codex = useGameStore((s) => s.codex)
  const [tab, setTab] = useState<CodexTab>('npcs')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const npcs      = useMemo(() => Object.values(codex?.npcs      ?? {}), [codex])
  const locations = useMemo(() => Object.values(codex?.locations ?? {}), [codex])
  const quests    = useMemo(() => Object.values(codex?.quests    ?? {}), [codex])

  const q = search.trim().toLowerCase()

  const filteredNpcs = useMemo(() =>
    q ? npcs.filter((n) => n.name.toLowerCase().includes(q) || n.role.toLowerCase().includes(q) || n.location.toLowerCase().includes(q))
      : npcs,
    [npcs, q],
  )

  const filteredLocations = useMemo(() =>
    q ? locations.filter((l) => l.name.toLowerCase().includes(q) || l.region.toLowerCase().includes(q) || l.description.toLowerCase().includes(q))
      : locations,
    [locations, q],
  )

  const filteredQuests = useMemo(() =>
    q ? quests.filter((qst) => qst.title.toLowerCase().includes(q) || qst.description.toLowerCase().includes(q))
      : quests,
    [quests, q],
  )

  const counts: Record<CodexTab, number> = {
    npcs:      npcs.length,
    locations: locations.length,
    quests:    quests.length,
  }

  const activeQuests = quests.filter((qst) => qst.status === 'active').length

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  const isEmpty = npcs.length === 0 && locations.length === 0 && quests.length === 0

  return (
    <div className="codex-panel">
      <div className="codex-header">
        <h3 className="panel-title" style={{ marginBottom: 0 }}>Lore Codex</h3>
        {activeQuests > 0 && (
          <span className="codex-active-quests" title={`${activeQuests} active quest${activeQuests !== 1 ? 's' : ''}`}>
            {activeQuests} active
          </span>
        )}
      </div>

      {isEmpty ? (
        <p className="codex-empty">No lore recorded yet. The DM will populate this as the adventure unfolds.</p>
      ) : (
        <>
          <div className="codex-tabs">
            {(['npcs', 'locations', 'quests'] as CodexTab[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`codex-tab${tab === t ? ' codex-tab--active' : ''}`}
                onClick={() => { setTab(t); setExpandedId(null) }}
              >
                {t === 'npcs' ? 'NPCs' : t === 'locations' ? 'Places' : 'Quests'}
                {counts[t] > 0 && <span className="codex-tab-count">{counts[t]}</span>}
              </button>
            ))}
          </div>

          <div className="codex-search-wrap">
            <input
              type="search"
              className="codex-search"
              placeholder="Search…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setExpandedId(null) }}
              aria-label="Search codex"
            />
          </div>

          <div className="codex-list">
            {tab === 'npcs' && (
              filteredNpcs.length === 0
                ? <p className="codex-empty">No matches.</p>
                : filteredNpcs.map((npc) => (
                    <NPCCard key={npc.id} npc={npc} expanded={expandedId === npc.id} onToggle={() => toggle(npc.id)} />
                  ))
            )}
            {tab === 'locations' && (
              filteredLocations.length === 0
                ? <p className="codex-empty">No matches.</p>
                : filteredLocations.map((loc) => (
                    <LocationCard key={loc.id} loc={loc} expanded={expandedId === loc.id} onToggle={() => toggle(loc.id)} />
                  ))
            )}
            {tab === 'quests' && (
              filteredQuests.length === 0
                ? <p className="codex-empty">No matches.</p>
                : filteredQuests.map((qst) => (
                    <QuestCard key={qst.id} quest={qst} expanded={expandedId === qst.id} onToggle={() => toggle(qst.id)} />
                  ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
