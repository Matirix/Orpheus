export interface Note {
  midi: number
  startBeat: number
  beats: number
}

export interface Part {
  name: string
  notes: Note[]
}

export interface Song {
  bpm: number
  bar: number
  parts: Part[]
}
