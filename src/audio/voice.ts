import type { Envelope, Lfos, FmTone, WaveTone } from '../mml/ast.ts'
import type { TimedEvent } from '../mml/sequencer.ts'
import { WaveGenerator } from './wave.ts'
import { FmGenerator } from './fm.ts'
import { EnvelopeGenerator } from './envelope.ts'
import { NoiseGenerator } from './noise.ts'
import { ToneGenerator } from './tone.ts'
import { DETUNE_CENTS_PER_UNIT } from './opm-rates.ts'
import { vibratoOffset, tremoloGain, modulatedGain } from './modulation.ts'
const BYPASS: Envelope=[31,0,0,15,0,0]
export interface Voice { start(event: TimedEvent): void; keyOff(): void; sample(time:number):number; readonly silent:boolean }
export class TrackVoice implements Voice {
  private wave=new WaveGenerator();private waveTones:Record<number,WaveTone>
  private fm:FmGenerator;private fmTones:Record<number,FmTone>
  private tone=new ToneGenerator();private noise=new NoiseGenerator();private eg:EnvelopeGenerator
  private event?:TimedEvent;private held=false;private definition:Envelope=BYPASS
  private lfos:Lfos;private vibratoStart=0;private tremoloStart=0
  left= Math.SQRT1_2;right=Math.SQRT1_2
  constructor(privateSampleRate: number, envelopes: Record<number,Envelope>, lfos:Lfos = {'@lv':{},'@lt':{}}, fmTones:Record<number,FmTone> = {}, waveTones:Record<number,WaveTone> = {}) {this.waveTones=waveTones;this.fm=new FmGenerator(privateSampleRate);this.fmTones=fmTones;this.lfos=lfos;this.sampleRate=privateSampleRate;this.envelopes=envelopes;this.eg=new EnvelopeGenerator(BYPASS,60)}
  private sampleRate:number;private envelopes:Record<number,Envelope>
  start(event:TimedEvent) {
    if (!event.connected || event.state.vibrato !== this.event?.state.vibrato) this.vibratoStart=event.time
    if (!event.connected || event.state.tremolo !== this.event?.state.tremolo) this.tremoloStart=event.time
    const sameSource=this.event?.state.synth===event.state.synth
    if(event.state.synth==='fm') {
      const tone=this.fmTones[event.state.fmTone]
      if(!tone) throw new Error(`undefined FM tone: @f${event.state.fmTone}`)
      this.fm.start(tone,event.pitch!,event.time,event.connected && sameSource)
    } else if(event.state.synth==='wave') {
      const tone=this.waveTones[event.state.waveTone]
      if(!tone) throw new Error(`undefined wave tone: @w${event.state.waveTone}`)
      this.wave.start(tone,event.connected && sameSource)
      this.fm.keyOff()
    } else if(!sameSource) {this.fm.keyOff();this.tone.reset()}
    this.event=event;this.definition=this.envelopes[event.state.envelope] ?? BYPASS
    this.eg.configure(this.definition,(event.state.synth!=='ssg' || event.state.mode===0 || event.state.mode>=101) ? event.pitch! : 60)
    if (!event.connected) {this.tone.reset();this.eg.keyOn()}
    this.held=true
    const angle=event.state.pan/8*Math.PI/2;this.left=Math.cos(angle);this.right=Math.sin(angle)
  }
  keyOff() {if(this.held) {this.held=false;this.eg.keyOff();this.fm.keyOff()}}
  sample(time:number) {
    const e=this.event
    if (!e) {this.eg.sample(time);return 0}
    if (!e.continues && time>=e.time+e.gate) this.keyOff()
    const fraction=Math.max(0,Math.min(1,(time-e.time)/e.duration))
    const pitch=e.pitch!+(e.endPitch!-e.pitch!)*fraction
    // Pitch continues evolving through release, including portamento with q<8.
    this.eg.configure(this.definition,(e.state.synth!=='ssg' || e.state.mode===0 || e.state.mode>=101) ? pitch : 60)
    const level=this.eg.sample(time)
    const envelope=e.state.envelope===0 ? (e.state.synth==='fm' ? 1 : Number(this.held)) : level
    const toneEnabled=e.state.mode===0 || e.state.mode>=101
    const finalPitch=pitch+e.state.detune*DETUNE_CENTS_PER_UNIT/100+vibratoOffset(this.lfos['@lv'][e.state.vibrato],time-this.vibratoStart)
    if(e.state.synth==='fm') return this.fm.sample(time,finalPitch)*modulatedGain(e.state.volume,envelope,tremoloGain(this.lfos['@lt'][e.state.tremolo],time-this.tremoloStart))
    if(e.state.synth==='wave') return this.wave.sample(440*2**((finalPitch-69)/12),this.sampleRate)*modulatedGain(e.state.volume,envelope,tremoloGain(this.lfos['@lt'][e.state.tremolo],time-this.tremoloStart))
    const tone=toneEnabled ? this.tone.sample(440*2**((finalPitch-69)/12),this.sampleRate) : 1
    const noise=e.state.mode===0 ? 1 : this.noise.sample(e.state.mode>=101 ? e.state.mode-100 : e.state.mode,this.sampleRate)
    // AY mixer: (tone OR toneDisabled) AND (noise OR noiseDisabled).
    // Keep PolyBLEP on the tone edge; noise-low gates the output low.
    const value=e.state.mode===0 ? tone : toneEnabled ? (noise>0 ? tone : -1) : noise
    return value*modulatedGain(e.state.volume,envelope,tremoloGain(this.lfos['@lt'][e.state.tremolo],time-this.tremoloStart))
  }
  get silent() {return !this.held && (!this.event || (this.event.state.synth==='fm' ? this.fm.silent || (this.event.state.envelope!==0 && this.eg.silent) : this.event.state.envelope===0 || this.eg.silent))}
}

// Retain the existing import name for SSG-only consumers.
export { TrackVoice as SsgVoice }
