/** Keep the entire window inside the viewport, including its header. */
export function clampDetailPosition(x:number,y:number,width:number,height:number,viewportWidth:number,viewportHeight:number) {
  const margin=8
  return {
    x:Math.max(margin,Math.min(x,viewportWidth-width-margin)),
    y:Math.max(margin,Math.min(y,viewportHeight-height-margin)),
  }
}

export function installDetailDrag(detail:HTMLElement,header:HTMLElement) {
  const enabled=window.matchMedia('(min-width:751px) and (pointer:fine)')
  let drag:{id:number;x:number;y:number;left:number;top:number}|undefined
  let moved=false
  const stop=()=>{
    const id=drag?.id
    drag=undefined;header.classList.remove('dragging')
    if(id!==undefined && header.hasPointerCapture(id)) header.releasePointerCapture(id)
  }
  const reset=()=>{
    stop();moved=false
    for(const property of ['left','top','right','bottom']) detail.style.removeProperty(property)
  }
  const position=(x:number,y:number)=>{
    const rect=detail.getBoundingClientRect()
    const point=clampDetailPosition(x,y,rect.width,rect.height,window.innerWidth,window.innerHeight)
    Object.assign(detail.style,{left:`${point.x}px`,top:`${point.y}px`,right:'auto',bottom:'auto'})
  }
  header.addEventListener('pointerdown',event=>{
    if(!enabled.matches || !event.isPrimary || event.button!==0 || (event.target as Element).closest('button')) return
    const rect=detail.getBoundingClientRect()
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top}
    header.setPointerCapture(event.pointerId);header.classList.add('dragging');event.preventDefault()
  })
  header.addEventListener('pointermove',event=>{
    if(!drag || event.pointerId!==drag.id) return
    position(drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y);moved=true
  })
  for(const type of ['pointerup','pointercancel','lostpointercapture']) header.addEventListener(type,stop)
  const resize=()=>{
    stop()
    if(!enabled.matches) reset()
    else if(moved && !detail.hidden) {
      const rect=detail.getBoundingClientRect();position(rect.left,rect.top)
    }
  }
  window.addEventListener('resize',resize)
  enabled.addEventListener('change',resize)
  return reset
}
