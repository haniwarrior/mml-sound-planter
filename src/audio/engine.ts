import type { Song } from '../mml/ast.ts'
export class SoundEngine {
  private moduleUrl:string
  constructor(moduleUrl:string) {this.moduleUrl=moduleUrl}
  private context?:AudioContext;private node?:AudioWorkletNode;private stopped=false
  async play(song:Song,done:()=>void,onError:(message:string)=>void=()=>{}) {
    if(this.stopped) return
    const context=new AudioContext({latencyHint:'interactive'});this.context=context
    if(!context.audioWorklet) {this.stop();throw new Error('AudioWorklet対応ブラウザとHTTPSまたはlocalhostが必要です')}
    try {
      // resume starts inside the user gesture, before loading the worklet module.
      await Promise.all([context.resume(),context.audioWorklet.addModule(this.moduleUrl)])
      if(this.stopped) return
      const node=new AudioWorkletNode(context,'mml-sound',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{song}})
      this.node=node
      node.port.onmessage=({data})=>{if(data.type==='ended') {this.stop();done()} else if(data.type==='error') {this.stop();onError(data.message)}}
      node.onprocessorerror=()=>{this.stop();onError('音声処理でエラーが発生しました')}
      node.connect(context.destination)
    } catch(error) {if(!this.stopped) {this.stop();throw error}}
  }
  stop() {
    this.stopped=true
    if(this.node) {this.node.disconnect();this.node.port.postMessage('stop');this.node.port.onmessage=null;this.node.port.close();this.node=undefined}
    if(this.context) {void this.context.close().catch(()=>{});this.context=undefined}
  }
}
