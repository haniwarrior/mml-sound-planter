import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compile } from '../src/mml/compile.ts'
import { MmlError } from '../src/mml/ast.ts'
import { errorRange, lineCount, lineNumber, MAX_LINES, guideDepth, indentEdit, visibleLines } from '../src/ui/editor-model.ts'
import { exceedsLineLimit } from '../src/ui/line-limit.ts'
import { commands, orderedCommands } from '../src/ui/commands.ts'
function failure(main:string,test?:string):MmlError {
 try {compile(main,test)} catch(error) {assert.ok(error instanceof MmlError);return error}
 throw Error('Expected error')
}
const enter=(value:string,start=value.length,end=start)=>{
 const edit=indentEdit(value,start,end,'Enter')!
 return value.slice(0,edit.start)+edit.text+value.slice(edit.end)
}
test('single main/test diagnostics retain source identity, numeric token span and new position',()=>{
 const text='track0 {\n @lv1 {128,5,0,0}\n} track1 {@s0 c}'
 const e=failure(text);assert.equal(e.position.source,'main');assert.equal(text.slice(e.position.offset,e.position.end),'128')
 const range=errorRange(text,e.position);assert.deepEqual(range,{line:1,start:7,end:10,wholeLine:false})
 const test='@s0\n@d16 c @s100'
 const te=failure('track0 {}',test);assert.equal(te.position.source,'test');assert.equal(te.position.line,2)
 assert.deepEqual(errorRange(test,te.position),{line:1,start:2,end:4,wholeLine:false})
 const changed=failure('track0 {}','@s0\n@d15 c @s100')
 assert.equal(changed.position.source,'test');assert.ok(changed.position.offset>te.position.offset)
 assert.doesNotThrow(()=>compile('track0 {}','@s0\n@d15 c @s101'))
})
test('test playback highlights main definitions and macro bodies in their original editor',()=>{
 assert.equal(failure('track0 {@lv1 {128,1,0,0}}','@s0c').position.source,'main')
 const main='track0 {\n $bad$ {@f3 c}\n}'
 const error=failure(main,'$bad$');assert.equal(error.position.source,'main');assert.equal(error.position.line,2)
 const missing=failure('track0 {}','$bad$');assert.equal(missing.position.source,'test')
})
test('error span falls back to a whole line for EOF or whitespace and supports line/column',()=>{
 assert.deepEqual(errorRange('track0 {',{offset:8,line:1,column:9}),{line:0,start:0,end:8,wholeLine:true})
 assert.deepEqual(errorRange('a\n  \n',{offset:3,line:2,column:2}),{line:1,start:0,end:2,wholeLine:true})
 assert.deepEqual(errorRange('a\n123',{offset:-1,line:2,column:1}),{line:1,start:0,end:3,wholeLine:false})
 assert.deepEqual(errorRange('\n',{offset:0,line:1,column:1}),{line:0,start:0,end:1,wholeLine:true})
 assert.equal(errorRange('@d-128',{offset:2,end:3,line:1,column:3}).end,6)
})
test('logical line numbers include blanks, never pad, and stop after 99999',()=>{
 assert.equal(lineCount(''),1);assert.equal(lineCount('a\n\nb\n'),4)
 assert.equal(lineCount('a\r\nb\r\n'),3)
 assert.equal(lineCount('c'.repeat(10000)),1)
 assert.deepEqual([0,41,998,99998,99999].map(lineNumber),['1','42','999','99999',''])
 const max='\n'.repeat(MAX_LINES-1),over=max+'\n'
 assert.equal(exceedsLineLimit(max),false);assert.equal(exceedsLineLimit(over),true)
 assert.equal(exceedsLineLimit('track0 {}',over),true)
 assert.equal(over.length,MAX_LINES) // The check is read-only; no truncation.
})
test('viewport rows track scroll, retain partial lines and stay bounded for 100000 lines',()=>{
 assert.deepEqual(visibleLines(0,100,20,100000),{first:0,last:7})
 assert.deepEqual(visibleLines(205,100,20,100000),{first:8,last:18})
 const bottom=visibleLines(1999980,100,20,100000);assert.equal(bottom.last,100000);assert.ok(bottom.last-bottom.first<10)
})
test('Enter inherits indentation, accounts for brace balance, selection and comments',()=>{
 assert.equal(enter('  cdef'),'  cdef\n  ')
 assert.equal(enter('track0 {'),'track0 {\n  ')
 assert.equal(enter('track0 {\n  $phrase$ {'),'track0 {\n  $phrase$ {\n    ')
 assert.equal(enter('  @e1 {31,12,4,8,10,2}'),'  @e1 {31,12,4,8,10,2}\n  ')
 assert.equal(enter('  // {'),'  // {\n  ')
 assert.equal(enter('track0 { // }'),'track0 { // }\n  ')
 assert.equal(enter('  {} {'),'  {} {\n    ')
 assert.equal(enter('  cdef',3,5),'  c\n  f')
 assert.equal(enter('\n',0),'\n\n')
 assert.equal(enter('\tc'),'\tc\n    ')
})
test('closing brace dedents only an overindented line head, not inline or already correct',()=>{
 const value='track0 {\n  $phrase$ {\n    cdef\n    '
 const edit=indentEdit(value,value.length,value.length,'}')!
 assert.equal(value.slice(0,edit.start)+edit.text,'track0 {\n  $phrase$ {\n    cdef\n  }')
 for(const text of ['track0 {\n  $p$ {\n  ','track0 {\n','  cdef','  // {\n  ','  '])
  assert.equal(indentEdit(text,text.length,text.length,'}'),undefined)
 assert.equal(indentEdit(value,value.length-1,value.length,'}'),undefined)
})
test('indent guides follow two spaces and never appear on whitespace-only lines',()=>{
 assert.equal(guideDepth('  c'),1);assert.equal(guideDepth('    c'),2)
 assert.equal(guideDepth(''),0);assert.equal(guideDepth('    '),0);assert.equal(guideDepth('\t'),0)
 assert.equal(guideDepth('\tc'),2);assert.equal(guideDepth('track0 {'),0)
})
test('command catalog has all sections, exact order and no notes/rests',()=>{
 assert.equal(commands.length,31)
 assert.deepEqual(orderedCommands('definition').map(c=>c.symbol),['@e','@f','@lt','@lv','@w','$name$'])
 const performance=orderedCommands('performance').map(c=>c.symbol)
 assert.deepEqual(performance,['@d','@e','@f','@lt','@lv','@s','@v','@w','l','o','p','q','t','v','$name$','&','()','+','-','.','//','<','>','[]',':'])
 assert.ok(commands.every(c=>!['c','d','e','f','g','a','b','r'].includes(c.symbol)))
 assert.equal(new Set(commands.map(c=>c.id)).size,31)
 assert.ok(commands.every(c=>c.detail.includes('書式')))
 const detail=(symbol:string,section='performance')=>commands.find(c=>c.symbol===symbol && c.section===section)!.detail
 assert.match(detail('@lv','definition'),/0\.025秒/);assert.match(detail('@lv','definition'),/±1オクターブ/)
 assert.match(detail('@lt','definition'),/-127〜\+127/);assert.match(detail('@d'),/-15〜\+15/)
 assert.match(detail('@f','definition'),/42個/);assert.match(detail('@f','definition'),/OP2 = C1/)
 assert.match(detail('v'),/vN = @v\(N × 8\)/);assert.match(detail('q'),/q1 = 12\.5%/)
})

