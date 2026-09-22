import { PRE_ROLL_SECONDS } from './startup.ts'
import type { Song } from '../mml/ast.ts'
interface AudioSession {
  context:AudioContext
  modules:Map<string,Promise<void>>
}
export class SoundEngine {
  // Keep the output device running between songs. Stop disposes song state, not the device.
  private static shared?:AudioSession
  private static engines=new Set<SoundEngine>()
  private static cleanup:Promise<void>=Promise.resolve()
  private static shutdownPending?:Promise<void>
  private closing?:Promise<void>
  private finishStop?:()=>void
  private moduleUrl:string
  constructor(moduleUrl:string) {this.moduleUrl=moduleUrl}
  private context?:AudioContext;private node?:AudioWorkletNode;private stopped=false
  async play(song:Song,done:()=>void,onError:(message:string)=>void=()=>{}) {
    if(this.stopped || this.context) return
    if(!SoundEngine.shared || SoundEngine.shared.context.state==='closed') {
      SoundEngine.shared={context:new AudioContext({latencyHint:'interactive'}),modules:new Map()}
    }
    const shared=SoundEngine.shared,context=shared.context
    this.context=context;SoundEngine.engines.add(this)
    if(!context.audioWorklet) {void this.stop();throw new Error('AudioWorklet対応ブラウザとHTTPSまたはlocalhostが必要です')}
    try {
      // Only resume if externally suspended/interrupted; ordinary Stop never suspends the device.
      const resumed=context.state==='running' ? Promise.resolve() : context.resume()
      let loaded=shared.modules.get(this.moduleUrl)
      if(!loaded) {
        loaded=context.audioWorklet.addModule(this.moduleUrl)
        shared.modules.set(this.moduleUrl,loaded)
        void loaded.catch(()=>{if(shared.modules.get(this.moduleUrl)===loaded) shared.modules.delete(this.moduleUrl)})
      }
      await Promise.all([resumed,loaded,SoundEngine.cleanup])
      if(this.stopped) return
      if(context.state!=='running') throw new Error('AudioContextを開始できませんでした。再生を再試行してください')
      const node=new AudioWorkletNode(context,'mml-sound',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{song}})
      this.node=node
      let armed=false
      node.port.onmessage=({data})=>{
        if(this.stopped) return
        if(data.type==='ready') {
          if(armed) return
          if(context.state!=='running') {void this.stop();onError('AudioContextが中断されました。再生を再試行してください');return}
          armed=true
          node.port.postMessage({type:'start',startTime:context.currentTime+PRE_ROLL_SECONDS})
        } else if(data.type==='ended') {void this.stop();done()}
        else if(data.type==='error') {void this.stop();onError(data.message)}
      }
      node.onprocessorerror=()=>{
        if(this.stopped) {this.finishStop?.();return}
        // A crashed processor cannot acknowledge Stop; disconnect and release it directly.
        void this.stop();this.finishStop?.();onError('音声処理でエラーが発生しました')
      }
      node.connect(context.destination)
    } catch(error) {if(!this.stopped) {void this.stop();throw error}}
  }
  stop():Promise<void> {
    if(this.closing) return this.closing
    this.stopped=true
    const node=this.node
    this.node=undefined;this.context=undefined
    this.closing=new Promise<void>(resolve=>{
      this.finishStop=()=>{
        if(!this.finishStop) return
        this.finishStop=undefined
        if(node) {node.onprocessorerror=null;node.port.onmessage=null;node.port.close()}
        SoundEngine.engines.delete(this);resolve()
      }
    })
    SoundEngine.cleanup=Promise.all([SoundEngine.cleanup,this.closing]).then(()=>{})
    if(node) {
      node.disconnect()
      node.port.onmessage=({data})=>{if(data.type==='stopped') this.finishStop?.()}
      node.port.postMessage('stop')
    } else this.finishStop?.()
    return this.closing
  }
  /** Release the shared output device only on page exit, not on normal Stop/Play. */
  static shutdown():Promise<void> {
    if(this.shutdownPending) return this.shutdownPending
    const shared=this.shared
    this.shared=undefined
    const engines=[...this.engines]
    engines.forEach(engine=>{void engine.stop()})
    const closed=shared ? shared.context.close() : Promise.resolve()
    this.shutdownPending=closed.finally(()=>{
      engines.forEach(engine=>engine.finishStop?.())
      this.shutdownPending=undefined
    })
    return this.shutdownPending
  }
}
