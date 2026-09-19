import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compile } from '../src/mml/compile.ts'
import { Sequencer } from '../src/mml/sequencer.ts'
import { MmlError } from '../src/mml/ast.ts'
import { lfoValue, vibratoOffset, tremoloGain, modulatedGain } from '../src/audio/modulation.ts'
import { AudioRenderer } from '../src/audio/render.ts'
import { NoiseGenerator } from '../src/audio/noise.ts'
import { ToneGenerator } from '../src/audio/tone.ts'
const song=(body:string,defs='')=>compile(`track0 {${defs}} track1 {@s,0 ${body}}`)
const events=(body:string,defs='')=>{const data=song(body,defs),s=new Sequencer(data.tracks[1],data.macros),out=[];for(let i=0;i<100;i++){const e=s.next();if(!e)break;out.push(e)}return out}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`)
const defs='@lv,1 {8,5,2,+,r} @lt,1 {20,8,0,-,r}'
test('dotted portamento duration, default length and chained gate',()=>{
 const e=events('t120 q2 (ce)4.&(ed)4. (ce)2.. l8 (c+g).')
 near(e[0].duration,.75);near(e[1].duration,.75);near(e[2].duration,1.75);near(e[3].duration,.375)
 near(e[0].gate,.75);near(e[1].gate,.75/4);assert.equal(e[1].connected,true)
 for(const text of ['(c4e)4','(c.e)4']) assert.throws(()=>song(text),/invalid dotted portamento/)
})
test('macros are case insensitive, nested, forward referenced and preserve all state',()=>{
 const definitions=`$seq_A+2$ {$Arp+$ $bass-1$} $arp+$ {>l8 v10 q3 p2 @d-4 @s,105 @e,1 @lv,1 @lt,1} $bass-1$ {@v100 cd} @e,1 {31,0,0,15,0,0} ${defs}`
 const e=events('o4 $SEQ_a+2$ e',definitions)
 assert.deepEqual(e.map(x=>x.pitch),[72,74,76]);assert.deepEqual(e[0].state,e[2].state)
 assert.deepEqual(e[2].state,{tempo:128,octave:5,length:8,volume:100,gate:3,pan:2,detune:-4,mode:105,envelope:1,vibrato:1,tremolo:1})
})
test('ties across macro entry, exit, trailing tie, empty macro and loops',()=>{
 const a=events('q2 c4&$phrase$&f4','$phrase$ {d4&e4}')
 const b=events('q2 c4&d4&e4&f4')
 assert.deepEqual(a.map(({pos,...x})=>x),b.map(({pos,...x})=>x))
 const c=events('q2 c&$empty$ $p$ f','$p$ {[d&e&]2} $empty$ {}')
 assert.deepEqual(c.map(x=>x.connected),[false,true,true,true,true,true]);near(c.at(-1)!.gate,c.at(-1)!.duration/4)
})
test('macro graph errors include unused definitions and original positions',()=>{
 for(const [definitions,body,error] of [
  ['$a$ {$a$}','',/macro circular reference/],['$a$ {$b$} $b$ {$a$}','',/macro circular reference/],
  ['$a$ {$missing$}','',/undefined macro/],['','$missing$',/undefined macro/],
  ['$TEST$ {c} $test$ {d}','',/duplicate macro/],['$a$ {c}','$a$ {d}',/track0/],
  ['$$ {c}','',/invalid macro name/],['$abcdefghijklmnopq$ {c}','',/invalid macro name/],
  ['$has space$ {c}','',/invalid macro name/],['$bad!$ {c}','',/invalid macro name/],
 ] as const) assert.throws(()=>song(body,definitions),error)
 assert.throws(()=>compile('track0 {\n $a$ {$missing$}\n}'),(e:unknown)=>e instanceof MmlError && e.position.line===2 && e.position.column===7)
 assert.equal(events('$1234567890123456$','$1234567890123456$ {c}').length,1)
})
test('macro expansion stays bounded and validation retains loop safety',()=>{
 assert.throws(()=>song('$a$','$a$ {[v1]0}'),/時間が進まない/)
 assert.throws(()=>song('o8 $up$','$up$ {>c}'),/オクターブ/)
 const definitions=Array.from({length:20},(_,i)=>`$a${i}$ {${i===19 ? 'v1' : `$a${i+1}$$a${i+1}$`}}`).join(' ')
 assert.throws(()=>song('$a0$',definitions),/処理が多すぎ/)
 const recursive={a:{body:[{kind:'macro' as const,name:'a',pos:{offset:0,line:1,column:1}}],pos:{offset:0,line:1,column:1}}}
 assert.throws(()=>new Sequencer(recursive.a.body,recursive).next(),/macro circular reference/)
 assert.throws(()=>new Sequencer([{kind:'loop',body:[],count:0,pos:{offset:0,line:1,column:1}}]).next(),/安全上限/)
})
test('LFO namespaces, persistent selections, OFF and test playback definitions',()=>{
 const e=events('@lv,1 @lt,1 cd @lv,0 e @lt,0 f',defs)
 assert.deepEqual(e.map(x=>[x.state.vibrato,x.state.tremolo]),[[1,1],[1,1],[0,1],[0,0]])
 const s=compile(`track0 {${defs} $p$ {@lv,1 @lt,1 c}} track1 {@s,0 c}`,'@s,105 $p$')
 assert.equal(new Sequencer(s.tracks[1],s.macros).next()!.state.vibrato,1)
 for(const kind of ['@lv','@lt']) {
  assert.throws(()=>song(`${kind},2 c`,defs),/undefined LFO/)
  assert.throws(()=>song('',`${kind},1 {0,1,0,+,r} ${kind},1 {0,1,0,+,r}`),/duplicate LFO definition/)
  for(const values of ['128,1,0,+,r','-1,1,0,+,r','0,0,0,+,r','0,256,0,+,r','0,1,256,+,r','0,1,0,x,r','0,1,0,+,x','0,1,0,+','0,1,0,+,r,1'])
   assert.throws(()=>song('',`${kind},1 {${values}}`),/invalid LFO parameter/)
  assert.throws(()=>song('',`${kind},0 {0,1,0,+,r}`),/invalid LFO parameter/)
  assert.doesNotThrow(()=>song(`${kind},1 c`,`${kind},1 {127,255,255,-,h}`))
 }
})
test('SSG ranges distinguish combined mode and invalid gap',()=>{
 for(const n of [0,1,31,101,131]) assert.equal(events(`@s,${n} c`)[0].state.mode,n)
 for(const n of [-1,32,99,100,132,999]) assert.throws(()=>song(`@s,${n} c`),/invalid @s value/)
})
test('sine repeat, direction, delay, hold and depth mapping',()=>{
 const d={depth:127,period:4,delay:2,direction:'+' as const,mode:'r' as const}
 near(lfoValue(d,.1),0);near(lfoValue(d,.2),0);near(vibratoOffset(d,.3),24);near(vibratoOffset(d,.5),-24);near(lfoValue(d,.6),0)
 near(lfoValue({...d,direction:'-'},.3),-1);near(vibratoOffset({...d,depth:0},.3),0)
 near(lfoValue({...d,mode:'h'},.4),Math.SQRT1_2);near(lfoValue({...d,mode:'h'},.6),1);near(lfoValue({...d,mode:'h'},5),1)
 near(lfoValue({...d,mode:'h',direction:'-'},5),-1)
 near(tremoloGain({...d,depth:0},.3),1);near(tremoloGain(d,.3),2);near(tremoloGain(d,.5),0)
 near(modulatedGain(127,.1,2),.2);near(modulatedGain(127,1,2),1);near(modulatedGain(127,0,2),0)
})
const sr=48000
const render=(body:string,definitions='',frames=24000)=>{
 const r=new AudioRenderer(song(body,definitions),sr),left=new Float32Array(frames),right=new Float32Array(frames);r.render(left,right);return left
}
test('noise-only ignores vibrato and all pitch movement; tremolo modulates noise',()=>{
 const d='@lv,1 {127,1,0,+,r} @lt,1 {127,1,0,-,r} @e,1 {20,8,3,9,8,3}'
 const a=render('@s,5 @e,1 o1 @d-16 c1',d)
 assert.deepEqual(a,render('@s,5 @e,1 @lv,1 o8 @d16 (cg)1',d))
 assert.notDeepEqual(a,render('@s,5 @e,1 @lt,1 o1 @d-16 c1',d))
})
test('combined mode gates tone with fixed noise period across pitch and vibrato changes',()=>{
 const definition='@lv,1 {127,1,0,+,r}'
 const actual=render('@s,105 @v127 p0 t120 @lv,1 (ce)4&g4',definition,40000)
 const noise=new NoiseGenerator(),tone=new ToneGenerator()
 for(let i=0;i<actual.length;i++) {
  const time=i/sr,pitch=time<.5 ? 60+4*time/.5 : 67
  const frequency=440*2**((pitch+24*Math.sin(time*2*Math.PI/.1)-69)/12)
  const t=tone.sample(frequency,sr),n=noise.sample(5,sr)
  near(actual[i],(n>0 ? t : -1)*.075)
 }
})
test('portamento, detune, vibrato, tremolo and envelope combine sample by sample',()=>{
 const definition='@e,1 {31,0,0,15,0,0} @lv,1 {8,5,2,+,r} @lt,1 {20,8,0,-,r}'
 const base=render('@s,0 @v60 p0 @e,1 @d8 t120 (cg)1',definition)
 const combined=render('@s,0 @v60 p0 @e,1 @d8 @lv,1 @lt,1 t120 (cg)1',definition)
 const tone=new ToneGenerator()
 for(let i=0;i<combined.length;i++) {
  const time=i/sr,v=time<.2 ? 0 : 24*8/127*Math.sin((time-.2)*2*Math.PI/.5)
  const sample=tone.sample(440*2**((60+7*time/2+.08+v-69)/12),sr)
  near(combined[i],sample*60/127*(1-20/127*Math.sin(time*2*Math.PI/.8))*.075)
 }
 assert.notDeepEqual(base,combined)
 const faded=render('@s,105 @e,2 @lt,1 t120 q1 c1','@e,2 {31,0,0,15,0,0} @lt,1 {127,1,0,+,r}')
 assert.ok(faded.slice(18000).every(x=>x===0))
})
test('LFO resets on key-on, continues over ties, and delay restarts on selection change',()=>{
 const d='@lt,1 {127,8,0,-,h} @lt,2 {127,8,2,-,h}'
 const tied=render('@s,5 t120 @lt,1 c4&c4',d,48000)
 const fresh=render('@s,5 t120 @lt,1 c4 c4',d,48000)
 assert.ok(tied.slice(40000).every(x=>Math.abs(x)<1e-10))
 assert.ok(fresh.slice(40000).some(x=>Math.abs(x)>1e-5))
 const changed=render('@s,5 t120 @lt,1 c4&@lt,2 c4',d,48000)
 const plain=render('@s,5 t120 c1','',48000)
 assert.deepEqual(changed.slice(24000,33000),plain.slice(24000,33000))
})
