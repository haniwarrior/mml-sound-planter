import { readFile, readdir } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import assert from 'node:assert/strict'
import { compile } from '../src/mml/compile.ts'
const assets=await readdir('dist/client/assets')
const code=await readFile(`dist/client/assets/${assets.find(n=>n.startsWith('worklet-') && n.endsWith('.js'))}`,'utf8')
let Processor
class Base {port={onmessage:null,postMessage:()=>{}}}
runInNewContext(code,{AudioWorkletProcessor:Base,sampleRate:48000,registerProcessor:(_name,type)=>{Processor=type}})
const processor=new Processor({processorOptions:{song:compile('track0 {@lv,1 {8,5,0,+,r} @lt,1 {20,8,0,-,h} $phrase$ {(ce)4.&d}} track1 {@s,105 @lv,1 @lt,1 $phrase$}')}})
const output=[[new Float32Array(128),new Float32Array(128)]]
assert.equal(processor.process([],output),true)
assert.ok(output[0][0].some(n=>n!==0))
processor.port.onmessage({data:'stop'})
assert.equal(processor.process([],output),false)
console.log('Built AudioWorklet: registers, renders audio, stops successfully.')
