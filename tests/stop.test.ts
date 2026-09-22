import test from 'node:test'
import assert from 'node:assert/strict'
import { compile } from '../src/mml/compile.ts'
import { ScheduledRenderer } from '../src/audio/startup.ts'
import { SoundEngine } from '../src/audio/engine.ts'
const defs=`@e1 {31,0,0,1,0,0} @w0 {${Array(32).fill(127)}} @f0 {7,0,${Array.from({length:4},()=>[31,0,0,1,0,0,0,1,0,0]).flat()}}`
for(const source of ['@s0','@s10','@s105','@f0','@w0']) {
 test(`${source}: one/two/ten force stops clear voices, release, future events and cannot restart`,()=>{
  for(const repeats of [1,2,10]) for(const frames of [0,128,4000]) {
   const song=compile(`track0 {${defs}} track1 {${source} @e1 t120 q1 l32 [c r d]0}`)
   const old=new ScheduledRenderer(song,48000);old.start(0)
   const left=new Float32Array(frames),right=new Float32Array(frames)
   if(frames) old.render(left,right,0)
   const renderer=Reflect.get(old,'renderer')
   assert.equal(Reflect.get(renderer,'tracks').length,1)
   for(let i=0;i<repeats;i++) old.forceStop()
   assert.equal(Reflect.get(renderer,'tracks').length,0)
   assert.equal(Reflect.get(old,'startFrame'),undefined)
   assert.equal(Reflect.get(old,'stopped'),true)
   old.start(0) // queued start after stop must be ignored
   const a=new Float32Array(128).fill(1),b=new Float32Array(128).fill(-1)
   assert.equal(old.render(a,b,frames),false)
   assert.ok(a.every(x=>x===0));assert.ok(b.every(x=>x===0))
   const fresh=new ScheduledRenderer(song,48000),reference=new ScheduledRenderer(song,48000)
   fresh.start(0);reference.start(0)
   const expected=new Float32Array(128)
   fresh.render(a,b,0);reference.render(expected,new Float32Array(128),0)
   assert.deepEqual(a,expected)
  }
 })
}

test('rapid Main/Test replacements reuse the output device and wait for actual stop acknowledgement',async()=>{
 const originals={AudioContext:globalThis.AudioContext,AudioWorkletNode:globalThis.AudioWorkletNode}
 class Context {
  static all:Context[]=[];state='running';currentTime=1;destination={};closed=0
  audioWorklet={addModule:()=>Promise.resolve()}
  constructor(){Context.all.push(this)}
  resume(){return Promise.resolve()}
  close(){this.closed++;this.state='closed';return Promise.resolve()}
 }
 class Node {
  static all:Node[]=[];disconnected=0;closed=0;messages:unknown[]=[];onprocessorerror:unknown
  port={onmessage:null as null|((e:{data:{type:string}})=>void),postMessage:(m:unknown)=>{this.messages.push(m)},close:()=>{this.closed++}}
  constructor(){Node.all.push(this)}
  connect(){}disconnect(){this.disconnected++}
 }
 Object.assign(globalThis,{AudioContext:Context,AudioWorkletNode:Node})
 try {
  const main=`track0 {${defs}} track1 {@f0c}`,songs=[compile(main),compile(main,'@w0d')]
  let engine=new SoundEngine('worklet');await engine.play(songs[0],()=>{})
  for(const repeats of [1,2,10,1,2]) {
   const node=Node.all.at(-1)!,context=Context.all[0],before=Node.all.length
   const stale=node.port.onmessage!
   const completion=engine.stop()
   for(let i=1;i<repeats;i++) assert.equal(engine.stop(),completion)
   assert.equal(Reflect.get(engine,'node'),undefined);assert.equal(Reflect.get(engine,'context'),undefined)
   assert.equal(node.disconnected,1);assert.deepEqual(node.messages,['stop']);assert.equal(context.closed,0)
   assert.equal(node.closed,0)
   stale({data:{type:'ready'}});assert.deepEqual(node.messages,['stop'])
   const next=new SoundEngine('worklet'),playing=next.play(songs[before%2],()=>{})
   await new Promise<void>(resolve=>setImmediate(resolve))
   assert.equal(Context.all.length,1) // no device teardown/reopen, even before old Stop finishes
   assert.equal(Node.all.length,before) // old voice state must be discarded before replacement
   node.port.onmessage!({data:{type:'stopped'}});await completion;await playing
   assert.equal(node.closed,1);assert.equal(Node.all.length,before+1)
   assert.equal(context.closed,0)
   engine=next
  }
  // Page exit can complete even if a suspended/failed worklet cannot acknowledge Stop.
  const final=engine.stop();await SoundEngine.shutdown();await final
  assert.equal(Context.all[0].closed,1)
  assert.ok(Node.all.every(n=>n.closed===1 && n.disconnected===1))
 } finally {await SoundEngine.shutdown();Object.assign(globalThis,originals)}
})

test('processor failure releases Stop without an acknowledgement and page exit disposes pending setup',async()=>{
 const originals={AudioContext:globalThis.AudioContext,AudioWorkletNode:globalThis.AudioWorkletNode}
 let load!:()=>void
 class Context {
  static current:Context;state='running';destination={};currentTime=0;closed=0
  audioWorklet={addModule:()=>new Promise<void>(resolve=>{load=resolve})}
  constructor(){Context.current=this}
  resume(){return Promise.resolve()}
  close(){this.closed++;this.state='closed';return Promise.resolve()}
 }
 class Node {
  static current:Node;disconnected=0;closed=0
  onprocessorerror:(()=>void)|null=null
  port={onmessage:null as unknown,postMessage:()=>{},close:()=>{this.closed++}}
  constructor(){Node.current=this}
  connect(){}disconnect(){this.disconnected++}
 }
 Object.assign(globalThis,{AudioContext:Context,AudioWorkletNode:Node})
 try {
  const song=compile('track0 {} track1 {@s0c}')
  let errors=0
  const engine=new SoundEngine('one'),playing=engine.play(song,()=>{},()=>{errors++})
  load();await playing
  Node.current.onprocessorerror!();await engine.stop()
  assert.equal(errors,1);assert.equal(Node.current.disconnected,1);assert.equal(Node.current.closed,1)
  assert.equal(Context.current.closed,0)
  const pendingEngine=new SoundEngine('two'),pending=pendingEngine.play(song,()=>{})
  await SoundEngine.shutdown();load();await pending
  assert.equal(Context.current.closed,1)
  assert.equal(Reflect.get(pendingEngine,'node'),undefined)
 } finally {await SoundEngine.shutdown();Object.assign(globalThis,originals)}
})
