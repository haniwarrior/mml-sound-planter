import { readFile, readdir } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import assert from 'node:assert/strict'
import { compile } from '../src/mml/compile.ts'
const assets=await readdir('dist/client/assets')
const code=await readFile(`dist/client/assets/${assets.find(n=>n.startsWith('worklet-') && n.endsWith('.js'))}`,'utf8')
let Processor
class Base {messages=[];port={onmessage:null,postMessage:data=>{this.messages.push(data)}}}
const scope={AudioWorkletProcessor:Base,sampleRate:48000,currentFrame:0,registerProcessor:(_name,type)=>{Processor=type}}
runInNewContext(code,scope)
const processor=new Processor({processorOptions:{song:compile('track0 {@lv1 {8,5,0,0} @lt1 {-20,8,0,1} $phrase$ {(ce)4.&d}} track1 {@s105 @lv1 @lt1 $phrase$}')}})
processor.port.onmessage({data:{type:'start',startTime:0}})
const output=[[new Float32Array(128),new Float32Array(128)]]
assert.equal(processor.process([],output),true)
assert.ok(output[0][0].some(n=>n!==0))
processor.port.onmessage({data:'stop'})
assert.equal(processor.process([],output),false)
console.log('Built AudioWorklet: registers, renders audio, stops successfully.')

const fmValues=[7,3,...Array.from({length:4},()=>[31,12,4,8,10,24,2,1,0,0]).flat()]
const fmSource=`track0 {@f0 {${fmValues.join(',')}} @lv1 {8,20,4,0} @lt1 {-20,32,0,0}} `+
  Array.from({length:12},(_,i)=>`track${i+1} {@f0 @lv1 @lt1 (ce)4.&(ed)4. @s105 c}`).join(' ')
const fmProcessor=new Processor({processorOptions:{song:compile(fmSource)}})
fmProcessor.port.onmessage({data:{type:'start',startTime:0}})
assert.equal(fmProcessor.process([],output),true)
assert.ok(output[0][0].some(n=>n!==0));assert.ok(output[0][0].every(Number.isFinite))
fmProcessor.port.onmessage({data:'stop'});assert.equal(fmProcessor.process([],output),false)
console.log('Built AudioWorklet: 12 FM tracks with pitch/amplitude modulation render successfully.')

const waveSamples=Array.from({length:32},(_,i)=>i*8-128)
const waveSource=`track0 {@w0 {${waveSamples}} @lv1 {8,20,4,0} @lt1 {-20,32,0,0}} `+
  Array.from({length:12},(_,i)=>`track${i+1} {@w0 @lv1 @lt1 (ce)4.&(ed)4.}`).join(' ')
const waveProcessor=new Processor({processorOptions:{song:compile(waveSource)}})
waveProcessor.port.onmessage({data:{type:'start',startTime:0}})
assert.equal(waveProcessor.process([],output),true)
assert.ok(output[0][0].some(n=>n!==0));assert.ok(output[0][0].every(Number.isFinite))
let waveActive=true
for(let block=0;block<1000 && waveActive;block++) waveActive=waveProcessor.process([],output)
assert.equal(waveActive,false)
console.log('Built AudioWorklet: 12 wave tracks render with modulation and finish with key-off.')

// Worklet waits through arbitrary setup delays and starts at the exact frame within a quantum.
const startupProcessor=new Processor({processorOptions:{song:compile(`track0 {@w0 {${Array(32).fill(127)}}} track1 {@w0 t120 l32 p0 c}`)}})
scope.currentFrame=48000
assert.equal(startupProcessor.process([],output),true)
assert.ok(output[0][0].every(n=>n===0))
startupProcessor.port.onmessage({data:{type:'start',startTime:(48000+64)/48000}})
assert.equal(startupProcessor.process([],output),true)
assert.ok(output[0][0].slice(0,65).every(n=>n===0))
assert.ok(output[0][0][65]>0)
console.log('Built AudioWorklet: waits for start and honors sub-block start time with de-click.')

// Explicit stop clears even a reused nonzero output buffer; late start cannot revive it.
startupProcessor.port.onmessage({data:'stop'})
assert.equal(startupProcessor.messages.at(-1).type,'stopped')
startupProcessor.port.onmessage({data:{type:'start',startTime:0}})
for(const channel of output[0]) channel.fill(.75)
assert.equal(startupProcessor.process([],output),false)
assert.ok(output[0].every(channel=>channel.every(n=>n===0)))
startupProcessor.port.onmessage({data:'stop'})
assert.equal(startupProcessor.process([],output),false)
console.log('Built AudioWorklet: one stop clears output and rejects stale start messages.')
