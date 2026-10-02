export class AudioCapture {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null

  async init(): Promise<AudioContext> {
    this.context = new AudioContext({ latencyHint: 'interactive' })
    await this.context.resume()
    return this.context
  }

  getContext(): AudioContext | null {
    return this.context
  }
}
