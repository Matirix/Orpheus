import {
  BLACK_KEY_RATIO,
  LOW,
  HIGH,
  noteName,
  whiteKeyWidth,
  isBlackKey,
} from './layout'

export interface KeyGeom {
  x: number
  w: number
  black: boolean
}

export class KeyboardRenderer {
  readonly geom: Record<number, KeyGeom> = {}
  readonly keyEls: Record<number, HTMLElement> = {}
  readonly manual = new Set<number>()
  private container: HTMLElement | null = null
  private whiteCount = 0
  private whiteWidth = 0
  private teardown: (() => void) | null = null

  mount(container: HTMLElement, viewportWidth: number): void {
    this.unmount()
    this.container = container
    container.textContent = ''
    const whiteWidth = whiteKeyWidth(viewportWidth)
    this.whiteWidth = whiteWidth

    const disposers: (() => void)[] = []
    const bind = (el: HTMLElement, type: string, handler: (midi: number) => void) => {
      const listener = () => {
        const midi = Number(el.dataset.midi)
        if (Number.isFinite(midi)) handler(midi)
      }
      el.addEventListener(type, listener)
      disposers.push(() => el.removeEventListener(type, listener))
    }

    for (let m = LOW; m <= HIGH; m++) {
      const black = isBlackKey(m)
      const el = document.createElement('div')
      el.className = 'key ' + (black ? 'black' : 'white')
      el.dataset.midi = String(m)
      const blackWidth = Math.round(whiteWidth * BLACK_KEY_RATIO)
      const w = black ? blackWidth : whiteWidth
      const x = black ? this.whiteCount * whiteWidth - blackWidth / 2 : this.whiteCount * whiteWidth
      el.style.left = x + 'px'
      el.style.width = w + 'px'
      el.title = noteName(m)
      container.appendChild(el)
      this.keyEls[m] = el
      this.geom[m] = { x, w, black }
      bind(el, 'pointerdown', (midi) => this.manual.add(midi))
      bind(el, 'pointerup', (midi) => this.manual.delete(midi))
      bind(el, 'pointerleave', (midi) => this.manual.delete(midi))
      if (!black) this.whiteCount++
    }
    this.teardown = () => disposers.forEach((d) => d())
    container.style.width = this.width + 'px'
  }

  /** Total pixel width of the mounted keyboard, derived from its own geometry. */
  get width(): number {
    return this.whiteCount * this.whiteWidth
  }

  unmount(): void {
    this.teardown?.()
    this.teardown = null
    if (this.container) this.container.textContent = ''
    this.container = null
    this.whiteCount = 0
    this.whiteWidth = 0
    this.manual.clear()
  }

  setActive(active: Set<number>): void {
    for (const [key, el] of Object.entries(this.keyEls)) {
      el.classList.toggle('on', active.has(Number(key)))
    }
  }
}