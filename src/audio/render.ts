import type { Song } from '../mml/ast.ts'
import { Sequencer, type TimedEvent } from '../mml/sequencer.ts'
import { TrackVoice } from './voice.ts'
interface Track { sequencer:Sequencer; next?:TimedEvent; voice:TrackVoice; end:number }
// Called from the AudioWorklet render thread; no JS timers or unbounded event arrays.
export class AudioRenderer {
  private tracks:Track[];private frame=0;private sampleRate:number
  constructor(song:Song,sampleRate:number) {
    this.sampleRate=sampleRate
    this.tracks=Object.values(song.tracks).map(nodes=>{const sequencer=new Sequencer(nodes,song.macros);return {sequencer,next:sequencer.next(),voice:new TrackVoice(sampleRate,song.envelopes,song.lfos,song.fmTones,song.waveTones),end:0}})
  }
  forceStop() {this.tracks=[];this.frame=0}
  render(left:Float32Array,right:Float32Array) {
    left.fill(0);right.fill(0)
    for(let i=0;i<left.length;i++,this.frame++) {
      const time=this.frame/this.sampleRate
      for (const track of this.tracks) {
        if (track.next && time+1e-10>=track.next.time) {
          const event=track.next;track.end=event.time+event.duration
          if(event.pitch===null) track.voice.keyOff();else track.voice.start(event)
          track.next=track.sequencer.next()
        }
        if(!track.next && time>=track.end) track.voice.keyOff()
        const value=track.voice.sample(time)*0.075
        left[i]+=value*track.voice.left;right[i]+=value*track.voice.right
      }
    }
    return this.tracks.some(t=>t.next || this.frame/this.sampleRate<t.end || !t.voice.silent)
  }
}
