import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compile } from '../src/mml/compile.ts'
import { MmlError, type FmTone } from '../src/mml/ast.ts'
import { Sequencer } from '../src/mml/sequencer.ts'
import { AudioRenderer } from '../src/audio/render.ts'
import { FmGenerator, fmAlgorithm, fmFeedback, fmFrequency } from '../src/audio/fm.ts'
import { EnvelopeGenerator } from '../src/audio/envelope.ts'
import { lfoValue, vibratoOffset, tremoloGain } from '../src/audio/modulation.ts'
const sr=48000
const operator=[31,0,0,15,0,0,0,1,0,0]
const values=(algorithm=7,feedback=0)=>[algorithm,feedback,...Array.from({length:4},()=>operator).flat()]
const definition=(data=values(),id=0)=>`@f${id} {${data.join(',')}}`
const song=(body:string,defs=definition())=>compile(`track0 {${defs}} track1 {${body}}`)
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`)
const power=(a:Float32Array)=>a.reduce((sum,n)=>sum+n*n,0)
const render=(body:string,defs=definition(),frames=sr)=>{
 const r=new AudioRenderer(song(body,defs),sr),l=new Float32Array(frames),right=new Float32Array(frames)
 const active=r.render(l,right);return {l,right,active}
}
test('LFO Period and Delay use 25ms units for repeat and hold',()=>{
 const d={depth:127,period:4,delay:4,mode:0 as const}
 near(lfoValue(d,.099),0);near(lfoValue(d,.1),0);near(vibratoOffset(d,.125),12)
 near(vibratoOffset(d,.175),-12);near(lfoValue(d,.2),0)
 near(lfoValue({...d,mode:1},.15),Math.SQRT1_2);near(lfoValue({...d,mode:1},.2),1)
 near(lfoValue({...d,depth:-127,mode:1},1),-1)
 for(const period of [4,20,40,255]) near(lfoValue({...d,period,delay:0},period*.025/4),1)
})
test('FM definitions accept 0 and 127 and retain M1,C1,M2,C2 order',()=>{
 const data=values();for(let i=0;i<4;i++) data[2+10*i+5]=10+i
 const s=song('@f0c @f127d',definition(data)+definition(values(),127))
 assert.deepEqual(s.fmTones[0].operators.map(op=>op.tl),[10,11,12,13])
 assert.deepEqual(s.fmTones[0].operators[0],{ar:31,dr:0,sr:0,rr:15,sl:0,tl:10,ks:0,ml:1,dt1:0,dt2:0})
 const seq=new Sequencer(s.tracks[1]);assert.equal(seq.next()!.state.synth,'fm');assert.equal(seq.next()!.state.fmTone,127)
})
test('FM range, exact count, duplicate and original source coordinates',()=>{
 for(const id of ['128','-1','+1']) {
  assert.throws(()=>song(`@f${id} c`),/invalid FM tone number/)
  assert.throws(()=>song('',`@f${id} {${values()}}`),/invalid FM tone number/)
 }
 for(const count of [0,1,2,41,43,52]) assert.throws(()=>song('',definition(Array.from({length:count},()=>0))),/wrong FM parameter count/)
 assert.throws(()=>song('',definition()+definition()),/duplicate FM tone definition/)
 const max=[7,7,...Array.from({length:4},()=>[31,31,31,15,15,127,3,15,7,3]).flat()]
 assert.doesNotThrow(()=>song('@f0c',definition(max)))
 for(let i=0;i<42;i++) for(const bad of [-1,max[i]+1]) {
  const data=values();data[i]=bad
  assert.throws(()=>song('',definition(data)),/FM parameter out of range/)
 }
 assert.throws(()=>compile('track0 {}\ntrack1 {\n @f3 c\n}'),(e:unknown)=>e instanceof MmlError && /undefined FM tone/.test(e.message) && e.position.line===3 && e.position.column===2)
 assert.throws(()=>song(`@f0 {${values()}}`),MmlError)
})
test('only executed FM selections require a definition; macros and test playback share definitions',()=>{
 assert.doesNotThrow(()=>song('@s0c',''))
 assert.doesNotThrow(()=>song('@s0c','$unused$ {@f3 c}'))
 assert.throws(()=>song('$used$','$used$ {@f3 c}'),/undefined FM tone/)
 assert.throws(()=>song('@f3 @s0 c',''),/undefined FM tone/)
 assert.doesNotThrow(()=>song('@s0 [c]0 @f3',''))
 const main=`track0 {${definition()} $a$ {@f0} $b$ {$a$}} track1 {@f3c}`
 const s=compile(main,'$b$ c');assert.equal(new Sequencer(s.tracks[1],s.macros).next()!.state.synth,'fm')
 assert.throws(()=>compile(main),/undefined FM tone/)
})
// Independent edge lists in logical M1,C1,M2,C2 order; sentinel outputs expose sums.
const inputs=[[0,2,3,5],[0,0,5,5],[0,0,3,7],[0,2,0,8],[0,2,0,5],[0,2,2,2],[0,2,0,0],[0,0,0,0]]
const carrierSums=[7,7,7,7,10,15,15,17]
for(let al=0;al<8;al++) test(`YM2151 AL${al} exact modulation edges and carriers`,()=>{
 const seen:number[]=[];const result=fmAlgorithm(al,(i,mod)=>{assert.equal(i,seen.length);seen.push(mod);return [2,3,5,7][i]},0)
 assert.deepEqual(seen,inputs[al]);assert.equal(result,carrierSums[al])
 const tone=song('',definition(values(al))).fmTones[0],g=new FmGenerator(sr)
 g.start(tone,60,0,false)
 const phase=2*Math.PI*440*2**((60-69)/12)/sr,s=(mod:number)=>Math.sin(phase+8*Math.PI*mod),a=s(0)
 // Closed-form second sample for equal, full-level operators and no feedback.
 const expected=[s(s(s(a))),s(s(2*a)),s(a+s(a)),s(s(a)+a),s(a)+s(a),3*s(a),s(a)+2*a,4*a][al]/4
 near(g.sample(0,60),0);near(g.sample(1/sr,60),expected)
})
test('FB0–7 feed only M1, using two prior outputs with exponential depth',()=>{
 for(let fb=0;fb<=7;fb++) {
  const tone=song('',definition(values(7,fb))).fmTones[0]
  assert.equal(tone.feedback,fb)
  const m=fmFeedback(.25,-.125,fb);near(m,fb===0 ? 0 : .125*2**(fb-9))
  const seen:number[]=[];fmAlgorithm(7,(i,mod)=>{seen.push(mod);return i+1},m)
  assert.deepEqual(seen,[m,0,0,0])
 }
 const muted=values();muted[7]=127
 const withFeedback=[...muted];withFeedback[1]=7
 const a=render('@f0 c',definition(muted)).l,b=render('@f0 c',definition(withFeedback)).l
 assert.ok(a.every((x,i)=>Math.abs(x-b[i])<1e-6))
 assert.notDeepEqual(render('@f0 c',definition(values(7,0))).l,render('@f0 c',definition(values(7,7))).l)
})
test('ML zero is half, TL attenuation and DT1/DT2 frequency relationships',()=>{
 const op=song('',definition()).fmTones[0].operators[0]
 near(fmFrequency(69,op),440);near(fmFrequency(69,{...op,ml:0}),220);near(fmFrequency(69,{...op,ml:15}),6600)
 for(const [dt2,cents] of [0,600,781,950].entries()) near(fmFrequency(69,{...op,dt2}),440*2**(cents/1200))
 near(fmFrequency(69,{...op,dt1:4}),440)
 for(let dt1=1;dt1<4;dt1++) {
  near(fmFrequency(69,{...op,dt1})+fmFrequency(69,{...op,dt1:dt1+4}),880)
  assert.ok(fmFrequency(69,{...op,dt1})>440)
 }
 const attenuated=values();for(let i=0;i<4;i++) attenuated[7+i*10]=8
 const a=render('@f0 p0 c').l,b=render('@f0 p0 c',definition(attenuated)).l
 for(let i=0;i<1000;i++) near(b[i],a[i]/2)
})
test('FM operator EG, q release, rest and track-end keyoff work without software EG',()=>{
 const slow=values();for(let i=0;i<4;i++) slow[5+i*10]=8
 const a=render('@f0 t120 q1 c4',definition(slow),sr*2)
 assert.ok(power(a.l.slice(3000,9000))>0);assert.equal(power(a.l.slice(sr)),0);assert.equal(a.active,false)
 const rest=render('@f0 t120 c8 r4',definition(slow),sr*2)
 assert.ok(power(rest.l.slice(12000,15000))>0);assert.equal(rest.active,false)
 const silence=values();for(let i=0;i<4;i++) silence[2+i*10]=0
 assert.equal(power(render('@f0c',definition(silence)).l),0)
 const decay=values();for(let i=0;i<4;i++) {decay[3+i*10]=31;decay[4+i*10]=31;decay[6+i*10]=15}
 assert.equal(power(render('@f0 c1',definition(decay)).l.slice(sr/2)),0)
})
test('FM tie and portamento chain retain phases and operator envelopes',()=>{
 const a=render('@f0 t120 c4&c4').l,b=render('@f0 t120 c2').l
 assert.deepEqual(a,b)
 const retrigger=render('@f0 t120 c4 c4').l;assert.notDeepEqual(a,retrigger)
 const chain=render('@f0 t120 (ce)4&(eg)4').l
 assert.ok(power(chain.slice(23900,24100))>0)
 const s=song('@f0 q2 (ce)4.&(eg)4.'),seq=new Sequencer(s.tracks[1])
 const first=seq.next()!,last=seq.next()!;assert.equal(first.gate,first.duration);assert.equal(last.connected,true);near(last.gate,last.duration/4)
})
test('FM pitch + detune + portamento + vibrato and post-synthesis envelope/tremolo',()=>{
 const defs=definition()+' @e1 {31,0,0,15,0,0} @lv1 {8,20,4,0} @lt1 {-20,32,0,0}'
 const out=render('@f0 p0 @v60 @e1 @lv1 @lt1 @d8 t120 (cg)1',defs,sr/2)
 let phase=0
 for(let i=0;i<out.l.length;i++) {
  const t=i/sr,v=t<.1 ? 0 : 12*8/127*Math.sin((t-.1)*2*Math.PI/.5)
  const gain=60/127*(1-20/127*Math.sin(t*2*Math.PI/.8))
  near(out.l[i],Math.sin(phase*2*Math.PI)*gain*.075)
  phase=(phase+440*2**((60+7*t/2+.08+v-69)/12)/sr)%1
 }
 const egDefs=definition()+' @e1 {20,8,3,9,8,3} @lt1 {-64,20,0,0}'
 const plain=render('@f0 p0 @v60 c1',egDefs,sr/2).l
 const modified=render('@f0 p0 @v60 @e1 @lt1 c1',egDefs,sr/2).l
 const eg=new EnvelopeGenerator([20,8,3,9,8,3],60);eg.keyOn()
 for(let i=0;i<plain.length;i++) near(modified[i],plain[i]*eg.sample(i/sr)*tremoloGain({depth:-64,period:20,delay:0,mode:0},i/sr))
 assert.equal(power(render('@f0 @e1 c',''+definition()+' @e1 {0,0,0,15,0,0}').l),0)
})
test('FM pan/volume and switching to and from SSG, including ties and macro state',()=>{
 const left=render('@f0 p0 c');assert.ok(power(left.l)>0);assert.equal(power(left.right),0)
 const right=render('@f0 p8 c');assert.ok(power(right.right)>0);assert.ok(power(right.l)<1e-20)
 assert.equal(power(render('@f0 v0 c').l),0)
 assert.deepEqual(render('@f0 v10 c').l,render('@f0 @v80 c').l)
 const s=song('@s0c $fm$ d @s105 e @f0 f',definition()+' $fm$ {@f0}'),seq=new Sequencer(s.tracks[1],s.macros)
 assert.deepEqual(Array.from({length:4},()=>seq.next()!.state.synth),['ssg','fm','ssg','fm'])
 for(const separator of [' ','&']) {
  const out=render(`@s0 t120 c8${separator}@f0 d8${separator}@s105 e8${separator}@f0 f8`)
  for(let i=0;i<4;i++) assert.ok(power(out.l.slice(i*12000+500,i*12000+10000))>0)
  assert.ok(out.l.every(Number.isFinite))
 }
})
test('all twelve tracks can use FM; track13 rejects; render blocks preserve FM clock',()=>{
 const source=`track0 {${definition()}} `+Array.from({length:12},(_,i)=>`track${i+1} {@f0 p0 c1}`).join(' ')
 const r=new AudioRenderer(compile(source),sr),l=new Float32Array(4096),right=new Float32Array(4096);r.render(l,right)
 const one=render('@f0 p0 c1',''+definition(),4096).l
 for(let i=0;i<l.length;i++) assert.ok(Math.abs(l[i]-one[i]*12)<1e-6)
 assert.ok(l.every(x=>Math.abs(x)<=.9+1e-7))
 for(const track of [13,99,-1]) assert.throws(()=>compile(`track0 {} track${track} {@f0 c}`),/invalid track number/)
 const text='@f0 @lv1 @lt1 t255 l128 [c&d (eg)&(ge) r]0',defs=definition(values(3,6))+' @lv1 {8,20,4,0} @lt1 {-20,32,0,0}'
 const all=render(text,defs,32768).l,split=new AudioRenderer(song(text,defs),sr),joined=new Float32Array(32768)
 for(let i=0;i<joined.length;i+=128){const block=new Float32Array(128);split.render(block,new Float32Array(128));joined.set(block,i)}
 assert.deepEqual(joined,all)
})
test('generated masthead contains brand only and obsolete version CSS is removed',()=>{
 const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8')
 const header=source.match(/<header class="masthead">([\s\S]*?)<\/header>/)![1]
 assert.match(header,/^<a class="brand"[^>]*>[\s\S]*<\/a>$/)
 assert.ok(!source.includes('class="version"'));assert.ok(!source.includes('class="dot"'))
 assert.ok(!/\.version\b|\.dot\b/.test(css));assert.ok(source.includes('最大12トラック'))
})
