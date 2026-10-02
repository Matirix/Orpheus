export class GameClock {
  private startTime: number = 0
  private running: boolean = false
  private bps: number = 0

  start(bpm: number): void {
    this.bps = bpm / 60
    this.startTime = Date.now()
    this.running = true
  }

  stop(): void {
    this.running = false
  }

  getTime(): number {
    if (!this.running) return 0
    const elapsed = (Date.now() - this.startTime) / 1000
    return elapsed * this.bps
  }

  isRunning(): boolean {
    return this.running
  }
}
