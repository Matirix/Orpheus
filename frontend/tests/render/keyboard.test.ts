import { describe, it, expect, beforeEach } from 'vitest'
import { KeyboardRenderer } from '../../src/render/keyboard'
import {
  noteName,
  whiteKeyWidth,
  isBlackKey,
  NOTE_COLORS,
  FALLING_HEIGHT,
} from '../../src/render/layout'

describe('layout helpers', () => {
  it('names notes from midi numbers', () => {
    expect(noteName(60)).toBe('C4')
    expect(noteName(61)).toBe('C#4')
    expect(noteName(21)).toBe('A0')
    expect(noteName(108)).toBe('C8')
  })

  it('identifies black keys', () => {
    expect(isBlackKey(61)).toBe(true)
    expect(isBlackKey(60)).toBe(false)
  })

  it('never shrinks white keys below the minimum', () => {
    expect(whiteKeyWidth(100)).toBe(16)
    expect(whiteKeyWidth(2000)).toBeGreaterThan(16)
  })

  it('has one colour per note state', () => {
    expect(NOTE_COLORS).toHaveLength(3)
  })

  it('uses the legacy falling lane height', () => {
    expect(FALLING_HEIGHT).toBe(280)
  })
})

describe('KeyboardRenderer', () => {
  let renderer: KeyboardRenderer
  let container: HTMLElement

  beforeEach(() => {
    renderer = new KeyboardRenderer()
    container = document.createElement('div')
    renderer.mount(container, 1200)
  })

  it('builds exactly 88 keys across the full range', () => {
    expect(container.querySelectorAll('.key')).toHaveLength(88)
    expect(container.querySelector('[title="A0"]')).toBeTruthy()
    expect(container.querySelector('[title="C8"]')).toBeTruthy()
  })

  it('lays white keys left to right and black keys overlapping', () => {
    const c4 = renderer.geom[60]
    const cs4 = renderer.geom[61]
    expect(c4?.black).toBe(false)
    expect(cs4?.black).toBe(true)
    // the black key straddles the boundary between its white neighbours
    expect(cs4!.x).toBeGreaterThan(c4!.x)
    expect(cs4!.x + cs4!.w).toBeLessThan(renderer.geom[62]!.x + renderer.geom[62]!.w)
  })

  it('reports a width covering all 52 white keys', () => {
    const whiteKeys = Object.values(renderer.geom).filter((k) => !k.black)
    expect(whiteKeys).toHaveLength(52)
    const rightmost = Math.max(...whiteKeys.map((k) => k.x + k.w))
    expect(renderer.width).toBeGreaterThanOrEqual(rightmost)
  })

  it('toggles the on class from the active set', () => {
    const key = renderer.keyEls[60]!
    expect(key.classList.contains('on')).toBe(false)
    renderer.setActive(new Set([60]))
    expect(key.classList.contains('on')).toBe(true)
    renderer.setActive(new Set())
    expect(key.classList.contains('on')).toBe(false)
  })

  it('tracks manual presses and releases', () => {
    const key = renderer.keyEls[64]!
    key.dispatchEvent(new Event('pointerdown'))
    expect(renderer.manual.has(64)).toBe(true)
    key.dispatchEvent(new Event('pointerup'))
    expect(renderer.manual.has(64)).toBe(false)
  })

  it('clears the container on remount and unmount', () => {
    renderer.mount(container, 1200)
    expect(container.querySelectorAll('.key')).toHaveLength(88)
    renderer.unmount()
    expect(container.querySelectorAll('.key')).toHaveLength(0)
  })
})