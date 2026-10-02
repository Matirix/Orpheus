import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FallingRenderer } from '../../src/render/falling'
import { StaffRenderer } from '../../src/render/staff'
import { PIXELS_PER_BEAT } from '../../src/render/layout'
import type { KeyGeom } from '../../src/render/keyboard'

/** Minimal recording 2D context so we can assert on real draw calls. */
type Recorder = Record<string, unknown[][]>

function mockContext() {
  const calls: Recorder = {
    fillRect: [],
    clearRect: [],
    moveTo: [],
    lineTo: [],
    stroke: [],
    fill: [],
    roundRect: [],
    fillText: [],
    beginPath: [],
    save: [],
    restore: [],
    ellipse: [],
    translate: [],
  }
  const ctx: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
  }
  for (const name of Object.keys(calls)) {
    ctx[name] = (...args: unknown[]) => {
      calls[name]!.push(args)
    }
  }
  ctx.rotate = () => {}
  ctx.arc = () => {}
  ctx.quadraticCurveTo = () => {}
  ctx.clip = () => {}
  ctx.closePath = () => {}
  ctx.rect = () => {}
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

type MockCtx = ReturnType<typeof mockContext>

function canvasWithContext(ctx: CanvasRenderingContext2D) {
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx)
  return canvas
}

const GEOM: Record<number, KeyGeom> = {
  60: { x: 100, w: 20, black: false },
  61: { x: 110, w: 12, black: true },
}

describe('FallingRenderer', () => {
  let renderer: FallingRenderer
  let calls: Recorder
  let mock: MockCtx

  beforeEach(() => {
    renderer = new FallingRenderer()
    mock = mockContext()
    calls = mock.calls
    renderer.mount(canvasWithContext(mock.ctx), 400, 280)
  })

  it('draws a note rect for each in-range note', () => {
    calls.roundRect!.length = 0
    renderer.draw(
      [
        { m: 60, s: 1, d: 1, state: 0 },
        { m: 61, s: 2, d: 1, state: 0 },
      ],
      0,
      GEOM,
      false
    )
    expect(calls.roundRect!).toHaveLength(2)
  })

  it('positions a note so its bottom sits on the hit line at its start beat', () => {
    calls.roundRect!.length = 0
    // bottom = H - (s - t) * PPB ; for s === t the bottom is exactly H
    renderer.draw([{ m: 60, s: 2, d: 1, state: 0 }], 2, GEOM, false)
    const [, top, , height] = calls.roundRect![0] as number[]
    expect(height).toBeCloseTo(PIXELS_PER_BEAT - 2, 5)
    // note is drawn 1px inside its box
    expect(top).toBeCloseTo(280 - PIXELS_PER_BEAT + 1, 5)
  })

  it('skips notes whose pitch has no key geometry', () => {
    calls.roundRect!.length = 0
    renderer.draw([{ m: 99, s: 1, d: 1, state: 0 }], 0, GEOM, false)
    expect(calls.roundRect!).toHaveLength(0)
  })

  it('culls notes that are still off screen', () => {
    calls.roundRect!.length = 0
    renderer.draw([{ m: 60, s: 100, d: 1, state: 0 }], 0, GEOM, false)
    expect(calls.roundRect!).toHaveLength(0)
  })

  it('always paints the hit line and clears the previous frame', () => {
    calls.fillRect!.length = 0
    calls.clearRect!.length = 0
    renderer.draw([], 0, GEOM, false)
    expect(calls.clearRect!).toHaveLength(1)
    // the hit line is the final fillRect of the frame
    const [, y] = calls.fillRect![calls.fillRect!.length - 1] as number[]
    expect(y).toBe(278)
  })

  it('shows the countdown only while song time is negative', () => {
    calls.fillText!.length = 0
    renderer.draw([], -1, GEOM, true)
    expect(calls.fillText!.map((c) => c[0])).toContain('Get ready...')

    calls.fillText!.length = 0
    renderer.draw([], 1, GEOM, true)
    expect(calls.fillText!.map((c) => c[0])).not.toContain('Get ready...')
  })
})

describe('StaffRenderer', () => {
  let renderer: StaffRenderer
  let calls: Recorder
  let mock: MockCtx

  beforeEach(() => {
    renderer = new StaffRenderer()
    mock = mockContext()
    calls = mock.calls
    renderer.mount(canvasWithContext(mock.ctx), 600, 210)
  })

  it('draws both staves as five lines each', () => {
    calls.stroke!.length = 0
    renderer.draw([], 0, 4)
    // 10 staff lines + the brace + the now-line + any barlines
    expect(calls.stroke!.length).toBeGreaterThanOrEqual(11)
  })

  it('draws clefs', () => {
    calls.fillText!.length = 0
    renderer.draw([], 0, 4)
    const glyphs = calls.fillText!.map((c) => c[0])
    expect(glyphs).toContain('\u{1D11E}')
    expect(glyphs).toContain('\u{1D122}')
  })

  it('draws one note head per visible note', () => {
    calls.ellipse!.length = 0
    renderer.draw([{ m: 60, s: 0, d: 1, state: 0 }], 0, 4)
    expect(calls.ellipse!).toHaveLength(1)
  })

  it('places a treble note for midi >= 60 and a bass note below', () => {
    const yFor = (m: number) => {
      calls.translate!.length = 0
      renderer.draw([{ m, s: 0, d: 1, state: 0 }], 0, 4)
      const [, y] = calls.translate!.find((c) => c[1] !== 0) as number[]
      return y
    }
    // treble notes sit higher on the canvas than bass notes
    expect(yFor(72)).toBeLessThan(yFor(48))
  })

  it('draws barlines at bar boundaries', () => {
    calls.moveTo!.length = 0
    renderer.draw([{ m: 60, s: 0, d: 16, state: 0 }], 0, 4)
    // NOW_X + (b - 0.4 - t) * PXB for b = 4, 8, 12
    const xs = calls.moveTo!.filter((c) => (c[0] as number) > 100)
    expect(xs.length).toBeGreaterThanOrEqual(3)
  })

  it('adds a sharp glyph for black-key notes', () => {
    calls.fillText!.length = 0
    renderer.draw([{ m: 61, s: 0, d: 1, state: 0 }], 0, 4)
    expect(calls.fillText!.map((c) => c[0])).toContain('\u266F')

    calls.fillText!.length = 0
    renderer.draw([{ m: 60, s: 0, d: 1, state: 0 }], 0, 4)
    expect(calls.fillText!.map((c) => c[0])).not.toContain('\u266F')
  })

  it('uses an open head for whole and half notes', () => {
    const stemFor = (d: number) => {
      calls.lineTo!.length = 0
      renderer.draw([{ m: 60, s: 0, d, state: 0 }], 0, 4)
      return calls.lineTo!.length
    }
    // a whole note has no stem, a quarter note does
    expect(stemFor(4)).toBeLessThan(stemFor(1))

    const filledFor = (d: number) => {
      calls.fill!.length = 0
      renderer.draw([{ m: 60, s: 0, d, state: 0 }], 0, 4)
      return calls.fill!.length
    }
    // an open (half/whole) head is stroked, a quarter head is filled
    expect(filledFor(4)).toBeLessThan(filledFor(1))
  })
})