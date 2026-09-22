import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compile } from '../src/mml/compile.ts'
import { parseSong } from '../src/mml/parser.ts'
import { Sequencer } from '../src/mml/sequencer.ts'
import { MmlError } from '../src/mml/ast.ts'
const song = (mml:string,defs='')=>compile(`track0 {${defs}} track1 {@s0 ${mml}}`)
const events = (mml:string, count=100, defs='')=>{const s=new Sequencer(song(mml,defs).tracks[1]);const out=[];for(let i=0;i<count;i++){const e=s.next();if(!e)break;out.push(e)}return out}
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`)
test('case, whitespace and original comment locations',()=>{
 const data=compile('TRACK0 {}\n// ignored } @z\nTRACK1 {\n @S 0 C + 3 . .\n D-6\n}')
 const s=new Sequencer(data.tracks[1]);const c=s.next()!;assert.equal(c.pitch,61);close(c.duration,240/128/3*1.75);assert.equal(c.pos.line,4);assert.equal(c.pos.column,7);assert.equal(s.next()!.pitch,61)
 assert.throws(()=>compile('track0 {}\n// comment\ntrack1 {@s0 z}'),(e:unknown)=>e instanceof MmlError && e.position.line===3)
})
test('notes, accidental boundaries, arbitrary lengths, rests and multiple dots',()=>{
 assert.deepEqual(events('c d e f g a b c- b+').map(e=>e.pitch),[60,62,64,65,67,69,71,59,72])
 for(const n of [1,3,6,12,127,128]) close(events(`c${n}`)[0].duration,240/128/n)
 close(events('r8...')[0].duration,240/128/8*1.875);assert.equal(events('r')[0].pitch,null)
})
test('all default and persistent MML states',()=>{
 const state=events('c')[0].state
 assert.deepEqual(state,{synth:'ssg',waveTone:0,fmTone:0,tempo:128,octave:4,length:4,volume:96,gate:8,pan:4,detune:0,mode:0,envelope:0,vibrato:0,tremolo:0})
 const e=events('t120 o2 >3 <2 l6 v15 @v127 q3 p8 @d-15 c d')[1]
 assert.equal(e.pitch,50);assert.equal(e.state.volume,127);assert.equal(e.state.detune,-15);assert.equal(e.state.pan,8);close(e.duration,1/3);close(e.gate,1/8)
 assert.equal(events('@v127 v15 c')[0].state.volume,120)
 assert.equal(events('@d+15 c')[0].state.detune,15)
})
test('all SSG modes and envelopes including KS',()=>{
 for(let n=0;n<=31;n++) assert.equal(events(`@s${n} c`)[0].state.mode,n)
 const e=events('@e1 c @e0 d',100,'@e1 {31,12,4,8,10,3}')
 assert.equal(e[0].state.envelope,1);assert.equal(e[1].state.envelope,0)
 assert.deepEqual(song('@e1 c','@e1 {31,12,4,8,10,3}').envelopes[1],[31,12,4,8,10,3])
})
test('finite, default, single and nested loops; last break is innermost',()=>{
 assert.deepEqual(events('[cd]').map(e=>e.pitch),[60,62,60,62])
 assert.equal(events('[c]1').length,1)
 assert.deepEqual(events('abc[cd:e]3fga').map(e=>e.pitch),[69,71,60,60,62,64,60,62,64,60,62,65,67,69])
 assert.deepEqual(events('[[c:d]2e]2').map(e=>e.pitch),[60,62,60,64,60,62,60,64])
})
test('infinite loops stream bounded events, including finite loops with breaks inside',()=>{
 const e=events('[[c:d]2]0',10000);assert.equal(e.length,10000);assert.equal(e[9999].pitch,60)
 assert.doesNotThrow(()=>song('[o4 c > c]0'))
 assert.throws(()=>song('[c >]0'),/オクターブ/)
 assert.throws(()=>song('[[>c]255]255'),/オクターブ/)
 assert.throws(()=>song('[v1]0'),/時間が進まない/)
 assert.throws(()=>song('[[]255]0'),/時間が進まない/)
 assert.throws(()=>song('[[[]255]255]255'),/処理が多すぎ/)
 assert.doesNotThrow(()=>song('[[[c]255]255]255'))
})
test('tie/legato crosses loops; q applies only at the end',()=>{
 const e=events('q2 c&[de]');assert.deepEqual(e.map(n=>n.connected),[false,true,false,false,false]);close(e[0].gate,e[0].duration);close(e[1].gate,e[1].duration/4)
 const chain=events('q4 c&d&e');assert.deepEqual(chain.map(n=>n.continues),[true,true,false]);close(chain[2].gate,chain[2].duration/2)
 const same=events('c&c');assert.equal(same[1].connected,true)
 const rest=events('q1 c&r d');close(rest[0].gate,rest[0].duration);assert.equal(rest[2].connected,false)
 const end=events('q1 c&');close(end[0].gate,end[0].duration);assert.equal(end[0].continues,false)
 assert.equal(events('[c&]2d')[2].connected,true)
})
test('portamento octave persists, durations/q and chained portamentos',()=>{
 const e=events('o4 q4 (c>c)4 d');assert.equal(e[0].pitch,60);assert.equal(e[0].endPitch,72);assert.equal(e[1].pitch,74);close(e[0].gate,e[0].duration/2)
 const c=events('q4 (ce)4&(ed)4&(dg)8');assert.deepEqual(c.map(e=>[e.pitch,e.endPitch,e.connected]),[[60,64,false],[64,62,true],[62,67,true]]);close(c[0].gate,c[0].duration);close(c[2].gate,c[2].duration/2)
 close(events('l3 (cd)')[0].duration,240/128/3)
})
test('all tracks share origin; tempo changes are track-local',()=>{
 const s=compile('track0 {} track1 {@s0 t120 c t60 d} track12 {@s0 t60 c d}')
 const a=new Sequencer(s.tracks[1]),b=new Sequencer(s.tracks[12]);assert.equal(a.next()!.time,b.next()!.time);close(a.next()!.time,.5);close(b.next()!.time,1)
})
test('test playback uses definitions and only the test track; independent defaults',()=>{
 const main='track0 {@e1 {31,0,0,15,0,2}} track1 {@s0 o8 v1 c}'
 const s=compile(main,'@s0 @e1 c');assert.deepEqual(Object.keys(s.tracks),['1']);const e=new Sequencer(s.tracks[1]).next()!;assert.equal(e.pitch,60);assert.equal(e.state.volume,96)
 assert.throws(()=>compile(main,'track1 {c}'))
})
const invalid=[
 'c0','c129','c++','c+-','c4+','c.4','r+','r-','t0','t256','o0','o9','o8>c','o1<c','o8(c>c)',
 'l0','l129','v16','v-1','@v128','q0','q9','p9','@d17','@d-17','@s32','@s-1','@s,0',
 '@e1 c','[c','c]','[c]256','[c::d]2','[c:d]0',':','&c','r&c','c&&d',
 '(c)','(cde)','(c4d)','(c.d)','(cr)','(ct120d)','(cl8d)','(cv8d)','(c@v8d)','(cq4d)','(cp4d)','(c@d1d)','(c@s0d)','(c@e0d)','(c[de])','(c&d)','(c','@f,0','z','!','{c}'
]
for(const mml of invalid) test(`reject ${mml}`,()=>assert.throws(()=>song(mml),MmlError))
for(const source of [
 'track1 {@s0 c}','track0 {} track0 {}','track0 {} track1 {} track1 {}','track0 {} track13 {}',
 'track0 {@e0 {31,0,0,15,0,0}}','track0 {@e1 {31,0,0,15,0,0} @e1 {31,0,0,15,0,0}}',
 'track0 {@e1 {31,0,0,15,0}}','track0 {@e1 {31,0,0,15,0,0,1}}','track0 {@e1 {32,0,0,15,0,0}}',
 'track0 {@e1 {31,32,0,15,0,0}}','track0 {@e1 {31,0,32,15,0,0}}','track0 {@e1 {31,0,0,16,0,0}}',
 'track0 {@e1 {31,0,0,15,16,0}}','track0 {@e1 {31,0,0,15,0,4}}','track0 {c}','track0 {} track1 {c}'
]) test(`reject song ${source}`,()=>assert.throws(()=>compile(source),MmlError))
test('parser produces structured loops rather than expanded source',()=>{
 const s=parseSong('track0 {} track1 {@s0 [c]0}');assert.equal(s.tracks[1][1].kind,'loop')
})
