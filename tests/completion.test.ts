import test from 'node:test'
import assert from 'node:assert/strict'
import { inputEdit, indentEdit, guideDepth } from '../src/ui/editor-model.ts'
import { compile } from '../src/mml/compile.ts'
const edit=(value:string,key:string,start=value.length,end=start)=>{
 const e=inputEdit(value,start,end,'insertText',key)!
 const text=value.slice(0,e.start)+e.text+value.slice(e.end)
 return {text,caret:e.caret??e.start+e.text.length}
}
test('macro/portamento pairs wrap selections and skip existing closers without an edit',()=>{
 assert.deepEqual(edit('','$'),{text:'$$',caret:1})
 assert.deepEqual(edit('$foo$','$',4),{text:'$foo$',caret:5})
 assert.deepEqual(edit('foo','$',0,3),{text:'$foo$',caret:5})
 assert.deepEqual(edit('abcfooXYZ','$',3,6),{text:'abc$foo$XYZ',caret:8})
 assert.deepEqual(edit('','('),{text:'()',caret:1})
 assert.deepEqual(edit('(cd)',')',3),{text:'(cd)',caret:4})
 assert.equal(inputEdit('c',1,1,'insertText',')'),undefined)
 assert.deepEqual(edit('cd','(',0,2),{text:'(cd)',caret:4})
})
test('inline templates have exact counts and caret, retain suffix and add no newline',()=>{
 for(const [command,count] of [['e',6],['lt',4],['lv',4]] as const) for(const gap of ['', ' ', '\t']) {
  const prefix=`@${command}1${gap}`,result=edit(prefix+'abc','{',prefix.length)
  assert.equal(result.text,prefix+'{'+Array(count).fill(0).join(',')+'}abc')
  assert.equal(result.caret,prefix.length+2)
  assert.equal(result.text[result.caret-1],'0')
 }
})
test('FM/wave templates have exact rows, inherited indentation and final newline',()=>{
 for(const [command,rows] of [['f',[2,10,10,10,10]],['w',[8,8,8,8]]] as const) for(const base of ['', '    ', '\t']) {
  const prefix=`${base}@${command}127 `,result=edit(prefix+'abc','{',prefix.length)
  const expected=prefix+'{\n'+rows.map(n=>base+'  '+Array(n).fill(0).join(',')).join(',\n')+'\n'+base+'}\nabc'
  assert.equal(result.text,expected)
  assert.equal(result.caret,prefix.length+2+base.length+3)
  assert.equal(result.text[result.caret-1],'0')
  const definition=result.text.slice(0,-3)
  assert.doesNotThrow(()=>compile(`track0 {${definition}} track1 {@${command}127 c}`))
  const e=indentEdit(definition,definition.length,definition.length,'Enter')!
  assert.equal(e.text,'\n')
  assert.equal(guideDepth('    '),0)
 }
})
test('template triggers validate command IDs and exclude unrelated braces/comments/macros',()=>{
 for(const prefix of ['$foo$ ','@s0 ','@e0','@lt0','@lv0','@f128','@w128','@w-1','@f+1','@e1.5','@f','@e9007199254740992','// @e1','foo@e1','@@e1','$@e1'])
  assert.equal(inputEdit(prefix,prefix.length,prefix.length,'insertText','{')?.text,'{}',prefix)
 for(const prefix of ['@f0','@w0','@e1','@lt1','@lv1','  @F1','track0 { @w1'])
  assert.ok(inputEdit(prefix,prefix.length,prefix.length,'insertText','{'),prefix)
 assert.equal(edit('@e1abc','{',3,6).text,'@e1{0,0,0,0,0,0}abc')
})
test('paste, composition input, undo/redo and multi-character inserts pass through',()=>{
 for(const type of ['insertFromPaste','insertFromDrop','insertCompositionText','insertFromComposition','historyUndo','historyRedo']) for(const data of ['$','(','{'])
  assert.equal(inputEdit('@f1 ',4,4,type,data),undefined)
 assert.equal(inputEdit('',0,0,'insertText','@f1{'),undefined)
})
test('shared direct input retains brace/loop indentation behavior',()=>{
 for(const value of ['track1 {','  [cd','  [cd]2','  [[cd','track1 {\n  ']) {
  assert.deepEqual(inputEdit(value,value.length,value.length,'insertLineBreak',null),indentEdit(value,value.length,value.length,'Enter'))
  for(const key of ['}',']'] as const) assert.deepEqual(inputEdit(value,value.length,value.length,'insertText',key),indentEdit(value,value.length,value.length,key))
 }
})


