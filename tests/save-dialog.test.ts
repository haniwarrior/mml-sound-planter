import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createSaveDialog } from '../src/ui/save-dialog.ts'

class Element extends EventTarget {
 children:Element[]=[];value='';open=false;message='';reported=0;focused=false;selected=false;type=''
 append(...elements:Element[]) {this.children.push(...elements)}
 setAttribute(){}
 showModal(){this.open=true}
 close(){this.open=false}
 focus(){this.focused=true}
 select(){this.selected=true}
 setCustomValidity(message:string){this.message=message}
 reportValidity(){this.reported++;return !this.message}
}
test('save dialog defaults, cancellation, blank rejection and exact names across repeated saves',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document')
 const elements:{tag:string;el:Element}[]=[]
 const body=new Element()
 Object.defineProperty(globalThis,'document',{configurable:true,value:{body,createElement:(tag:string)=>{
  const el=new Element();elements.push({tag,el});return el
 }}})
 try {
  let current='sound-planter.txt';const downloads:string[]=[]
  const show=createSaveDialog(name=>{downloads.push(name);current=name})
  const find=(tag:string)=>elements.find(e=>e.tag===tag)!.el
  const input=find('input'),dialog=find('dialog'),form=find('form'),cancel=elements.find(e=>e.tag==='button' && e.el.type==='button')!.el
  const submit=()=>form.dispatchEvent(new Event('submit',{cancelable:true}))
  show(current);assert.equal(input.value,'sound-planter.txt');assert.ok(input.focused && input.selected)
  input.value='discard.mml';cancel.dispatchEvent(new Event('click'))
  assert.equal(current,'sound-planter.txt');assert.deepEqual(downloads,[]);assert.equal(dialog.open,false)
  current='abc.txt';show(current);assert.equal(input.value,'abc.txt')
  for(const name of ['', '   ']) {
   input.value=name;submit();assert.equal(dialog.open,true);assert.equal(current,'abc.txt');assert.deepEqual(downloads,[])
  }
  input.value='def.txt';input.dispatchEvent(new Event('input'));assert.equal(input.message,'');submit()
  assert.equal(dialog.open,false);assert.equal(current,'def.txt');assert.deepEqual(downloads,['def.txt'])
  show(current);assert.equal(input.value,'def.txt');submit();assert.deepEqual(downloads,['def.txt','def.txt'])
  for(const name of ['song.mml','test',' 日本語.mml ']) {
   show(current);input.value=name;submit();assert.equal(downloads.at(-1),name);assert.equal(current,name)
  }
 } finally {
  if(previous) Object.defineProperty(globalThis,'document',previous)
  else Reflect.deleteProperty(globalThis,'document')
 }
})
test('load updates filename after successful read; save keeps Main-only Blob download',()=>{
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8')
 assert.match(main,/let currentFileName='sound-planter.txt'/)
 assert.match(main,/source.value=await selected.text\(\); currentFileName=selected.name/)
 assert.match(main,/showSaveDialog\(currentFileName\)/)
 assert.match(main,/new Blob\(\[source.value\],\{type:'text\/plain;charset=utf-8'\}\)/)
 assert.match(main,/a.download=name;try \{a.click\(\);currentFileName=name\}/)
 assert.match(main,/finally \{setTimeout\(\(\)=>URL.revokeObjectURL\(url\),1000\)/)
 assert.ok(!main.includes('showSaveFilePicker'))
})
