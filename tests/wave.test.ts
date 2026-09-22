import test from 'node:test'
import assert from 'node:assert/strict'
import { compile } from '../src/mml/compile.ts'
import { MmlError } from '../src/mml/ast.ts'
import { Sequencer } from '../src/mml/sequencer.ts'
import { WaveGenerator } from '../src/audio/wave.ts'
import { AudioRenderer } from '../src/audio/render.ts'
import { EnvelopeGenerator } from '../src/audio/envelope.ts'
import { commands, orderedCommands } from '../src/ui/commands.ts'
const sr=48000
const table=Array.from({length:32},(_,i)=>i*8-128)
const def=(data:(number|string)[]=table,id=0)=>`@w${id} {${data.join(',')}}`
const song=(body:string,defs=def())=>compile(`track0 {${defs}} track1 {${body}}`)
const render=(body:string,defs=def(),frames=sr)=>{
 const renderer=new AudioRenderer(song(body,defs),sr),left=new Float32Array(frames),right=new Float32Array(frames)
 const active=renderer.render(left,right);return {left,right,active}
}
const power=(data:Float32Array)=>data.reduce((sum,x)=>sum+x*x,0)
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`)

test('wave definitions accept IDs 0/127, exactly 32 signed eight-bit samples and explicit plus',()=>{
 const values=Array.from({length:32},(_,i)=>['-128','-1','0','1','+1','127','+127'][i%7])
 const s=song('@w0c @w127d',def(values)+def(values,127))
 assert.deepEqual(s.waveTones[0],values.map(Number))
 const seq=new Sequencer(s.tracks[1]);assert.equal(seq.next()!.state.synth,'wave');assert.equal(seq.next()!.state.waveTone,127)
 for(const count of [0,1,31,33]) assert.throws(()=>song('',def(Array(count).fill(0))),/32値/)
 for(const id of ['128','-1','+1','1.5']) {
  assert.throws(()=>song(`@w${id} c`),MmlError)
  assert.throws(()=>song('',`@w${id} {${table}}`),MmlError)
 }
 for(const bad of ['-129','128','+128','1.5','1e2','0x10','--1','++1','+-1','NaN','Infinity','']) {
  const data:(number|string)[]=[...table];data[9]=bad
  assert.throws(()=>song('',def(data)),MmlError)
 }
 assert.throws(()=>song('',def()+def()),/duplicate wave/)
 assert.throws(()=>song(`@w0 {${table}}`),MmlError)
})
test('only executed wave references require definitions, including macros and test playback',()=>{
 assert.doesNotThrow(()=>song('@s0c',''))
 assert.doesNotThrow(()=>song('@s0c','$unused$ {@w3 c}'))
 assert.doesNotThrow(()=>song('@s0[c]0 @w3',''))
 assert.throws(()=>song('@w3 @s0c',''),/undefined wave/)
 assert.throws(()=>song('$used$','$used$ {@w3c}'),/undefined wave/)
 assert.throws(()=>compile('track0 {}\ntrack1 {\n @w3c\n}'),(e:unknown)=>e instanceof MmlError && /undefined wave/.test(e.message) && e.position.line===3 && e.position.column===2)
 const main=`track0 {${def()} $a$ {@w0}} track1 {@w3c}`
 const s=compile(main,'$a$c');assert.equal(new Sequencer(s.tracks[1],s.macros).next()!.state.synth,'wave')
 assert.throws(()=>compile(main,'@w3c'),(e:unknown)=>e instanceof MmlError && e.position.source==='test')
})
test('wave oscillator reads discrete samples without interpolation and resets only on key-on',()=>{
 const g=new WaveGenerator();g.start(table)
 for(let i=0;i<256;i++) assert.equal(g.sample(1,128),table[Math.floor(i/4)%32]/128)
 g.sample(1,128);g.start(Array(32).fill(127),true)
 assert.equal(g.sample(1,128),-1) // old table and phase retained
 g.start(Array(32).fill(127));assert.equal(g.sample(1,128),127/128)
 g.start(table);assert.equal(g.sample(1,128),-1)
})
test('tied wave selections latch until next key-on, with continuous phase and pitch',()=>{
 const defs=def()+def(Array(32).fill(127),1)
 const changed=render('@w0 t120 p0 c4&@w1d4 e4',defs,sr*2).left
 const held=render('@w0 t120 p0 c4&d4 @w1e4',defs,sr*2).left
 assert.deepEqual(changed,held)
 const fullChanged=render('@w0 t120 p0 c4&@w1d4 e4',defs,sr*2).left
 near(fullChanged[sr],127/128*96/127*.075)
 assert.deepEqual(render('@w0 t120 c4&c4').left,render('@w0 t120 c2').left)
 assert.notDeepEqual(render('@w0 t120 c4 c4').left,render('@w0 t120 c2').left)
 near(render('@w0 t120 p0 c4 c4').left[24000],-96/127*.075)
})
test('wave shares portamento, vibrato, detune, software envelope and tremolo',()=>{
 const defs=def()+' @e1 {31,0,0,15,0,0} @lv1 {8,20,4,0} @lt1 {-20,32,0,0}'
 const out=render('@w0 p0 @v60 @e1 @lv1 @lt1 @d8 t120 (cg)1',defs,sr/2).left
 let phase=0
 for(let i=0;i<out.length;i++) {
  const t=i/sr,v=t<.1?0:12*8/127*Math.sin((t-.1)*2*Math.PI/.5)
  const gain=60/127*(1-20/127*Math.sin(t*2*Math.PI/.8))
  near(out[i],table[Math.floor(phase*32)]/128*gain*.075)
  phase=(phase+440*2**((60+7*t/2+.08+v-69)/12)/sr)%1
 }
 const egDefs=def()+' @e1 {20,8,3,9,8,3}'
 const dry=render('@w0 p0 c1',egDefs,sr/2).left,wet=render('@w0 p0 @e1 c1',egDefs,sr/2).left
 const eg=new EnvelopeGenerator([20,8,3,9,8,3],60);eg.keyOn()
 for(let i=0;i<dry.length;i++) near(wet[i],dry[i]*eg.sample(i/sr))
 assert.equal(power(render('@w0 @e1 c',def()+' @e1 {0,0,0,15,0,0}').left),0)
})
test('wave gate, rest, final key-off, pan, volume and portamento ties',()=>{
 const gated=render('@w0 t120 q1 c4')
 assert.ok(power(gated.left.slice(0,3000))>0);assert.equal(power(gated.left.slice(3000)),0);assert.equal(gated.active,false)
 assert.equal(power(render('@w0 t120 c8 r4').left.slice(12000)),0)
 assert.equal(render('@w0 t120 c4&').active,false)
 const release=render('@w0 @e1 t120 q1 c4',def()+' @e1 {31,0,0,8,0,0}',sr*2)
 assert.ok(power(release.left.slice(3000,3100))>0);assert.equal(release.active,false)
 assert.equal(power(render('@w0 p0c').right),0);assert.ok(power(render('@w0 p8c').left)<1e-20)
 assert.ok(power(render('@w0 p8c').right)>0)
 assert.equal(power(render('@w0 v0c').left),0)
 assert.deepEqual(render('@w0 v10c').left,render('@w0 @v80c').left)
 const s=song('@w0 q2 (ce)4.&(eg)4.'),seq=new Sequencer(s.tracks[1])
 const a=seq.next()!,b=seq.next()!;assert.equal(a.gate,a.duration);assert.equal(b.connected,true);assert.equal(b.gate,b.duration/4)
 assert.ok(power(render('@w0 t120 (ce)4&(eg)4').left.slice(23900,24100))>0)
})
test('SSG, FM and wave switching preserves common state and works across ties',()=>{
 const fm=`@f0 {7,0,${Array.from({length:4},()=>[31,0,0,15,0,0,0,1,0,0]).flat()}}`
 const defs=def()+fm+' $wave$ {@w0}'
 const s=song('@s0 @v60 p2 @d3 c @f0 d $wave$ e @s105f @w0g',defs),seq=new Sequencer(s.tracks[1],s.macros)
 for(const synth of ['ssg','fm','wave','ssg','wave']) {
  const e=seq.next()!;assert.equal(e.state.synth,synth);assert.equal(e.state.volume,60);assert.equal(e.state.pan,2);assert.equal(e.state.detune,3)
 }
 for(const sep of [' ','&']) {
  const out=render(`t120 @s0 c8${sep}@f0 d8${sep}@w0 e8${sep}@s105 f8${sep}@w0 g8`,defs,sr*2)
  for(let i=0;i<5;i++) assert.ok(power(out.left.slice(i*12000+500,i*12000+10000))>0)
  assert.ok(out.left.every(Number.isFinite));assert.equal(out.active,false)
 }
})
test('all twelve tracks support wave and render-block boundaries preserve phase',()=>{
 const source=`track0 {${def()}} `+Array.from({length:12},(_,i)=>`track${i+1} {@w0 p0 c1}`).join(' ')
 const r=new AudioRenderer(compile(source),sr),l=new Float32Array(4096);r.render(l,new Float32Array(4096))
 const one=render('@w0 p0 c1',def(),4096).left
 for(let i=0;i<l.length;i++) assert.ok(Math.abs(l[i]-12*one[i])<1e-6)
 const body='@w0 @lv1 @lt1 t255 l128 [c&d (eg)&(ge) r]0',defs=def()+' @lv1 {8,20,4,0} @lt1 {-20,32,0,0}'
 const all=render(body,defs,32768).left,split=new AudioRenderer(song(body,defs),sr),joined=new Float32Array(32768)
 for(let i=0;i<joined.length;i+=128) {const block=new Float32Array(128);split.render(block,new Float32Array(128));joined.set(block,i)}
 assert.deepEqual(joined,all)
})
test('wave command help has exact supplied text and alphabetical placement',()=>{
 const select=commands.find(c=>c.symbol==='@w' && c.section==='performance')!
 assert.equal(select.label,'波形メモリ音色')
 assert.equal(select.detail,'書式\n@wN\n\n設定範囲\n0〜127\n\n説明\ntrack0で定義した波形メモリ音色を選択します。\n\n未定義の音色番号を使用するとエラーになります。\n\n例\n@w1')
 const define=commands.find(c=>c.symbol==='@w' && c.section==='definition')!
 assert.equal(define.label,'波形メモリ音色定義')
 assert.equal(define.detail,`書式
@wN {
  32個のサンプル値
}

定義場所
track0

音色番号
0〜127

サンプル数
32

サンプル値
-128〜+127

正数の + は省略可能です。

例
@w1 {
  0,24,+48,72,96,112,120,127,
  120,112,96,72,48,24,0,-24,
  -48,-72,-96,-112,-120,-128,-120,-112,
  -96,-72,-48,-24,0,8,+4,0
}

説明
32サンプルの波形データを使用する波形メモリ音色を定義します。`)
 for(const section of ['definition','performance'] as const) {
  const ordered=orderedCommands(section).map(c=>c.symbol),index=ordered.indexOf('@w')
  assert.equal(ordered[index-1],section==='definition'?'@lv':'@v')
 }
})
