import type { WaveTone } from '../mml/ast.ts'

/** A stepped 32-sample oscillator; the table is latched only at key-on. */
export class WaveGenerator {
  private phase=0
  private table:WaveTone=Array(32).fill(0)
  start(table:WaveTone,connected=false) {
    if(connected) return
    this.table=table;this.phase=0
  }
  sample(frequency:number,sampleRate:number) {
    const value=this.table[Math.floor(this.phase*32)]/128
    this.phase=(this.phase+frequency/sampleRate)%1
    return value
  }
}