test('decoration metrics use integer line heights and panels remain non-modal and responsive',()=>{
 const css=readFileSync(new URL('../src/ui/editor.css',import.meta.url),'utf8')
 assert.match(css,/font:13px\/24px/);assert.match(css,/line-height:22px/)
 assert.match(css,/flex:0 0 5ch/);assert.match(css,/--command-width:340px/);assert.match(css,/--command-width:90vw/)
 assert.match(css,/overscroll-behavior:contain/)
 const help=readFileSync(new URL('../src/ui/help.ts',import.meta.url),'utf8')
 assert.match(help,/aria-modal','false/);assert.ok(!help.includes('showModal'))
 const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8')
 assert.ok(source.indexOf('if(exceedsLineLimit(')<source.indexOf('const song=compile('))
 assert.match(source,/new Blob\(\[source.value\]/)
})

test('loop Enter indentation combines unresolved braces and brackets and ignores comments',()=>{
 assert.equal(enter('  [cdef'),'  [cdef\n    ')
 assert.equal(enter('  [cdef]2'),'  [cdef]2\n  ')
 assert.equal(enter('  [[cdef'),'  [[cdef\n      ')
 assert.equal(enter('  [[cd]2ef'),'  [[cd]2ef\n    ')
 assert.equal(enter('track1 { [cdef'),'track1 { [cdef\n    ')
 assert.equal(enter('track1 { [cd]2'),'track1 { [cd]2\n  ')
 assert.equal(enter('  [cd // ]'),'  [cd // ]\n    ')
 assert.equal(enter('  // ['),'  // [\n  ')
 assert.equal(enter('track1 {\n  [cdef\n    gab>c'),'track1 {\n  [cdef\n    gab>c\n    ')
})
test('closing loops dedent one level with nested and mixed delimiters',()=>{
 const close=(value:string,key:']'|'}')=>{
  const edit=indentEdit(value,value.length,value.length,key)!
  return value.slice(0,edit.start)+edit.text
 }
 assert.equal(close('track1 {\n  [cdef\n    gab>c\n    ',']'),'track1 {\n  [cdef\n    gab>c\n  ]')
 assert.equal(close('track1 {\n  [cd\n    [ef\n      ',']'),'track1 {\n  [cd\n    [ef\n    ]')
 assert.equal(close('track1 {\n  [cd\n    ef\n  ]2\n  ','}'),'track1 {\n  [cd\n    ef\n  ]2\n}')
 assert.equal(close('track1 {\n  [cd]2\n  ','}'),'track1 {\n  [cd]2\n}')
 for(const value of ['  cdef','  // [\n  ','  ','track1 {\n  [cd\n  '])
  assert.equal(indentEdit(value,value.length,value.length,']'),undefined)
 assert.equal(indentEdit('[cd\n  ',5,6,']'),undefined)
 assert.equal(guideDepth('    [cd'),2)
 assert.equal(guideDepth('  ]2'),1)
 assert.equal(guideDepth('    '),0)
})
