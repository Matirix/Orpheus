export function resampleInput(input: Float32Array, ratio: number): Float32Array {
  let acc = 0
  let cnt = 0
  let phase = 0
  const out = new Float32Array(Math.ceil(input.length / ratio) + 1)
  let n = 0
  for (let i = 0; i < input.length; i++) {
    acc += input[i]
    cnt++
    phase += 1
    if (phase >= ratio) {
      phase -= ratio
      out[n++] = acc / cnt
      acc = 0
      cnt = 0
    }
  }
  return out.subarray(0, n)
}
