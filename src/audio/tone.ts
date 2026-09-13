function polyBlep(phase: number, step: number) {
  if (phase<step) {const t=phase/step;return t+t-t*t-1}
  if (phase>1-step) {const t=(phase-1)/step;return t*t+t+t+1}
  return 0
}
export class ToneGenerator {
  private phase=0
  reset() {this.phase=0}
  sample(frequency: number, sampleRate: number) {
    const step=Math.min(0.49,frequency/sampleRate)
    const value=(this.phase<0.5 ? 1 : -1)+polyBlep(this.phase,step)-polyBlep((this.phase+0.5)%1,step)
    this.phase=(this.phase+step)%1;return value
  }
}
