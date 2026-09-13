import type { Envelope } from '../mml/ast.ts'
import { attenuationIncrement, effectiveRate, EG_TICK_HZ, sustainAttenuation } from './opm-rates.ts'
export class EnvelopeGenerator {
  attenuation=1023; stage: 'attack'|'decay'|'sustain'|'release'='release'
  private definition: Envelope; private pitch: number; private tick=0
  constructor(definition: Envelope, pitch: number, time=0) {this.definition=definition;this.pitch=pitch;this.tick=Math.floor(time*EG_TICK_HZ)}
  configure(definition: Envelope, pitch: number) {this.definition=definition;this.pitch=pitch}
  keyOn() {this.stage='attack';if (this.rate()>=62) this.attenuation=0}
  keyOff() {this.stage='release'}
  private rate() {
    const [ar,dr,sr,rr,,ks]=this.definition
    return effectiveRate(this.stage==='attack' ? ar*2 : this.stage==='decay' ? dr*2 : this.stage==='sustain' ? sr*2 : rr*4+2,ks,this.pitch)
  }
  sample(time: number) {
    const target=Math.floor(time*EG_TICK_HZ)
    while (this.tick<target) {
      this.tick++
      if (this.stage==='attack' && this.attenuation===0) this.stage='decay'
      if (this.stage==='decay' && this.attenuation>=sustainAttenuation(this.definition[4])) this.stage='sustain'
      const rate=this.rate(), inc=attenuationIncrement(rate,this.tick)
      if (this.stage==='attack') {if(rate<62) this.attenuation+=((~this.attenuation)*inc)>>4}
      else this.attenuation=Math.min(1023,this.attenuation+inc)
    }
    return this.attenuation>=1023 ? 0 : 2**(-this.attenuation/64)
  }
  get silent() {return this.stage==='release' && this.attenuation>=1023}
}
