import { LOW, HIGH, FALLING_HEIGHT, PIXELS_PER_BEAT, NOTE_COLORS, noteName } from './layout'
import type { KeyGeom } from './keyboard'

export interface FallingNote {
  m: number
  s: number
  d: number
  state: number
}

function colorFor(state: number): string {
  return NOTE_COLORS[state] ?? NOTE_COLORS[0] ?? '#4f8cff'
}

export class FallingRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null

  mount(canvas: HTMLCanvasElement, width: number, height = FALLING_HEIGHT): void {
    this.canvas = canvas
    canvas.width = width
    canvas.height = height
    this.ctx = canvas.getContext('2d')
  }

  unmount(): void {
    this.canvas = null
    this.ctx = null
  }

  draw(notes: FallingNote[], t: number, geom: Record<number, KeyGeom>, showCountdown: boolean): void {
    const g = this.ctx
    if (!g) return
    const W = this.canvas?.width ?? 0
    const H = this.canvas?.height ?? FALLING_HEIGHT
    g.clearRect(0, 0, W, H)
    g.strokeStyle = '#1c2027'
    g.lineWidth = 1
    for (let m = LOW; m <= HIGH; m++) {
      const lane = m % 12 === 0 ? geom[m] : undefined
      if (lane) {
        g.beginPath()
        g.moveTo(lane.x + 0.5, 0)
        g.lineTo(lane.x + 0.5, H)
        g.stroke()
      }
    }
    for (const n of notes) {
      const k = geom[n.m]
      if (!k) continue
      const bottom = H - (n.s - t) * PIXELS_PER_BEAT
      const top = bottom - n.d * PIXELS_PER_BEAT
      if (bottom < 0 || top > H) continue
      g.fillStyle = colorFor(n.state)
      g.beginPath()
      g.roundRect(k.x + 1, top + 1, k.w - 2, Math.max(bottom - top - 2, 4), 4)
      g.fill()
      if (k.w >= 16) {
        g.fillStyle = '#fff'
        g.font = '10px system-ui'
        g.textAlign = 'center'
        g.fillText(noteName(n.m), k.x + k.w / 2, bottom - 7)
      }
    }
    g.fillStyle = '#ffffff55'
    g.fillRect(0, H - 2, W, 2)
    if (showCountdown && t < 0) {
      g.fillStyle = '#fff'
      g.font = '28px system-ui'
      g.textAlign = 'center'
      g.fillText('Get ready...', W / 2, 60)
    }
  }
}