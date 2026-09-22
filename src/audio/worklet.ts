import { ScheduledRenderer } from './startup.ts'
import type { Song } from '../mml/ast.ts'
declare const sampleRate: number
declare const currentFrame: number
declare class AudioWorkletProcessor {port:MessagePort;constructor(options?:unknown)}
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void
class MmlProcessor extends AudioWorkletProcessor {
  private renderer?:ScheduledRenderer
  constructor(options:{processorOptions:{song:Song}}) {
    super();this.renderer=new ScheduledRenderer(options.processorOptions.song,sampleRate)
    this.port.onmessage=({data})=>{
      if(data==='stop') {this.renderer?.forceStop();this.renderer=undefined;this.port.postMessage({type:'stopped'})}
      else if(data?.type==='start') this.renderer?.start(data.startTime)
    }
    this.port.postMessage({type:'ready'})
  }
  process(_inputs:Float32Array[][],outputs:Float32Array[][]) {
    if(!this.renderer) {outputs.forEach(output=>output.forEach(channel=>channel.fill(0)));return false}
    try {
      const active=this.renderer.render(outputs[0][0],outputs[0][1],currentFrame)
      if(!active) {this.port.postMessage({type:'ended'});this.renderer=undefined}
      return active
    } catch (error) {outputs[0].forEach(c=>c.fill(0));this.port.postMessage({type:'error',message:String(error)});this.renderer=undefined;return false}
  }
}
registerProcessor('mml-sound',MmlProcessor)
