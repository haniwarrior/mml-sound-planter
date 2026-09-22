import type { Song } from '../mml/ast.ts'
import { AudioRenderer } from './render.ts'
export const PRE_ROLL_SECONDS=0.05
export const STARTUP_RAMP_SECONDS=0.002

/** Wait without advancing musical time. A late start shifts the whole song, never seeks it. */
export class ScheduledRenderer {
  private renderer:AudioRenderer
  private startFrame?:number
  private played=0
  private started=false
  private stopped=false
  private sampleRate:number
  constructor(song:Song,sampleRate:number) {this.sampleRate=sampleRate;this.renderer=new AudioRenderer(song,sampleRate)}
  start(time:number) {
    if(!this.stopped && this.startFrame===undefined && Number.isFinite(time)) this.startFrame=Math.ceil(time*this.sampleRate)
  }
  forceStop() {this.stopped=true;this.renderer.forceStop();this.startFrame=undefined;this.played=0;this.started=false}
  render(left:Float32Array,right:Float32Array,currentFrame:number) {
    left.fill(0);right.fill(0)
    if(this.stopped) return false
    if(this.startFrame===undefined) return true
    const offset=this.started ? 0 : Math.max(0,this.startFrame-currentFrame)
    if(offset>=left.length) return true
    this.started=true
    const active=this.renderer.render(left.subarray(offset),right.subarray(offset))
    const rampFrames=Math.max(1,Math.round(this.sampleRate*STARTUP_RAMP_SECONDS))
    for(let i=offset;i<left.length;i++,this.played++) {
      const gain=Math.min(1,this.played/rampFrames)
      left[i]*=gain;right[i]*=gain
    }
    return active
  }
}
