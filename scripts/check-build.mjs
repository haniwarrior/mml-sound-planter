import { readFile, readdir } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import assert from 'node:assert/strict'
import { compile } from '../src/mml/compile.ts'
const assets=await readdir('dist/client/assets')
const code=await readFile(`dist/client/assets/${assets.find(n=>n.startsWith('worklet-') && n.endsWith('.js'))}`,'utf8')
let Processor
class Base {port={onmessage:null,postMessage:()=>{}}}
runInNewContext(code,{AudioWorkletProcessor:Base,sampleRate:48000,registerProcessor:(_name,type)=>{Processor=type}})
const processor=new Processor({processorOptions:{song:compile('track0 {@lv1 {8,5,0,0} @lt1 {-20,8,0,1} $phrase$ {(ce)4.&d}} track1 {@s105 @lv1 @lt1 $phrase$}')}})
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
assert.equal(fmProcessor.process([],output),true)
assert.ok(output[0][0].some(n=>n!==0));assert.ok(output[0][0].every(Number.isFinite))
fmProcessor.port.onmessage({data:'stop'});assert.equal(fmProcessor.process([],output),false)
console.log('Built AudioWorklet: 12 FM tracks with pitch/amplitude modulation render successfully.')
