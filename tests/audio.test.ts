import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compile } from '../src/mml/compile.ts'
import { AudioRenderer } from '../src/audio/render.ts'
import { NoiseGenerator } from '../src/audio/noise.ts'
import { EnvelopeGenerator } from '../src/audio/envelope.ts'
import { INCREMENTS, EG_TICK_HZ, keyCode, effectiveRate, sustainAttenuation, attenuationIncrement } from '../src/audio/opm-rates.ts'
import { SoundEngine } from '../src/audio/engine.ts'
const sr=48000
const renderer=(mml:string,defs='')=>new AudioRenderer(compile(`track0 {${defs}} track1 {${mml}}`),sr)
const render=(r:AudioRenderer,frames:number)=>{const l=new Float32Array(frames),rr=new Float32Array(frames);const active=r.render(l,rr);return {l,r:rr,active}}
const power=(a:Float32Array)=>a.reduce((sum,n)=>sum+n*n,0)
test('OPM table, KS, sustain encoding and reference increments',()=>{
 assert.equal(INCREMENTS.length,64);assert.equal(sustainAttenuation(14),448);assert.equal(sustainAttenuation(15),992)
 assert.equal(keyCode(61),16);assert.equal(keyCode(60),15);assert.equal(keyCode(108),31)
 assert.equal(effectiveRate(0,3,96),0);assert.equal(effectiveRate(24,3,61),40);assert.equal(effectiveRate(62,3,100),63)
 assert.equal(attenuationIncrement(48,1),1);assert.equal(attenuationIncrement(60,1),8)
})
test('AR0 holds silence, AR31 attacks immediately and SR0 holds sustain',()=>{
 const stopped=new EnvelopeGenerator([0,0,0,0,0,0],60);stopped.keyOn();assert.equal(stopped.sample(10),0)
 const eg=new EnvelopeGenerator([31,0,0,15,0,0],60);eg.keyOn();assert.equal(eg.sample(0),1);assert.equal(eg.sample(1),1);assert.equal(eg.stage,'sustain')
 eg.keyOff();assert.equal(eg.sample(1.1),0);assert.equal(eg.silent,true)
})
test('attack reference trajectory and KS speed up envelope',()=>{
 const eg=new EnvelopeGenerator([24,0,0,15,0,0],13);eg.keyOn();eg.sample(1.01/EG_TICK_HZ);assert.equal(eg.attenuation,959)
 const slow=new EnvelopeGenerator([15,0,0,15,0,0],85),fast=new EnvelopeGenerator([15,0,0,15,0,3],85)
 slow.keyOn();fast.keyOn();slow.sample(.02);fast.sample(.02);assert.ok(fast.attenuation<slow.attenuation)
})
test('LFSR is deterministic binary pseudo-noise and period changes granularity',()=>{
 const a=new NoiseGenerator(),b=new NoiseGenerator(),slow=new NoiseGenerator()
 let previous=0,changes=0,slowPrevious=0,slowChanges=0
 for(let i=0;i<10000;i++){const x=a.sample(1,sr),y=slow.sample(31,sr);assert.equal(x,b.sample(1,sr));assert.ok(x===1||x===-1);if(x!==previous)changes++;if(y!==slowPrevious)slowChanges++;previous=x;slowPrevious=y}
 assert.ok(changes>slowChanges*3)
})
test('noise ignores note, portamento pitch and detune, including KS',()=>{
 const defs='@e1 {20,8,3,9,8,3}'
 const a=render(renderer('@s10 @e1 o1 @d-15 c',defs),12000)
 const b=render(renderer('@s10 @e1 o8 @d15 (cg)',defs),12000)
 assert.deepEqual(a.l,b.l)
})
test('tone emits stereo audio, pan endpoints, volume zero and q keyoff',()=>{
 const left=render(renderer('@s0 t120 p0 q4 c'),sr)
 assert.ok(power(left.l)>1);assert.ok(power(left.r)<1e-20);assert.equal(power(left.l.slice(sr/4)),0);assert.equal(left.active,false)
 const right=render(renderer('@s0 p8 c'),1000);assert.ok(power(right.l)<1e-20);assert.ok(power(right.r)>0)
 const zero=render(renderer('@s0 v0 c'),sr);assert.equal(power(zero.l),0)
})
test('tie suppresses gate, rest and track end release correctly',()=>{
 const a=render(renderer('@s0 t120 q1 c&d'),sr)
 assert.ok(power(a.l.slice(sr/8,sr/2))>1);assert.equal(power(a.l.slice(sr*9/16)),0);assert.equal(a.active,false)
 const rest=render(renderer('@s0 t120 q1 c&r4 d4'),sr)
 assert.ok(power(rest.l.slice(sr/4,sr/2))>1);assert.equal(power(rest.l.slice(sr/2)),0)
 const end=render(renderer('@s0 t120 q1 c&'),sr);assert.equal(power(end.l.slice(sr/2)),0)
})
test('envelope release runs after gate and completes naturally',()=>{
 const r=renderer('@s0 @e1 t120 q4 c','@e1 {31,0,0,12,0,0}')
 const a=render(r,Math.floor(sr*.3));assert.ok(power(a.l.slice(sr/4))>0)
 const b=render(r,sr);assert.equal(b.active,false);assert.equal(power(b.l.slice(sr/2)),0)
})
test('render blocks do not alter common clock or oscillator/envelope phase',()=>{
 const text='@s0 @e1 t255 l128 [c&d (eg)&(ge) r]0',defs='@e1 {24,10,3,10,7,2}'
 const a=render(renderer(text,defs),32768)
 const split=renderer(text,defs),l=new Float32Array(32768),r=new Float32Array(32768)
 for(let i=0;i<32768;i+=128) {const b=render(split,128);l.set(b.l,i);r.set(b.r,i);assert.equal(b.active,true)}
 assert.deepEqual(a.l,l);assert.deepEqual(a.r,r)
})
class FakeContext {
 static instances:FakeContext[]=[];static load:Promise<void>=Promise.resolve()
 audioWorklet={addModule:()=>FakeContext.load};destination={};closed=0;resumed=0
 constructor(){FakeContext.instances.push(this)}
 resume(){this.resumed++;return Promise.resolve()}
 close(){this.closed++;return Promise.resolve()}
}
class FakeNode {
 static instances:FakeNode[]=[];disconnected=0;connected=0
 port={onmessage:null as null|((event:{data:{type:string}})=>void),postMessage:(_data:unknown)=>{},close:()=>{}}
 onprocessorerror:unknown
 constructor(){FakeNode.instances.push(this)}
 connect(){this.connected++}disconnect(){this.disconnected++}
}
test('engine stop cancels pending worklet loading and releases every context/node',async()=>{
 const originals={context:globalThis.AudioContext,node:globalThis.AudioWorkletNode}
 Object.assign(globalThis,{AudioContext:FakeContext,AudioWorkletNode:FakeNode})
 try {
   let release!:()=>void;FakeContext.load=new Promise<void>(resolve=>{release=resolve})
   const cancelled=new SoundEngine('test');const pending=cancelled.play(compile('track0 {}'),()=>{});cancelled.stop();release();await pending
   assert.equal(FakeNode.instances.length,0);assert.equal(FakeContext.instances[0].closed,1)
   FakeContext.load=Promise.resolve()
   for(let i=0;i<20;i++){const e=new SoundEngine('test');await e.play(compile('track0 {}'),()=>{});e.stop();e.stop()}
   assert.ok(FakeContext.instances.every(c=>c.closed===1));assert.ok(FakeNode.instances.every(n=>n.disconnected===1))
   let done=false;const e=new SoundEngine('test');await e.play(compile('track0 {}'),()=>{done=true});FakeNode.instances.at(-1)!.port.onmessage!({data:{type:'ended'}});assert.equal(done,true)
 } finally {Object.assign(globalThis,{AudioContext:originals.context,AudioWorkletNode:originals.node})}
})
