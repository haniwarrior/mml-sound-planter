import test from 'node:test'
import assert from 'node:assert/strict'
import { compile } from '../src/mml/compile.ts'
import { AudioRenderer } from '../src/audio/render.ts'
import { ScheduledRenderer, PRE_ROLL_SECONDS, STARTUP_RAMP_SECONDS } from '../src/audio/startup.ts'
import { SoundEngine } from '../src/audio/engine.ts'
const sr=48000
const defs=`@w0 {${Array(32).fill(127)}} @f0 {7,0,${Array.from({length:4},()=>[31,0,0,15,0,0,0,1,0,0]).flat()}}`
for(const source of ['@s0','@s10','@s105','@f0','@w0']) for(const length of [16,32]) {
 test(`${source} l${length}: setup delay/pre-roll never consume first-note samples`,()=>{
  const song=compile(`track0 {${defs}} track1 {${source} t120 l${length} p0 c} track2 {${source} t120 l${length} p8 e}`)
  const scheduled=new ScheduledRenderer(song,sr)
  const block=()=>[new Float32Array(128),new Float32Array(128)] as const
  for(let frame=0;frame<48000;frame+=128) {
   const [l,r]=block();assert.equal(scheduled.render(l,r,frame),true);assert.ok(l.every(x=>x===0));assert.ok(r.every(x=>x===0))
  }
  const origin=48000+Math.round(PRE_ROLL_SECONDS*sr)+37
  scheduled.start(origin/sr)
  const size=12000,left=new Float32Array(size),right=new Float32Array(size)
  for(let i=0;i<size;i+=128) scheduled.render(left.subarray(i,i+128),right.subarray(i,i+128),48000+i)
  const offset=Math.ceil(origin/sr*sr)-48000,rawL=new Float32Array(size-offset),rawR=new Float32Array(size-offset)
  new AudioRenderer(song,sr).render(rawL,rawR)
  assert.ok(left.slice(0,offset+1).every(x=>x===0))
  for(let i=0;i<rawL.length;i++) {
   const gain=Math.min(1,i/Math.round(sr*STARTUP_RAMP_SECONDS))
   assert.equal(left[offset+i],Math.fround(rawL[i]*gain))
   assert.equal(right[offset+i],Math.fround(rawR[i]*gain))
  }
  const noteFrames=sr*2/length
  assert.ok(left.slice(offset+96,offset+noteFrames).some(x=>x!==0))
  if(source!=='@f0') assert.ok(left.slice(offset+noteFrames).every(x=>x===0))
 })
}
test('late start shifts both note-on and note-off; duplicate start cannot restart playback',()=>{
 const song=compile(`track0 {${defs}} track1 {@w0 t120 l32 p0 c}`)
 const renderer=new ScheduledRenderer(song,sr);renderer.start(0)
 const l=new Float32Array(4000),r=new Float32Array(4000)
 renderer.render(l,r,48000)
 assert.equal(l[0],0);assert.ok(l[2999]>0);assert.equal(l[3000],0)
 renderer.start(10);assert.equal(renderer.render(l,r,52000),false);assert.ok(l.every(x=>x===0))
})
test('startup ramp is exactly 2ms and does not retrigger on a subsequent key-on',()=>{
 const song=compile(`track0 {${defs}} track1 {@w0 t120 l32 p0 c c}`)
 const renderer=new ScheduledRenderer(song,sr);renderer.start(0)
 const l=new Float32Array(6000);renderer.render(l,new Float32Array(6000),0)
 assert.equal(l[0],0);assert.ok(l[1]>0);assert.ok(l[95]<l[96]);assert.equal(l[96],l[97])
 assert.equal(l[3000],l[96])
})

test('engine waits for first resume/module, reuses context and schedules from fresh ready time',async()=>{
 const original={AudioContext:globalThis.AudioContext,AudioWorkletNode:globalThis.AudioWorkletNode}
 let resume!:()=>void,load!:()=>void
 class Context {
  static all:Context[]=[]
  state='suspended';currentTime=1;destination={};closed=0;resumes=0;loads=0
  audioWorklet={addModule:()=>{this.loads++;return new Promise<void>(r=>{load=r})}}
  constructor(){Context.all.push(this)}
  resume(){this.resumes++;return new Promise<void>(r=>{resume=()=>{this.state='running';this.currentTime=10;r()}})}
  close(){this.closed++;this.state='closed';return Promise.resolve()}
 }
 class Node {
  static all:Node[]=[];connected=false;disconnected=0;closed=0;messages:unknown[]=[]
  port={onmessage:null as null|((e:{data:{type:string}})=>void),postMessage:(m:unknown)=>{this.messages.push(m);if(m==='stop') this.port.onmessage?.({data:{type:'stopped'}})},close:()=>{this.closed++}}
  onprocessorerror:unknown
  constructor(){Node.all.push(this)}
  connect(){this.connected=true}disconnect(){this.disconnected++;this.connected=false}
 }
 Object.assign(globalThis,{AudioContext:Context,AudioWorkletNode:Node})
 try {
  const main='track0 {} track1 {@s0c}',songs=[compile(main),compile(main,'@s10c')]
  let done=0
  for(let i=0;i<6;i++) {
   const engine=new SoundEngine('test'),pending=engine.play(songs[i%2],()=>{done++})
   if(i===0) {load();await Promise.resolve();assert.equal(Node.all.length,0);resume()}
   await pending
   const node=Node.all.at(-1)!,context=Context.all[0]
   assert.equal(node.connected,true);assert.equal(node.messages.length,0)
   context.currentTime=20+i
   node.port.onmessage!({data:{type:'ready'}})
   assert.deepEqual(node.messages,[{type:'start',startTime:20+i+.05}])
   node.port.onmessage!({data:{type:'ready'}});assert.equal(node.messages.length,1)
   const stale=node.port.onmessage
   await engine.stop();stale({data:{type:'ended'}});assert.equal(done,0)
   assert.equal(node.disconnected,1);assert.equal(node.closed,1);assert.equal(node.onprocessorerror,null)
   assert.equal(context.closed,0)
  }
  assert.equal(Context.all.length,1);assert.equal(Context.all[0].loads,1);assert.equal(Context.all[0].resumes,1)
  // An external suspension still resumes from the Play gesture, but Stop never suspends.
  Context.all[0].state='suspended'
  const cancelled=new SoundEngine('test'),pending=cancelled.play(songs[0],()=>{done++})
  await cancelled.stop();resume();await pending
  assert.equal(Node.all.length,6);assert.equal(Context.all[0].resumes,2)
  await SoundEngine.shutdown();assert.equal(Context.all[0].closed,1)
 } finally {await SoundEngine.shutdown();Object.assign(globalThis,original)}
})
