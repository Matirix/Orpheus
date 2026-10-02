import { NOTE_COLORS } from './layout'

export interface StaffNote {
  m: number
  s: number
  d: number
  state: number
}

const LINE_SPACING = 10
const NOW_X = 110
const PIXELS_PER_BEAT = 90
const STAFF_HEIGHT = 210
const STAFF = {
  treble: { bot: 90, base: 30, mid: 34 },
  bass: { bot: 150, base: 18, mid: 22 },
}
const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
const SHARP = [1, 3, 6, 8, 10]

/** Diatonic step: E4 = 30, G2 = 18. */
export function midiToDiatonicStep(midi: number): number {
  return (Math.floor(midi / 12) - 1) * 7 + (LETTER[midi % 12] ?? 0)
}

export const dia = midiToDiatonicStep

export function getStaffType(midi: number): 'treble' | 'bass' {
  return midi >= 60 ? 'treble' : 'bass'
}

export function getNoteY(
  midi: number,
  staffBot: number,
  staffBase: number,
  lineSpacing: number
): number {
  return staffBot - (midiToDiatonicStep(midi) - staffBase) * (lineSpacing / 2)
}

export function isSharp(midi: number): boolean {
  return SHARP.includes(midi % 12)
}

function colorFor(state: number): string {
  return NOTE_COLORS[state] ?? NOTE_COLORS[0] ?? '#4f8cff'
}

export class StaffRenderer {
  private ctx: CanvasRenderingContext2D | null = null
  private width = 0

  mount(canvas: HTMLCanvasElement, width: number, height = STAFF_HEIGHT): void {
    canvas.width = width
    canvas.height = height
    this.ctx = canvas.getContext('2d')
    this.width = width
  }

  unmount(): void {
    this.ctx = null
  }

  draw(notes: StaffNote[], t: number, barBeats: number): void {
    const g = this.ctx
    if (!g) return
    const SW = this.width
    const SH = STAFF_HEIGHT
    g.clearRect(0, 0, SW, SH)
    g.strokeStyle = '#333'
    g.fillStyle = '#222'
    g.lineWidth = 1
    for (const st of [STAFF.treble, STAFF.bass]) {
      for (let i = 0; i < 5; i++) {
        const y = st.bot - i * LINE_SPACING + 0.5
        g.beginPath()
        g.moveTo(10, y)
        g.lineTo(SW - 10, y)
        g.stroke()
      }
    }
    g.beginPath()
    g.moveTo(10.5, STAFF.treble.bot - 4 * LINE_SPACING)
    g.lineTo(10.5, STAFF.bass.bot)
    g.stroke()
    g.textAlign = 'left'
    g.font = '58px serif'
    g.fillText('\u{1D11E}', 18, STAFF.treble.bot + 6)
    g.font = '40px serif'
    g.fillText('\u{1D122}', 20, STAFF.bass.bot - 12)

    g.save()
    g.beginPath()
    g.rect(78, 0, SW - 78, SH)
    g.clip()
    g.strokeStyle = '#4f8cff'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(NOW_X, 30)
    g.lineTo(NOW_X, SH - 20)
    g.stroke()
    g.strokeStyle = '#333'
    g.lineWidth = 1
    const end = notes.reduce((a, n) => Math.max(a, n.s + n.d), 0)
    for (let b = barBeats; b < end; b += barBeats) {
      const x = NOW_X + (b - 0.4 - t) * PIXELS_PER_BEAT
      g.beginPath()
      g.moveTo(x, STAFF.treble.bot - 4 * LINE_SPACING)
      g.lineTo(x, STAFF.bass.bot)
      g.stroke()
    }
    for (const n of notes) {
      const x = NOW_X + (n.s - t) * PIXELS_PER_BEAT
      if (x > 60 && x < SW + 20) this.drawNote(g, n, x)
    }
    g.restore()
  }

  private drawNote(g: CanvasRenderingContext2D, n: StaffNote, x: number): void {
    const st = n.m >= 60 ? STAFF.treble : STAFF.bass
    const d = dia(n.m)
    const yOf = (l: number) => st.bot - (l - st.base) * (LINE_SPACING / 2)
    const y = yOf(d)
    if (y < 4 || y > STAFF_HEIGHT - 4) return
    const col = colorFor(n.state)

    g.strokeStyle = '#333'
    g.lineWidth = 1.2
    const ledger = (l: number) => {
      g.beginPath()
      g.moveTo(x - 11, yOf(l))
      g.lineTo(x + 11, yOf(l))
      g.stroke()
    }
    for (let l = st.base - 2; l >= d; l -= 2) ledger(l)
    for (let l = st.base + 10; l <= d; l += 2) ledger(l)

    g.save()
    g.translate(x, y)
    g.rotate(-0.35)
    g.beginPath()
    g.ellipse(0, 0, 6.5, 4.6, 0, 0, Math.PI * 2)
    if (n.d >= 2) {
      g.strokeStyle = col
      g.lineWidth = 2
      g.stroke()
    } else {
      g.fillStyle = col
      g.fill()
    }
    g.restore()

    if (n.d < 4) {
      const up = d < st.mid
      const sx = up ? x + 6 : x - 6
      const ey = up ? y - 35 : y + 35
      g.strokeStyle = col
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(sx, y)
      g.lineTo(sx, ey)
      if (n.d < 1)
        g.quadraticCurveTo(sx + 12, up ? ey + 8 : ey - 8, sx + 8, up ? ey + 20 : ey - 20)
      g.stroke()
    }
    if (n.d === 1.5 || n.d === 3) {
      g.fillStyle = col
      g.beginPath()
      g.arc(x + 12, (d - st.base) % 2 === 0 ? y - 5 : y, 2, 0, Math.PI * 2)
      g.fill()
    }
    if (SHARP.includes(n.m % 12)) {
      g.fillStyle = col
      g.font = '20px serif'
      g.textAlign = 'right'
      g.fillText('\u266F', x - 9, y + 7)
    }
  }
}