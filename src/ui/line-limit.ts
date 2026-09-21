import { LINE_LIMIT_MESSAGE, MAX_LINES, lineCount } from './editor-model.ts'
export const exceedsLineLimit=(main:string,test?:string)=>lineCount(main)>MAX_LINES || (test!==undefined && lineCount(test)>MAX_LINES)
export function createLineLimitDialog():()=>void {
  const dialog=document.createElement('dialog');dialog.className='line-limit-dialog';dialog.setAttribute('aria-labelledby','line-limit-title');dialog.setAttribute('aria-describedby','line-limit-message')
  const title=document.createElement('h2');title.id='line-limit-title';title.textContent='行数の上限を超えています'
  const message=document.createElement('p');message.id='line-limit-message';message.textContent=LINE_LIMIT_MESSAGE
  const close=document.createElement('button');close.type='button';close.textContent='閉じる';close.addEventListener('click',()=>dialog.close())
  dialog.append(title,message,close);document.body.append(dialog)
  return ()=>{if(!dialog.open) dialog.showModal()}
}
