import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useGameStore } from '../stores/gameStore'

// Mock sprite manifest
vi.mock('../data/spriteManifest', () => ({
  getItemSpriteKey: () => null,
  resolveSpriteUrl: () => null,
}))

// Import after mocks are set up
const { default: LootToast } = await import('../components/panels/LootToast')

describe('LootToast', () => {
  beforeEach(() => {
    useGameStore.setState({ lootData: null })
  })

  it('renders nothing when lootData is null', () => {
    const { container } = render(<LootToast />)
    expect(container.firstChild).toBeNull()
  })

  it('renders loot items when lootData is set', () => {
    useGameStore.setState({
      lootData: {
        items: [{ name: 'Healing Potion', quantity: 2, value_gp: 50 }],
        gold: 100,
        description: 'You found treasure!',
      },
    })
    render(<LootToast />)
    expect(screen.getByText('⚔️ Loot Acquired!')).toBeInTheDocument()
    expect(screen.getByText('You found treasure!')).toBeInTheDocument()
    expect(screen.getByText(/Healing Potion/)).toBeInTheDocument()
  })

  it('renders gold amount', () => {
    useGameStore.setState({
      lootData: {
        items: [],
        gold: 50,
      },
    })
    render(<LootToast />)
    expect(screen.getByText(/gold pieces/)).toBeInTheDocument()
  })

  it('dismisses on click', async () => {
    const user = userEvent.setup()
    useGameStore.setState({
      lootData: {
        items: [{ name: 'Dagger' }],
      },
    })
    render(<LootToast />)
    expect(screen.getByText(/Dagger/)).toBeInTheDocument()
    await user.click(screen.getByRole('button'))
    expect(useGameStore.getState().lootData).toBeNull()
  })

  it('has correct accessibility attributes', () => {
    useGameStore.setState({
      lootData: { items: [{ name: 'Shield' }] },
    })
    render(<LootToast />)
    const toast = screen.getByRole('button')
    expect(toast).toHaveAttribute('aria-label', 'Dismiss loot notification')
    expect(toast).toHaveAttribute('tabindex', '0')
  })
})
