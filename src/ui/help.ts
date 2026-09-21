import { installDetailDrag } from './detail-drag.ts'
import { orderedCommands, type CommandHelp } from './commands.ts'

export function installCommandHelp() {
  const drawer=document.createElement('div');drawer.className='command-drawer'
  const toggle=document.createElement('button');toggle.className='command-toggle';toggle.textContent='⌘'
  toggle.type='button';toggle.setAttribute('aria-label','コマンド一覧を開閉');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','command-panel')
  const panel=document.createElement('aside');panel.id='command-panel';panel.className='command-panel';panel.setAttribute('aria-label','MMLコマンド一覧');panel.inert=true
  const title=document.createElement('h2');title.textContent='コマンド一覧';panel.append(title)
  const detail=document.createElement('section');detail.className='command-detail';detail.hidden=true
  detail.setAttribute('role','dialog');detail.setAttribute('aria-modal','false');detail.setAttribute('aria-labelledby','command-detail-title')
  const close=document.createElement('button');close.type='button';close.className='detail-close';close.textContent='×';close.setAttribute('aria-label','詳細を閉じる')
  const heading=document.createElement('h2');heading.id='command-detail-title'
  const text=document.createElement('pre');text.className='command-explanation'
  const header=document.createElement('header');header.className='command-detail-header';header.append(heading,close)
  const body=document.createElement('div');body.className='command-detail-body';body.append(text)
  detail.append(header,body)
  const resetPosition=installDetailDrag(detail,header)
  let trigger:HTMLButtonElement|undefined
  const show=(command:CommandHelp,button:HTMLButtonElement)=>{
    trigger=button;heading.textContent=`${command.symbol}　${command.label}`;text.textContent=command.detail
    resetPosition();detail.hidden=false;body.scrollTop=0;close.focus({preventScroll:true})
  }
  const hide=()=>{detail.hidden=true;if(trigger && !panel.inert) trigger.focus({preventScroll:true});else toggle.focus({preventScroll:true})}
  for(const [section,label] of [['definition','定義'],['performance','演奏']] as const) {
    const h=document.createElement('h3');h.textContent=label;panel.append(h)
    const list=document.createElement('ul')
    for(const command of orderedCommands(section)) {
      const li=document.createElement('li'),button=document.createElement('button'),symbol=document.createElement('code'),label=document.createElement('span')
      button.type='button';symbol.textContent=command.symbol;label.textContent=command.label;button.append(symbol,label)
      button.addEventListener('click',()=>show(command,button));li.append(button);list.append(li)
    }
    panel.append(list)
  }
  let isOpen=false
  const setOpen=(open:boolean)=>{
    isOpen=open;drawer.classList.toggle('open',open);panel.inert=!open;toggle.setAttribute('aria-expanded',String(open))
  }
  toggle.addEventListener('click',()=>setOpen(!isOpen))
  close.addEventListener('click',hide)
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape' || event.isComposing || document.querySelector('dialog[open]')) return
    if(!detail.hidden) {event.preventDefault();hide()}
    else if(!panel.inert) {setOpen(false);toggle.focus({preventScroll:true})}
  })
  drawer.append(panel,toggle)
  document.body.append(drawer,detail)
}