test('track templates inherit indentation, preserve following text and place caret inside',()=>{
 for(const id of [0,1,12]) for(const gap of ['', ' ', '\t']) for(const base of ['', '    ', '\t']) {
  const prefix=base+'track'+id+gap,result=edit(prefix+'abc','{',prefix.length)
  assert.deepEqual(result,{text:prefix+'{\n'+base+'  \n'+base+'}abc',caret:prefix.length+2+base.length+2})
  assert.equal(result.text[result.caret],'\n')
  assert.equal(guideDepth(base+'  '),0)
  const next=inputEdit(result.text,result.caret,result.caret,'insertLineBreak',null)!
  assert.equal(next.text,'\n'+' '.repeat(base==='\t' ? 6 : base.length+2))
 }
 assert.deepEqual(edit('track1 ','{'),{text:'track1 {\n  \n}',caret:11})
 assert.deepEqual(edit('    track1 ','{'),{text:'    track1 {\n      \n    }',caret:19})
 assert.equal(edit('track1abc','{',6,9).text,'track1{\n  \n}abc')
})
test('track completion accepts parser range and excludes paste, composition and invalid triggers',()=>{
 for(const prefix of ['track13','track-1','track+1','track1.5','track','track9007199254740992','mytrack1','@track1','$track1','// track1'])
  assert.equal(inputEdit(prefix,prefix.length,prefix.length,'insertText','{')?.text,'{}',prefix)
 for(const prefix of ['track0','track12','TRACK1','track01']) assert.ok(inputEdit(prefix,prefix.length,prefix.length,'insertText','{'))
 for(const type of ['insertFromPaste','insertFromDrop','insertCompositionText','insertFromComposition','historyUndo','historyRedo'])
  assert.equal(inputEdit('track1 ',7,7,type,'{'),undefined)
 assert.equal(inputEdit('',0,0,'insertText','track1 {'),undefined)
})


test('standalone braces pair once, preserve suffix and share paste/history exclusions',()=>{
 assert.deepEqual(edit('','{'),{text:'{}',caret:1})
 assert.deepEqual(edit('abc','{',0),{text:'{}abc',caret:1})
 assert.deepEqual(edit('abc','{',0,3),{text:'{abc}',caret:5})
 for(const type of ['insertFromPaste','insertCompositionText','insertFromComposition','historyUndo','historyRedo'])
  assert.equal(inputEdit('',0,0,type,'{'),undefined)
 for(const prefix of ['@e1','@f1','@w1','@lt1','@lv1','track0']) {
  const result=edit(prefix,'{')
  assert.equal(result.text.split('{').length-1,1)
  assert.equal(result.text.split('}').length-1,1)
 }
})
test('FM/wave consume only a duplicate empty line tail and retain real data and intentional blanks',()=>{
 for(const command of ['f','w']) {
  const prefix=`track0 {\n  @${command}1 `
  const standalone=edit(prefix,'{')
  for(const tail of ['\n','  \n','\t\r\n']) {
   const result=edit(prefix+tail+'}','{',prefix.length)
   assert.equal(result.text,standalone.text+'}')
   assert.equal(result.caret,standalone.caret)
   assert.ok(result.text.endsWith('  }\n}'))
   assert.doesNotThrow(()=>compile(result.text))
  }
  for(const suffix of ['abc',' abc\n}',' // comment\n}','  ','}'])
   assert.equal(edit(prefix+suffix,'{',prefix.length).text,standalone.text+suffix)
  assert.equal(edit(prefix+'\n  \n}','{',prefix.length).text,standalone.text+'  \n}')
  assert.equal(edit(prefix+'\n  real','{',prefix.length).text,standalone.text+'  real')
  // A selected range is not silently consumed by the template.
  assert.equal(edit(prefix+'\nabc','{',prefix.length,prefix.length+4).text,standalone.text+'\nabc')
 }
})
