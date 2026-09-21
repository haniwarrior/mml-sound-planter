import test from 'node:test'
import assert from 'node:assert/strict'
import { clampDetailPosition, installDetailDrag } from '../src/ui/detail-drag.ts'

test('detail stays inside viewport at every edge and after resize',()=>{
  assert.deepEqual(clampDetailPosition(-500,-500,360,500,1000,800),{x:8,y:8})
  assert.deepEqual(clampDetailPosition(2000,2000,360,500,1000,800),{x:632,y:292})
  assert.deepEqual(clampDetailPosition(632,292,360,400,800,600),{x:432,y:192})
})

test('header drag excludes buttons, handles cancellation, resize, reset and mobile',()=>{
  const media=Object.assign(new EventTarget(),{matches:true})
  const win=Object.assign(new EventTarget(),{innerWidth:1000,innerHeight:800,matchMedia:()=>media})
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window')
  Object.defineProperty(globalThis,'window',{value:win,configurable:true})
  try {
    const style:Record<string,unknown>={removeProperty(key:string){delete style[key]}}
    let captured:number|undefined
    const header=Object.assign(new EventTarget(),{
      classList:{add(){},remove(){}},setPointerCapture(id:number){captured=id},hasPointerCapture(id:number){return captured===id},releasePointerCapture(){captured=undefined},
    })
    const detail={style,hidden:false,getBoundingClientRect:()=>({left:parseFloat(String(style.left))||100,top:parseFloat(String(style.top))||100,width:360,height:400})}
    const reset=installDetailDrag(detail as unknown as HTMLElement,header as unknown as HTMLElement)
    const send=(type:string,x:number,y:number,button=false)=>{
      const event=new Event(type,{cancelable:true})
      Object.defineProperties(event,{pointerId:{value:1},isPrimary:{value:true},button:{value:0},clientX:{value:x},clientY:{value:y},target:{value:{closest:()=>button?{}:null}}})
      header.dispatchEvent(event)
    }
    send('pointerdown',110,110,true);send('pointermove',300,300)
    assert.equal(style.left,undefined)
    send('pointerdown',110,110);send('pointermove',310,210)
    assert.equal(style.left,'300px');assert.equal(style.top,'200px')
    send('pointermove',5000,5000)
    assert.equal(style.left,'632px');assert.equal(style.top,'392px')
    send('pointercancel',0,0);send('pointermove',0,0)
    assert.equal(style.left,'632px');assert.equal(captured,undefined)
    win.innerWidth=800;win.dispatchEvent(new Event('resize'))
    assert.equal(style.left,'432px')
    reset();assert.equal(style.left,undefined)
    media.matches=false;media.dispatchEvent(new Event('change'))
    send('pointerdown',110,110);send('pointermove',300,300)
    assert.equal(style.left,undefined)
  } finally {
    if(previous) Object.defineProperty(globalThis,'window',previous)
    else Reflect.deleteProperty(globalThis,'window')
  }
})

test('drawer shares one transform, responsive width and reduced-motion rule',async()=>{
  const {readFileSync}=await import('node:fs')
  const css=readFileSync(new URL('../src/ui/editor.css',import.meta.url),'utf8')
  const help=readFileSync(new URL('../src/ui/help.ts',import.meta.url),'utf8')
  assert.match(help,/drawer.append\(panel,toggle\)/)
  assert.match(help,/setOpen\(!isOpen\)/)
  assert.match(css,/\.command-drawer\{[^}]*width:var\(--command-width\)[^}]*transition:transform var\(--command-panel-transition-duration\) var\(--command-panel-transition-easing\)/)
  assert.match(css,/\.command-toggle\{[^}]*right:100%/)
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.command-drawer\{transition:none\}/)
  assert.match(css,/--command-width:90vw/)
  assert.match(css,/\.command-detail-body\{min-height:0;overflow-y:auto/)
  assert.match(help,/detail.append\(header,body\)/)
  assert.match(help,/header.append\(heading,close\)/)
})
