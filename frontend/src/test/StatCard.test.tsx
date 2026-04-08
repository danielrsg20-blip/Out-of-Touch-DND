import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from '../components/ui/StatCard'

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="STR" value={16} />)
    expect(screen.getByText('STR')).toBeInTheDocument()
    expect(screen.getByText('16')).toBeInTheDocument()
  })

  it('renders subValue when provided', () => {
    render(<StatCard label="STR" value={16} subValue="+3" />)
    expect(screen.getByText('+3')).toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    render(<StatCard label="HP" value={45} icon="❤️" />)
    expect(screen.getByText('❤️')).toBeInTheDocument()
  })

  it('applies highlight styling', () => {
    const { container } = render(<StatCard label="AC" value={18} highlight />)
    const card = container.firstElementChild
    expect(card?.className).toContain('rgba(228,168,83')
  })

  it('applies custom className', () => {
    const { container } = render(<StatCard label="AC" value={18} className="custom-test" />)
    expect(container.querySelector('.custom-test')).toBeInTheDocument()
  })
})
