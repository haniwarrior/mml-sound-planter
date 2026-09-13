import type { Command, Node, Position } from './ast.ts'
export interface MmlState { tempo: number; octave: number; length: number; volume: number; gate: number; pan: number; detune: number; mode: number; envelope: number }
export const initialState = (): MmlState => ({tempo:128,octave:4,length:4,volume:96,gate:8,pan:4,detune:0,mode:0,envelope:0})
export interface TimedEvent {
  time: number; duration: number; gate: number; pitch: number | null; endPitch: number | null
  connected: boolean; continues: boolean; state: MmlState; pos: Position
}
function* walk(nodes: Node[], last = false): Generator<Exclude<Node,{kind:'loop'}>> {
  for (const n of nodes) {
    if (n.kind === 'break') { if (last) return; continue }
    if (n.kind === 'loop') { for (let i = 0; n.count === 0 || i < n.count; i++) yield* walk(n.body,n.count !== 0 && i === n.count-1) }
    else yield n
  }
}
export function apply(state: MmlState, command: Command, value: number) {
  switch (command) {
    case 't': state.tempo=value; break; case 'o': state.octave=value; break
    case '>': state.octave+=value; break; case '<': state.octave-=value; break
    case 'l': state.length=value; break; case 'v': state.volume=value*8; break
    case '@v': state.volume=value; break; case 'q': state.gate=value; break
    case 'p': state.pan=value; break; case '@d': state.detune=value; break
    case '@s': state.mode=value; break; case '@e': state.envelope=value; break
  }
}
// One-event lookahead resolves & across structural commands without text expansion.
export class Sequencer {
  state = initialState(); time = 0
  private iterator: ReturnType<typeof walk>; private pending?: TimedEvent; private ended = false
  constructor(nodes: Node[]) { this.iterator=walk(nodes) }
  private read(): { event?: TimedEvent; tie: boolean } {
    let tie = false
    while (true) {
      const item=this.iterator.next()
      if(item.done) break
      const n=item.value
      if (n.kind === 'tie') { tie=true; continue }
      if (n.kind === 'set') { apply(this.state,n.command,n.value); continue }
      if (n.kind !== 'note' && n.kind !== 'portamento') continue
      const pitches: number[] = []
      if (n.kind === 'portamento') for (const p of n.pitches) {
        if (p.kind === 'set') apply(this.state,p.command,p.value)
        else pitches.push((this.state.octave+1)*12+p.note)
      }
      const pitch = n.kind === 'note' ? n.note === null ? null : (this.state.octave+1)*12+n.note : pitches[0]
      const duration = 240 / this.state.tempo / (n.length ?? this.state.length) * (2-Math.pow(2,-n.dots))
      const event: TimedEvent = {time:this.time,duration,gate:duration*this.state.gate/8,pitch,endPitch:n.kind === 'portamento' ? pitches[1] : pitch,connected:false,continues:false,state:{...this.state},pos:n.pos}
      this.time+=duration; return {event,tie}
    }
    return {tie}
  }
  next(): TimedEvent | undefined {
    if (this.ended) return undefined
    if (!this.pending) this.pending=this.read().event
    if (!this.pending) { this.ended=true; return undefined }
    const current=this.pending, next=this.read()
    current.continues=next.tie && current.pitch !== null && next.event?.pitch !== null && next.event !== undefined
    if (next.tie && current.pitch !== null) current.gate=current.duration
    if (next.event) next.event.connected=current.continues
    this.pending=next.event; if (!this.pending) this.ended=true
    return current
  }
}
