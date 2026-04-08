import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ItemCard } from '../components/panels/ItemCard'
import type { ItemData } from '../types'

// Mock sprite manifest — no real sprites in test env
vi.mock('../data/spriteManifest', () => ({
  getItemSpriteKey: () => null,
  resolveSpriteUrl: () => null,
}))

function makeItem(overrides: Partial<ItemData> = {}): ItemData {
  return {
    id: 'test-item-1',
    name: 'Longsword',
    category: 'weapon',
    subcategory: 'martial melee',
    cost_gp: 15,
    weight_lb: 3,
    description: 'A versatile martial weapon.',
    damage: '1d8',
    damage_type: 'slashing',
    properties: ['versatile'],
    ac_base: null,
    dex_mod: false,
    max_dex: null,
    str_req: null,
    stealth_disadvantage: false,
    equipped: true,
    quantity: 1,
    notes: '',
    ...overrides,
  }
}

describe('ItemCard', () => {
  it('renders item name', () => {
    render(<ItemCard item={makeItem()} />)
    expect(screen.getByText('Longsword')).toBeInTheDocument()
  })

  it('renders damage for weapons', () => {
    render(<ItemCard item={makeItem({ damage: '1d8', damage_type: 'slashing' })} />)
    expect(screen.getByText(/1d8/)).toBeInTheDocument()
  })

  it('renders AC for armor', () => {
    render(
      <ItemCard
        item={makeItem({
          name: 'Chain Mail',
          category: 'armor',
          damage: null,
          damage_type: null,
          ac_base: 16,
          dex_mod: false,
        })}
      />,
    )
    expect(screen.getByText('Armor Class')).toBeInTheDocument()
    expect(screen.getByText('16')).toBeInTheDocument()
  })

  it('renders rarity badge for magical items', () => {
    render(
      <ItemCard
        item={makeItem({
          magical: true,
          rarity: 'rare',
        })}
      />,
    )
    expect(screen.getByText(/rare/i)).toBeInTheDocument()
  })

  it('renders in compact mode', () => {
    const { container } = render(<ItemCard item={makeItem()} compact />)
    // Should still render the item name
    expect(screen.getByText('Longsword')).toBeInTheDocument()
    // Compact uses p-3 instead of p-4
    expect(container.querySelector('.p-3')).toBeInTheDocument()
  })

  it('renders description text', () => {
    render(
      <ItemCard item={makeItem({ description: 'A versatile martial weapon.' })} />,
    )
    expect(screen.getByText('A versatile martial weapon.')).toBeInTheDocument()
  })
})
