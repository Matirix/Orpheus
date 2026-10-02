import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PianoLearn } from '../../src/ui/PianoLearn'

describe('PianoLearn view', () => {
  beforeEach(() => {
    window.localStorage.clear()
    // jsdom has no canvas backend; the renderers must no-op rather than throw
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => null
    ) as unknown as HTMLCanvasElement['getContext']
  })

  it('renders controls and the three mount points', () => {
    const { container } = render(<PianoLearn />)
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Listen' })).toBeTruthy()
    expect(container.querySelector('.keyboard')).toBeTruthy()
    expect(container.querySelector('canvas.staff-canvas')).toBeTruthy()
    expect(container.querySelector('canvas.falling-canvas')).toBeTruthy()
  })

  it('builds all 88 keys with titles and geometry', () => {
    const { container } = render(<PianoLearn />)
    const keys = container.querySelectorAll('.keyboard .key')
    expect(keys.length).toBe(88)

    const a0 = container.querySelector('.keyboard .key[title="A0"]')
    expect(a0).toBeTruthy()
    expect(a0?.className).toContain('white')

    const c8 = container.querySelector('.keyboard .key[title="C8"]')
    expect(c8).toBeTruthy()

    const cs4 = container.querySelector('.keyboard .key[title="C#4"]')
    expect(cs4?.className).toContain('black')
  })

  it('sizes the falling canvas to the keyboard width', () => {
    const { container } = render(<PianoLearn />)
    const falling = container.querySelector(
      'canvas.falling-canvas'
    ) as HTMLCanvasElement
    // 52 white keys at the computed width
    expect(falling.width).toBeGreaterThan(0)
    expect(falling.height).toBe(280)
  })

  it('highlights a key on the next animation frame while it is held', async () => {
    const { container } = render(<PianoLearn />)
    const key = container.querySelector('.keyboard .key[title="C4"]') as HTMLElement
    expect(key).toBeTruthy()

    key.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await waitFor(() => expect(key.classList.contains('on')).toBe(true))

    key.dispatchEvent(new Event('pointerup', { bubbles: true }))
    await waitFor(() => expect(key.classList.contains('on')).toBe(false))
  })

  it('keeps the falling canvas aligned with the keyboard', () => {
    const { container } = render(<PianoLearn />)
    const falling = container.querySelector(
      'canvas.falling-canvas'
    ) as HTMLCanvasElement
    const keyboard = container.querySelector('.keyboard') as HTMLElement
    // both are driven by KeyboardRenderer.width
    expect(falling.width).toBe(Number.parseInt(keyboard.style.width, 10))
  })
})