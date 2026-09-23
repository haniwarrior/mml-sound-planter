import type { Position } from '../mml/ast.ts'
export const MAX_LINES=99999
export const LINE_LIMIT_MESSAGE='行数の上限は99999行です。\n100000行目以降を削除してから再生してください。'
export const splitLines=(text:string)=>text.split(/\r\n|\r|\n/)
export const lineCount=(text:string)=>splitLines(text).length
export const lineNumber=(index:number)=>index>=0 && index<MAX_LINES ? String(index+1) : ''
export function indentation(text:string):number {
  let width=0
  for(const c of text) {if(c===' ') width++;else if(c==='\t') width+=4-width%4;else break}
  return width
}
export const guideDepth=(line:string)=>line.trim() ? Math.floor(indentation(line)/2) : 0
export interface TextEdit { start:number; end:number; text:string; caret?:number }
/** Called only for direct typing; paste, composition commits and history events pass through. */
export function inputEdit(value:string,start:number,end:number,inputType:string,data:string|null):TextEdit|undefined {
  if(inputType==='insertLineBreak' || inputType==='insertParagraph') return indentEdit(value,start,end,'Enter')
  if(inputType!=='insertText') return
  if(data==='}' || data===']') return indentEdit(value,start,end,data)
  if((data==='$' || data===')') && start===end && value[start]===data)
    return {start,end,text:'',caret:start+1}
  if(data==='$' || data==='(') {
    const close=data==='$' ? '$' : ')',selected=value.slice(start,end)
    return {start,end,text:data+selected+close,caret:start+(selected ? selected.length+2 : 1)}
  }
  if(data!=='{') return
  const selected=value.slice(start,end)
  const pair:TextEdit={start,end,text:'{'+selected+'}',caret:start+(selected ? selected.length+2 : 1)}
  const lineStart=start>0 ? value.lastIndexOf('\n',start-1)+1 : 0
  const before=value.slice(lineStart,start)
  if(before.includes('//') || (before.match(/\$/g)?.length ?? 0)%2) return pair
  const track=before.match(/(?:^|[^a-z0-9_@$])track([0-9]+)[ \t]*$/i)
  if(track) {
    const id=Number(track[1])
    if(!Number.isSafeInteger(id) || id>12) return pair
    const base=before.match(/^[ \t]*/)![0],indent=base+'  '
    return {start,end:start,text:'{\n'+indent+'\n'+base+'}',caret:start+2+indent.length}
  }
  const match=before.match(/(?:^|[^a-z0-9_@$])@(lt|lv|e|f|w)([0-9]+)[ \t]*$/i)
  if(!match) return pair
  const kind=match[1].toLowerCase(),id=Number(match[2]),multi=kind==='f' || kind==='w'
  if(!Number.isSafeInteger(id) || id<(multi ? 0 : 1) || (multi && id>127)) return pair
  if(!multi) {
    const text='{'+Array(kind==='e' ? 6 : 4).fill('0').join(',')+'}'
    return {start,end:start,text,caret:start+2}
  }
  const base=before.match(/^[ \t]*/)![0],indent=base+'  '
  const rows=kind==='f' ? [2,10,10,10,10] : [8,8,8,8]
  const text='{\n'+rows.map(n=>indent+Array(n).fill('0').join(',')).join(',\n')+'\n'+base+'}\n'
  // Consume only this line's empty tail and one existing line break, never the next line.
  const duplicate=start===end ? value.slice(start).match(/^[ \t]*(?:\r\n|\n)/)?.[0].length ?? 0 : 0
  return {start,end:start+duplicate,text,caret:start+2+indent.length+1}
}
// Comments never affect brace or loop nesting. Pasted text never enters this function.
export function indentEdit(value:string,start:number,end:number,key:'Enter'|'}'|']'):TextEdit|undefined {
  const lineStart=start>0 ? value.lastIndexOf('\n',start-1)+1 : 0
  const before=value.slice(lineStart,start)
  if(key==='Enter') {
    const code=before.split('//')[0]
    let balance=0
    for(const c of code) {if(c==='{' || c==='[') balance++;if(c==='}' || c===']') balance--}
    return {start,end,text:'\n'+' '.repeat(indentation(before)+Math.max(0,balance)*2)}
  }
  if(start!==end || !/^[ \t]+$/.test(before)) return
  const stack:number[]=[]
  for(const line of value.slice(0,lineStart).split('\n')) {
    let local=0
    for(const c of line.split('//')[0]) {
      if(c==='{' || c==='[') {stack.push(indentation(line)+local*2);local++}
      if(c==='}' || c===']') {stack.pop();local=Math.max(0,local-1)}
    }
  }
  const target=stack.at(-1)
  const width=indentation(before)
  if(target===undefined || width<=target) return
  return {start:lineStart,end,text:' '.repeat(Math.max(target,width-2))+key}
}
export interface ErrorRange { line:number; start:number; end:number; wholeLine:boolean }
export function errorRange(value:string,pos:Position):ErrorRange {
  const lines=value.split('\n')
  let offset=pos.offset
  if(!Number.isInteger(offset) || offset<0 || offset>value.length) {
    const row=Math.max(0,Math.min(lines.length-1,pos.line-1))
    offset=lines.slice(0,row).reduce((n,s)=>n+s.length+1,0)+Math.min(lines[row].length,Math.max(0,pos.column-1))
  }
  const lineStart=offset>0 ? value.lastIndexOf('\n',offset-1)+1 : 0
  const lineEnd=value.indexOf('\n',offset),end=lineEnd<0 ? value.length : lineEnd
  const line=value.slice(0,lineStart).split('\n').length-1
  const token=value.slice(offset,end).match(/^(?:\$[^$\n]*\$|@[a-z]+[+-]?\d*|[+-]?\d+|[^\s])/i)?.[0]
  const tokenEnd=Math.min(end,Math.max(pos.end ?? offset,offset+(token?.length ?? 0)))
  if(tokenEnd>offset && !/\s/.test(value[offset])) return {line,start:offset-lineStart,end:tokenEnd-lineStart,wholeLine:false}
  return {line,start:0,end:Math.max(1,end-lineStart),wholeLine:true}
}
export function visibleLines(scrollTop:number,height:number,lineHeight:number,total:number) {
  const first=Math.max(0,Math.floor(scrollTop/lineHeight)-2)
  return {first,last:Math.min(total,Math.ceil((scrollTop+height)/lineHeight)+2)}
}
