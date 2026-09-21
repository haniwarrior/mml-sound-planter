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
export interface TextEdit { start:number; end:number; text:string }
// Comments never affect brace nesting. Pasted text never enters this function.
export function indentEdit(value:string,start:number,end:number,key:'Enter'|'}'):TextEdit|undefined {
  const lineStart=start>0 ? value.lastIndexOf('\n',start-1)+1 : 0
  const before=value.slice(lineStart,start)
  if(key==='Enter') {
    const code=before.split('//')[0]
    let balance=0
    for(const c of code) {if(c==='{') balance++;if(c==='}') balance--}
    return {start,end,text:'\n'+' '.repeat(indentation(before)+Math.max(0,balance)*2)}
  }
  if(start!==end || !/^[ \t]+$/.test(before)) return
  const stack:number[]=[]
  for(const line of value.slice(0,lineStart).split('\n')) {
    let local=0
    for(const c of line.split('//')[0]) {
      if(c==='{') {stack.push(indentation(line)+local*2);local++}
      if(c==='}') {stack.pop();local=Math.max(0,local-1)}
    }
  }
  const target=stack.at(-1)
  const width=indentation(before)
  if(target===undefined || width<=target) return
  return {start:lineStart,end,text:' '.repeat(Math.max(target,width-2))+'}'}
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
