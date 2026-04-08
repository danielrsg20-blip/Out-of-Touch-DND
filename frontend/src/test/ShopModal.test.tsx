import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useGameStore } from '../stores/gameStore'
import { useSessionStore } from '../stores/sessionStore'

// Mock sprite manifest and supabase
vi.mock('../data/spriteManifest', () => ({
  getItemSpriteKey: () => null,
  resolveSpriteUrl: () => null,
}))
vi.mock('../lib/supabaseClient', () => ({
  invokeEdgeFunction: vi.fn().mockResolvedValue({}),
}))

// jsdom doesn't support HTMLDialogElement.showModal/close
HTMLDialogElement.prototype.showModal = vi.fn()
HTMLDialogElement.prototype.close = vi.fn()

const { default: ShopModal } = await import('../components/panels/ShopModal')

describe('ShopModal', () => {
  beforeEach(() => {
    useGameStore.setState({ shopData: null })
    useSessionStore.setState({ roomCode: 'test-room', playerId: 'player-1', mockMode: true })
  })

  it('renders nothing when shopData is null', () => {
    const { container } = render(<ShopModal />)
    expect(container.querySelector('.shop-overlay')).toBeNull()
  })

  it('renders shop name and items when shopData is set', () => {
    useGameStore.setState({
      shopData: {
        shop_name: "Ye Olde Shoppe",
        items: [
          { name: 'Longsword', type: 'weapon', price_gp: 15 },
          { name: 'Chain Mail', type: 'armor', price_gp: 75 },
        ],
      },
    })
    render(<ShopModal />)
    expect(screen.getByText("Ye Olde Shoppe")).toBeInTheDocument()
    expect(screen.getByText('Longsword')).toBeInTheDocument()
    expect(screen.getByText('Chain Mail')).toBeInTheDocument()
  })

  it('renders buy buttons for each item', () => {
    useGameStore.setState({
      shopData: {
        shop_name: 'Test Shop',
        items: [
          { name: 'Dagger', type: 'weapon', price_gp: 2 },
        ],
      },
    })
    render(<ShopModal />)
    const buyButtons = screen.getAllByText('Buy')
    expect(buyButtons.length).toBeGreaterThan(0)
  })

  it('renders shopkeeper name when provided', () => {
    useGameStore.setState({
      shopData: {
        shop_name: 'Smithy',
        shopkeeper: 'Thorin',
        items: [],
      },
    })
    render(<ShopModal />)
    expect(screen.getByText(/Thorin/)).toBeInTheDocument()
  })
})
