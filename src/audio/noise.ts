// AY/SSG-style 17-bit maximal-length LFSR, polynomial x^17+x^14+1.
// One shift at clock/(16*period); independent of musical pitch and detune.
export const SSG_CLOCK_HZ=2_000_000
export class NoiseGenerator {
  private register=0x1ffff; private phase=0
  sample(period: number, sampleRate: number) {
    this.phase+=SSG_CLOCK_HZ/(16*period*sampleRate)
    while (this.phase>=1) {
      const feedback=(this.register^(this.register>>>3))&1
      this.register=(this.register>>>1)|(feedback<<16);this.phase--
    }
    return (this.register&1) ? 1 : -1
  }
}
