import type { Envelope } from '../mml/ast.ts'
import type { TimedEvent } from '../mml/sequencer.ts'
import { EnvelopeGenerator } from './envelope.ts'
import { NoiseGenerator } from './noise.ts'
import { ToneGenerator } from './tone.ts'
import { DETUNE_CENTS_PER_UNIT } from './opm-rates.ts'
const BYPASS: Envelope=[31,0,0,15,0,0]
export interface Voice { start(event: TimedEvent): void; keyOff(): void; sample(time:number):number; readonly silent:boolean }
export class SsgVoice implements Voice {
  private tone=new ToneGenerator();private noise=new NoiseGenerator();private eg:EnvelopeGenerator
  private event?:TimedEvent;private held=false;private definition:Envelope=BYPASS
  left= Math.SQRT1_2;right=Math.SQRT1_2
  constructor(privateSampleRate: number, envelopes: Record<number,Envelope>) {this.sampleRate=privateSampleRate;this.envelopes=envelopes;this.eg=new EnvelopeGenerator(BYPASS,60)}
  private sampleRate:number;private envelopes:Record<number,Envelope>
  start(event:TimedEvent) {
    this.event=event;this.definition=this.envelopes[event.state.envelope] ?? BYPASS
    this.eg.configure(this.definition,event.state.mode===0 ? event.pitch! : 60)
    if (!event.connected) {this.tone.reset();this.eg.keyOn()}
    this.held=true
    const angle=event.state.pan/8*Math.PI/2;this.left=Math.cos(angle);this.right=Math.sin(angle)
  }
  keyOff() {if(this.held) {this.held=false;this.eg.keyOff()}}
  sample(time:number) {
    const e=this.event
    if (!e) {this.eg.sample(time);return 0}
    if (!e.continues && time>=e.time+e.gate) this.keyOff()
    const fraction=Math.max(0,Math.min(1,(time-e.time)/e.duration))
    const pitch=e.pitch!+(e.endPitch!-e.pitch!)*fraction
    // Pitch continues evolving through release, including portamento with q<8.
    this.eg.configure(this.definition,e.state.mode===0 ? pitch : 60)
    const level=this.eg.sample(time)
    const envelope=e.state.envelope===0 ? Number(this.held) : level
    const value=e.state.mode===0 ? this.tone.sample(440*2**((pitch-69+e.state.detune*DETUNE_CENTS_PER_UNIT/100)/12),this.sampleRate) : this.noise.sample(e.state.mode,this.sampleRate)
    return value*envelope*e.state.volume/127
  }
  get silent() {return !this.held && (!this.event || this.event.state.envelope===0 || this.eg.silent)}
}
