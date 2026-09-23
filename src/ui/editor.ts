import type { Position } from '../mml/ast.ts'
import { errorRange, guideDepth, inputEdit, lineNumber, MAX_LINES, visibleLines, type ErrorRange, type TextEdit } from './editor-model.ts'

export class EditorAssist {
  private textarea:HTMLTextAreaElement
  private gutter:HTMLDivElement
  private layer:HTMLDivElement
  private lines:string[]=[]
  private error?:ErrorRange
  private composing=false
  private editing=false
  private frame=0
  private onLimit:()=>void
  constructor(textarea:HTMLTextAreaElement,onLimit:()=>void) {
    this.textarea=textarea;this.onLimit=onLimit
    const shell=document.createElement('div');shell.className=`mml-editor ${textarea.id==='source' ? 'editor-dark' : 'editor-light'}`
    textarea.before(shell)
    this.gutter=document.createElement('div');this.gutter.className='editor-gutter';this.gutter.setAttribute('aria-hidden','true')
    const viewport=document.createElement('div');viewport.className='editor-viewport'
    this.layer=document.createElement('div');this.layer.className='editor-layer';this.layer.setAttribute('aria-hidden','true')
    viewport.append(this.layer,textarea);shell.append(this.gutter,viewport)
    // A logical line stays on one row; long lines scroll horizontally, without changing data.
    textarea.wrap='off'
    textarea.addEventListener('scroll',()=>this.schedule())
    textarea.addEventListener('compositionstart',()=>{this.composing=true})
    textarea.addEventListener('compositionend',()=>{this.composing=false})
    textarea.addEventListener('input',(event)=>{
      const previous=this.lines.length
      this.clearError();this.refresh()
      if(this.lines.length>MAX_LINES && (previous<=MAX_LINES || (event as InputEvent).inputType==='insertFromPaste')) this.onLimit()
    })
    textarea.addEventListener('beforeinput',(event)=>{
      const input=event as InputEvent
      if(this.editing || this.composing || input.isComposing || !input.cancelable) return
      const edit=inputEdit(textarea.value,textarea.selectionStart,textarea.selectionEnd,input.inputType,input.data)
      if(edit) {input.preventDefault();this.insert(edit)}
    })
    new ResizeObserver(()=>this.schedule()).observe(textarea)
    void document.fonts.ready.then(()=>this.schedule())
    this.refresh()
  }
  private insert(edit:TextEdit) {
    const textarea=this.textarea
    if(edit.text==='' && edit.start===edit.end && edit.caret!==undefined) {textarea.setSelectionRange(edit.caret,edit.caret);return}
    this.editing=true
    textarea.setSelectionRange(edit.start,edit.end)
    // Native editing keeps undo/redo where supported; fallback preserves selection and input events.
    try {
      let inserted=false
      try {inserted=typeof document.execCommand==='function' && document.execCommand('insertText',false,edit.text)} catch { /* Use the standard textarea fallback. */ }
      if(!inserted) {
        textarea.setRangeText(edit.text,edit.start,edit.end,'end')
        textarea.dispatchEvent(new Event('input',{bubbles:true}))
      }
      if(edit.caret!==undefined) textarea.setSelectionRange(edit.caret,edit.caret)
    } finally {this.editing=false}
  }
  refresh(checkLimit=false) {
    this.lines=this.textarea.value.split('\n');this.schedule()
    if(checkLimit && this.lines.length>MAX_LINES) this.onLimit()
  }
  clearError() {this.error=undefined;this.textarea.removeAttribute('aria-invalid');this.schedule()}
  highlight(position:Position) {
    this.error=errorRange(this.textarea.value,position);this.textarea.setAttribute('aria-invalid','true')
    const height=parseFloat(getComputedStyle(this.textarea).lineHeight)
    this.textarea.scrollTop=Math.max(0,this.error.line*height-this.textarea.clientHeight/3)
    const ruler=document.createElement('span')
    ruler.style.cssText='position:absolute;visibility:hidden;white-space:pre;tab-size:4'
    ruler.style.font=getComputedStyle(this.textarea).font
    ruler.textContent=this.lines[this.error.line].slice(0,this.error.start)
    this.textarea.parentElement!.append(ruler)
    this.textarea.scrollLeft=Math.max(0,ruler.getBoundingClientRect().width-this.textarea.clientWidth/3)
    ruler.remove()
    this.textarea.focus({preventScroll:true});this.textarea.scrollIntoView({block:'nearest'});this.schedule()
  }
  private schedule() {if(!this.frame) this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw()})}
  private draw() {
    const area=this.textarea,style=getComputedStyle(area),height=parseFloat(style.lineHeight),padding=parseFloat(style.paddingTop)
    const {first,last}=visibleLines(area.scrollTop,area.clientHeight,height,this.lines.length)
    const numbers=document.createDocumentFragment(),rows=document.createDocumentFragment()
    this.layer.style.width=`${area.clientWidth}px`;this.layer.style.height=`${area.clientHeight}px`
    for(let i=first;i<last;i++) {
      const top=padding+i*height-area.scrollTop
      const number=document.createElement('div');number.className='editor-number';number.style.top=`${top}px`;number.textContent=lineNumber(i);numbers.append(number)
      const row=document.createElement('div');row.className='editor-row';row.style.top=`${top}px`;row.style.left=`${parseFloat(style.paddingLeft)-area.scrollLeft}px`
      const depth=guideDepth(this.lines[i])
      if(depth) {const guide=document.createElement('span');guide.className='indent-guides';guide.style.width=`${depth*2}ch`;row.append(guide)}
      if(this.error?.line===i) {
        const text=this.lines[i],mark=document.createElement('mark');mark.className='editor-error'
        mark.textContent=text.slice(this.error.start,this.error.end)||' '
        row.append(document.createTextNode(text.slice(0,this.error.start)),mark,document.createTextNode(text.slice(this.error.end)))
        if(this.error.wholeLine) row.classList.add('error-line')
      }
      rows.append(row)
    }
    this.gutter.replaceChildren(numbers);this.layer.replaceChildren(rows)
  }
}
