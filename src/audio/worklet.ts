import { AudioRenderer } from './render.ts'
import type { Song } from '../mml/ast.ts'
declare const sampleRate: number
declare class AudioWorkletProcessor {port:MessagePort;constructor(options?:unknown)}
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void
class MmlProcessor extends AudioWorkletProcessor {
  private renderer?:AudioRenderer
  constructor(options:{processorOptions:{song:Song}}) {super();this.renderer=new AudioRenderer(options.processorOptions.song,sampleRate);this.port.onmessage=()=>{this.renderer=undefined}}
  process(_inputs:Float32Array[][],outputs:Float32Array[][]) {
    if(!this.renderer) return false
    try {
      const active=this.renderer.render(outputs[0][0],outputs[0][1])
      if(!active) {this.port.postMessage({type:'ended'});this.renderer=undefined}
      return active
    } catch (error) {outputs[0].forEach(c=>c.fill(0));this.port.postMessage({type:'error',message:String(error)});this.renderer=undefined;return false}
  }
}
registerProcessor('mml-sound',MmlProcessor)
