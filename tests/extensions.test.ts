import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compile } from '../src/mml/compile.ts'
import { Sequencer } from '../src/mml/sequencer.ts'
import { MmlError } from '../src/mml/ast.ts'
import { lfoValue, vibratoOffset, tremoloGain, modulatedGain } from '../src/audio/modulation.ts'
import { AudioRenderer } from '../src/audio/render.ts'
import { NoiseGenerator } from '../src/audio/noise.ts'
import { ToneGenerator } from '../src/audio/tone.ts'
const song=(body:string,defs='')=>compile(`track0 {${defs}} track1 {@s0 ${body}}`)
const events=(body:string,defs='')=>{const data=song(body,defs),s=new Sequencer(data.tracks[1],data.macros),out=[];for(let i=0;i<100;i++){const e=s.next();if(!e)break;out.push(e)}return out}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`)
const defs='@lv1 {8,5,2,0} @lt1 {-20,8,0,0}'
test('dotted portamento duration, default length and chained gate',()=>{
 const e=events('t120 q2 (ce)4.&(ed)4. (ce)2.. l8 (c+g).')
 near(e[0].duration,.75);near(e[1].duration,.75);near(e[2].duration,1.75);near(e[3].duration,.375)
 near(e[0].gate,.75);near(e[1].gate,.75/4);assert.equal(e[1].connected,true)
 for(const text of ['(c4e)4','(c.e)4']) assert.throws(()=>song(text),/invalid dotted portamento/)
})
test('macros are case insensitive, nested, forward referenced and preserve all state',()=>{
 const definitions=`$seq_A+2$ {$Arp+$ $bass-1$} $arp+$ {>l8 v10 q3 p2 @d-4 @s105 @e1 @lv1 @lt1} $bass-1$ {@v100 cd} @e1 {31,0,0,15,0,0} ${defs}`
 const e=events('o4 $SEQ_a+2$ e',definitions)
 assert.deepEqual(e.map(x=>x.pitch),[72,74,76]);assert.deepEqual(e[0].state,e[2].state)
 assert.deepEqual(e[2].state,{synth:'ssg',waveTone:0,fmTone:0,tempo:128,octave:5,length:8,volume:100,gate:3,pan:2,detune:-4,mode:105,envelope:1,vibrato:1,tremolo:1})
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
 const e=events('@lv1 @lt1 cd @lv0 e @lt0 f',defs)
 assert.deepEqual(e.map(x=>[x.state.vibrato,x.state.tremolo]),[[1,1],[1,1],[0,1],[0,0]])
 const s=compile(`track0 {${defs} $p$ {@lv1 @lt1 c}} track1 {@s0 c}`,'@s105 $p$')
 assert.equal(new Sequencer(s.tracks[1],s.macros).next()!.state.vibrato,1)
 for(const kind of ['@lv','@lt']) {
  assert.throws(()=>song(`${kind}2 c`,defs),/undefined LFO/)
  assert.throws(()=>song('',`${kind}1 {0,1,0,0} ${kind}1 {0,1,0,0}`),/duplicate LFO definition/)
  for(const values of ['128,1,0,0','-128,1,0,0','0,0,0,0','0,256,0,0','0,1,256,0','0,1,-1,0','0,1,0,2','0,1,0,-1','0,1,0','0,1,0,0,1','0,1,0,+,r','0,1,0,-,h','0,1,0,r','0,1,0,h'])
   assert.throws(()=>song('',`${kind}1 {${values}}`),/invalid LFO parameter/)
  assert.throws(()=>song('',`${kind}0 {0,1,0,0}`),/invalid LFO parameter/)
  assert.doesNotThrow(()=>song(`${kind}1 c`,`${kind}1 {-127,255,255,1}`))
 }
})
test('SSG ranges distinguish combined mode and invalid gap',()=>{
 for(const n of [0,1,31,101,131]) assert.equal(events(`@s${n} c`)[0].state.mode,n)
 for(const n of [-1,32,99,100,132,999]) assert.throws(()=>song(`@s${n} c`),/invalid @s value/)
})
test('sine repeat, direction, delay, hold and depth mapping',()=>{
 const d={depth:127,period:16,delay:8,mode:0 as const}
 near(lfoValue(d,.1),0);near(lfoValue(d,.2),0);near(vibratoOffset(d,.3),12);near(vibratoOffset(d,.5),-12);near(lfoValue(d,.6),0)
 near(lfoValue({...d,depth:-127},.3),-1);near(vibratoOffset({...d,depth:0},.3),0)
 near(lfoValue({...d,mode:1},.4),Math.SQRT1_2);near(lfoValue({...d,mode:1},.6),1);near(lfoValue({...d,mode:1},5),1)
 near(lfoValue({...d,mode:1,depth:-127},5),-1)
 near(tremoloGain({...d,depth:0},.3),1);near(tremoloGain(d,.3),2);near(tremoloGain(d,.5),0)
 near(modulatedGain(127,.1,2),.2);near(modulatedGain(127,1,2),1);near(modulatedGain(127,0,2),0)
})
const sr=48000
const render=(body:string,definitions='',frames=24000)=>{
 const r=new AudioRenderer(song(body,definitions),sr),left=new Float32Array(frames),right=new Float32Array(frames);r.render(left,right);return left
}
test('noise-only ignores vibrato and all pitch movement; tremolo modulates noise',()=>{
 const d='@lv1 {127,1,0,0} @lt1 {-127,1,0,0} @e1 {20,8,3,9,8,3}'
 const a=render('@s5 @e1 o1 @d-15 c1',d)
 assert.deepEqual(a,render('@s5 @e1 @lv1 o8 @d15 (cg)1',d))
 assert.notDeepEqual(a,render('@s5 @e1 @lt1 o1 @d-15 c1',d))
})
test('combined mode gates tone with fixed noise period across pitch and vibrato changes',()=>{
 const definition='@lv1 {127,1,0,0}'
 const actual=render('@s105 @v127 p0 t120 @lv1 (ce)4&g4',definition,40000)
 const noise=new NoiseGenerator(),tone=new ToneGenerator()
 for(let i=0;i<actual.length;i++) {
  const time=i/sr,pitch=time<.5 ? 60+4*time/.5 : 67
  const frequency=440*2**((pitch+12*Math.sin(time*2*Math.PI/.025)-69)/12)
  const t=tone.sample(frequency,sr),n=noise.sample(5,sr)
  near(actual[i],(n>0 ? t : -1)*.075)
 }
})
test('portamento, detune, vibrato, tremolo and envelope combine sample by sample',()=>{
 const definition='@e1 {31,0,0,15,0,0} @lv1 {8,5,2,0} @lt1 {-20,8,0,0}'
 const base=render('@s0 @v60 p0 @e1 @d8 t120 (cg)1',definition)
 const combined=render('@s0 @v60 p0 @e1 @d8 @lv1 @lt1 t120 (cg)1',definition)
 const tone=new ToneGenerator()
 for(let i=0;i<combined.length;i++) {
  const time=i/sr,v=time<.05 ? 0 : 12*8/127*Math.sin((time-.05)*2*Math.PI/.125)
  const sample=tone.sample(440*2**((60+7*time/2+.08+v-69)/12),sr)
  near(combined[i],sample*60/127*(1-20/127*Math.sin(time*2*Math.PI/.2))*.075)
 }
 assert.notDeepEqual(base,combined)
 const faded=render('@s105 @e2 @lt1 t120 q1 c1','@e2 {31,0,0,15,0,0} @lt1 {127,1,0,0}')
 assert.ok(faded.slice(18000).every(x=>x===0))
})
test('LFO resets on key-on, continues over ties, and delay restarts on selection change',()=>{
 const d='@lt1 {-127,32,0,1} @lt2 {-127,32,8,1}'
 const tied=render('@s5 t120 @lt1 c4&c4',d,48000)
 const fresh=render('@s5 t120 @lt1 c4 c4',d,48000)
 assert.ok(tied.slice(40000).every(x=>Math.abs(x)<1e-10))
 assert.ok(fresh.slice(40000).some(x=>Math.abs(x)>1e-5))
 const changed=render('@s5 t120 @lt1 c4&@lt2 c4',d,48000)
 const plain=render('@s5 t120 c1','',48000)
 assert.deepEqual(changed.slice(24000,33000),plain.slice(24000,33000))
})

test('signed detune accepts optional plus and rejects the new out-of-range boundaries',()=>{
 for(const [text,value] of [['-15',-15],['-5',-5],['0',0],['5',5],['+5',5],['15',15],['+15',15]] as const)
  assert.equal(events(`@d${text}c`)[0].state.detune,value)
 assert.deepEqual(render('@d5c'),render('@d+5c'))
 for(const text of ['-16','16','+16','++5','+-5','--5','+','5.5']) assert.throws(()=>song(`@d${text} c`),MmlError)
})
test('signed LFO depths, numeric modes and optional plus survive parser through audio',()=>{
 for(const kind of ['@lv','@lt'] as const) {
  const small=kind==='@lv' ? 64 : 20
  const definitions=`${kind}1 {-127,1,0,0} ${kind}2 {127,255,255,1} ${kind}3 {+127,255,255,1} ${kind}4 {${small},10,0,0} ${kind}5 {+${small},10,0,0} ${kind}6 {0,1,0,1}`
  const data=song(`${kind}1 c ${kind}0 d`,definitions)
  assert.deepEqual(data.lfos[kind][2],data.lfos[kind][3]);assert.deepEqual(data.lfos[kind][4],data.lfos[kind][5])
  assert.equal(data.lfos[kind][1].depth,-127);assert.equal('direction' in data.lfos[kind][1],false)
  near(lfoValue(data.lfos[kind][6],10),0)
  for(const depth of [-127,127,small,-small]) {
   const lfo=song('',`${kind}1 {${depth},4,0,0}`).lfos[kind][1]
   near(lfoValue(lfo,.025),depth/127);near(lfoValue(lfo,.075),-depth/127)
   near(lfoValue({...lfo,mode:1},10),depth/127)
   if(kind==='@lv') {near(vibratoOffset(lfo,.025),depth/127*12);near(vibratoOffset({...lfo,mode:1},10),depth/127*12)}
   else {near(tremoloGain(lfo,.025),1+depth/127);near(tremoloGain({...lfo,mode:1},10),1+depth/127)}
  }
  assert.deepEqual(render(`${kind}4c1`,definitions),render(`${kind}5c1`,definitions))
  for(const depth of ['+128','-128','++1','+-1','1.5']) assert.throws(()=>song('',`${kind}1 {${depth},1,0,0}`),/invalid LFO parameter/)
 }
})
test('comma command forms and all legacy LFO definitions are rejected',()=>{
 const definitions='@e1 {31,12,4,8,10,2} @lv1 {32,5,2,0} @lt1 {-20,8,0,0}'
 for(const text of ['@s,1','@e,1','@e,0','@lv,1','@lt,1','@lv,0','@lt,0']) {
  assert.throws(()=>song(`${text} c`,definitions),MmlError)
  assert.throws(()=>compile(`track0 {${definitions}}`,`${text} c`),MmlError)
 }
 assert.throws(()=>song('','@e,1 {31,12,4,8,10,2}'),MmlError)
 for(const kind of ['@lv','@lt']) for(const text of [
  `${kind},1 {32,5,2,0}`,`${kind},1 {32,5,2,+,r}`,
  `${kind}1 {32,5,2,+,r}`,`${kind}1 {32,5,2,-,h}`,
  `${kind}1 {32,5,2,+,0}`,`${kind}1 {32,5,2,r}`,`${kind}1 {32,5,2,h}`,
 ]) assert.throws(()=>song('',text),/invalid LFO parameter/)
 const e=events('@v100@d+5@s105@e1@lv1@lt1c@e0@lv0@lt0d',definitions)
 assert.equal(e[0].state.volume,100);assert.equal(e[0].state.detune,5);assert.equal(e[0].state.mode,105)
 assert.deepEqual(e.map(x=>[x.state.envelope,x.state.vibrato,x.state.tremolo]),[[1,1,1],[0,0,0]])
})
