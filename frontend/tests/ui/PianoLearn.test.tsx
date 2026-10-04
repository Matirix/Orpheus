import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PianoLearn } from '../../src/ui/PianoLearn'
import { MIN_FALLING_HEIGHT } from '../../src/render/layout'
import { songServer, stubFetch } from '../helpers/songServer'

describe('PianoLearn view', () => {
  beforeEach(() => {
    window.localStorage.clear()
    // jsdom has no canvas backend; the renderers must no-op rather than throw
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => null
    ) as unknown as HTMLCanvasElement['getContext']
    // The library is fetched on mount; an unstubbed fetch would reach a real
    // backend, if one happens to be running.
    stubFetch(songServer().handle)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
    // the well fills whatever height is left under the manuscript, but never
    // at the cost of pushing the keyboard off screen
    expect(falling.height).toBeGreaterThanOrEqual(MIN_FALLING_HEIGHT)
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

  it('sizes the keyboard to its container instead of the window', () => {
    // The bug: the keyboard was sized from window.innerWidth, so it overflowed
    // the narrower stage and forced a horizontal scrollbar.
    const containerWidth = 1400
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(
      containerWidth
    )
    const { container } = render(<PianoLearn />)
    const keyboard = container.querySelector('.keyboard') as HTMLElement
    const keyboardWidth = Number.parseInt(keyboard.style.width, 10)

    expect(keyboardWidth).toBeGreaterThan(0)
    expect(keyboardWidth).toBeLessThanOrEqual(containerWidth)
    // and it should actually fill the container, not be a narrow strip
    expect(keyboardWidth).toBeGreaterThan(containerWidth * 0.9)
  })
})