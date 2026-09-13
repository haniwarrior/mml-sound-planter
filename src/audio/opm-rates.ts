// Rate/KS and increment table adapted from Aaron Giles' ymfm (BSD-3-Clause).
// Sources and full license: THIRD_PARTY_NOTICES.md. No FM synthesis is included.
export const OPM_CLOCK_HZ = 3_579_545
export const EG_TICK_HZ = OPM_CLOCK_HZ / 64 / 3
export const DETUNE_CENTS_PER_UNIT = 1
export const INCREMENTS = [
  0,0,0x10101010,0x10101010,
  0x10101010,0x10101010,0x11101110,0x11101110,
  ...Array.from({length:10},()=>[0x10101010,0x10111010,0x11101110,0x11111110]).flat(),
  0x11111111,0x21112111,0x21212121,0x22212221,
  0x22222222,0x42224222,0x42424242,0x44424442,
  0x44444444,0x84448444,0x84848484,0x88848884,
  0x88888888,0x88888888,0x88888888,0x88888888,
]
// OPM KC codes run C#..C; gaps at 3,7,11,15. Clamp extended MML range.
export function keyCode(midi: number) {
  const note=Math.max(0,Math.min(95,Math.floor(midi)-13))
  const code=[0,1,2,4,5,6,8,9,10,12,13,14][note%12]
  return (Math.floor(note/12)<<2) | (code>>2)
}
export function effectiveRate(base: number, ks: number, midi: number) {
  return base === 0 ? 0 : Math.min(63,base+(keyCode(midi)>>(ks^3)))
}
export function attenuationIncrement(rate: number, counter: number) {
  const shift=rate>>2
  const scaled=counter*2**shift
  if (scaled%2048 !== 0) return 0
  const index=Math.floor(scaled/2**Math.max(11,shift))%8
  return (INCREMENTS[rate]>>>(index*4))&15
}
export const sustainAttenuation = (level: number) => (level===15 ? 31 : level)*32
