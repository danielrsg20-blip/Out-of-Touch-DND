const NOISE_WORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'and',
  'elite',
  'greater',
  'lesser',
  'ancient',
  'young',
  'old',
])

const ROLE_WORDS = new Set([
  'raider',
  'brute',
  'captain',
  'chief',
  'warlord',
  'boss',
  'hunter',
  'scout',
  'archer',
  'shaman',
  'mage',
  'sorcerer',
  'warrior',
  'guard',
  'soldier',
  'fighter',
  'champion',
])

const KEYWORD_FALLBACKS: Array<{ pattern: RegExp; labels: string[] }> = [
  { pattern: /(skeleton|undead|zombie|ghoul)/i, labels: ['skeleton', 'armored_skeleton', 'dark_skeleton'] },
  { pattern: /wraith/i, labels: ['dark_wraith', 'purple_wraith', 'skeleton'] },
  { pattern: /goblin/i, labels: ['goblin'] },
  { pattern: /orc/i, labels: ['orc'] },
  { pattern: /kobold/i, labels: ['lizardman', 'small_lizard', 'goblin'] },
  { pattern: /bandit/i, labels: ['assassin', 'armored_warrior', 'goblin'] },
  { pattern: /spider/i, labels: ['spider'] },
  { pattern: /wolf/i, labels: ['gray_wolf', 'brown_wolf', 'blue_wolf'] },
  { pattern: /boar/i, labels: ['brown_boar', 'brown_beast'] },
  { pattern: /bat/i, labels: ['bat', 'black_bat'] },
  { pattern: /dragon/i, labels: ['black_dragon', 'red_dragon', 'dragon'] },
]

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function pushUnique(target: string[], value: string): void {
  if (value && !target.includes(value)) {
    target.push(value)
  }
}

export function getMonsterSpriteCandidates(enemyName: string): string[] {
  const normalized = normalizeName(enemyName)
  if (!normalized) {
    return []
  }

  const candidates: string[] = []
  const tokens = normalized.split('_').filter(Boolean)

  pushUnique(candidates, normalized)

  const filtered = tokens.filter((token) => !NOISE_WORDS.has(token))
  if (filtered.length > 0) {
    pushUnique(candidates, filtered.join('_'))
  }

  if (filtered.length > 1) {
    pushUnique(candidates, filtered.slice(0, -1).join('_'))
  }

  for (let size = Math.min(3, filtered.length); size >= 1; size -= 1) {
    for (let i = 0; i <= filtered.length - size; i += 1) {
      pushUnique(candidates, filtered.slice(i, i + size).join('_'))
    }
  }

  for (const token of filtered) {
    if (!ROLE_WORDS.has(token)) {
      pushUnique(candidates, token)
    }
  }

  for (const fallback of KEYWORD_FALLBACKS) {
    if (fallback.pattern.test(enemyName)) {
      for (const label of fallback.labels) {
        pushUnique(candidates, label)
      }
    }
  }

  // Conservative generic fallbacks if no specific match resolves.
  pushUnique(candidates, 'goblin')
  pushUnique(candidates, 'skeleton')

  return candidates
}
