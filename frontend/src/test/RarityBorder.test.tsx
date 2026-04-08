import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RarityBorder, getRarityConfig, RARITY_CONFIG } from '../components/ui/RarityBorder'
import type { RarityTier } from '../components/ui/RarityBorder'

describe('getRarityConfig', () => {
  it('returns config for each known rarity', () => {
    const rarities: RarityTier[] = ['common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact']
    for (const rarity of rarities) {
      const config = getRarityConfig(rarity)
      expect(config).toBeTruthy()
      expect(config.border).toBeTruthy()
      expect(config.bg).toBeTruthy()
      expect(config.text).toBeTruthy()
    }
  })

  it('returns common config for null/undefined', () => {
    expect(getRarityConfig(null).border).toBe(RARITY_CONFIG.common.border)
    expect(getRarityConfig(undefined).border).toBe(RARITY_CONFIG.common.border)
  })
})

describe('RarityBorder', () => {
  it('renders children', () => {
    render(<RarityBorder rarity="rare"><span>Magic Sword</span></RarityBorder>)
    expect(screen.getByText('Magic Sword')).toBeInTheDocument()
  })

  it('applies rarity-specific border class', () => {
    const { container } = render(<RarityBorder rarity="legendary"><span>Crown</span></RarityBorder>)
    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain('border-amber')
  })

  it('applies custom className', () => {
    const { container } = render(<RarityBorder rarity="rare" className="extra"><span>Item</span></RarityBorder>)
    expect(container.querySelector('.extra')).toBeInTheDocument()
  })
})
