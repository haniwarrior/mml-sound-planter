import type { Lfo } from '../mml/ast.ts'

// Pure modulation functions, independent of oscillator type and envelope.
// Hold reaches its target in one Period using a quarter sine, then stays there.
export function lfoValue(definition: Lfo | undefined, elapsed: number): number {
  if (!definition || elapsed < definition.delay * 0.1) return 0
  const phase = Math.max(0, (elapsed - definition.delay * 0.1) / (definition.period * 0.1))
  const wave = definition.mode === 1 ? Math.sin(Math.min(1,phase)*Math.PI/2) : Math.sin(phase*2*Math.PI)
  return wave * definition.depth / 127
}
export function vibratoOffset(definition: Lfo | undefined, elapsed: number): number {
  return 12 * lfoValue(definition, elapsed)
}
export function tremoloGain(definition: Lfo | undefined, elapsed: number): number {
  // Unity at delay/start; positive motion rises towards a bounded 2× gain.
  return Math.max(0, Math.min(2, 1 + lfoValue(definition, elapsed)))
}
export function modulatedGain(volume: number, envelope: number, tremolo: number): number {
  return Math.max(0, Math.min(1, volume / 127 * envelope * tremolo))
}
