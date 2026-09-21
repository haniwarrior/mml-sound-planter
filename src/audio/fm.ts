import type { Envelope, FmOperator, FmTone } from '../mml/ast.ts'
import { EnvelopeGenerator } from './envelope.ts'
import { keyCode, OPM_CLOCK_HZ } from './opm-rates.ts'

// Logical order throughout: 0=M1, 1=C1, 2=M2, 3=C2.
// Connection topology, DT1 table and feedback scale adapted from ymfm (BSD-3-Clause).
// See THIRD_PARTY_NOTICES.md. Operator outputs are normalized to [-1,1].
export function fmAlgorithm(algorithm:number, op:(index:number, modulation:number)=>number, feedback:number):number {
  const a=op(0,feedback)
  let b:number,c:number,d:number
  switch(algorithm) {
    case 0: b=op(1,a);c=op(2,b);return op(3,c)
    case 1: b=op(1,0);c=op(2,a+b);return op(3,c)
    case 2: b=op(1,0);c=op(2,b);return op(3,a+c)
    case 3: b=op(1,a);c=op(2,0);return op(3,b+c)
    case 4: b=op(1,a);c=op(2,0);d=op(3,c);return b+d
    case 5: b=op(1,a);c=op(2,a);d=op(3,a);return b+c+d
    case 6: b=op(1,a);c=op(2,0);d=op(3,0);return b+c+d
    case 7: b=op(1,0);c=op(2,0);d=op(3,0);return a+b+c+d
    default: throw new Error('invalid FM algorithm')
  }
}
const DT1 = [
  [0,0,1,2],[0,0,1,2],[0,0,1,2],[0,0,1,2],
  [0,1,2,2],[0,1,2,3],[0,1,2,3],[0,1,2,3],
  [0,1,2,4],[0,1,3,4],[0,1,3,4],[0,1,3,5],
  [0,2,4,5],[0,2,4,6],[0,2,4,6],[0,2,5,7],
  [0,2,5,8],[0,3,6,8],[0,3,6,9],[0,3,7,10],
  [0,4,8,11],[0,4,8,12],[0,4,9,13],[0,5,10,14],
  [0,5,11,16],[0,6,12,17],[0,6,13,19],[0,7,14,20],
  [0,8,16,22],[0,8,16,22],[0,8,16,22],[0,8,16,22],
]
const DT2_CENTS=[0,600,781,950]
export function fmFrequency(pitch:number, op:FmOperator):number {
  const fine=DT1[keyCode(pitch)][op.dt1&3]*(op.dt1&4 ? -1 : 1)*OPM_CLOCK_HZ/64/2**20
  return Math.max(0,440*2**((pitch-69+DT2_CENTS[op.dt2]/100)/12)+fine)*(op.ml===0 ? .5 : op.ml)
}
// feedback is passed through the same 4-cycle modulation input as other operators.
export function fmFeedback(previous:number, older:number, amount:number):number {
  return amount===0 ? 0 : (previous+older)*2**(amount-9)
}
interface Operator { phase:number; envelope:EnvelopeGenerator; definition:Envelope; level:number }
export class FmGenerator {
  private tone?:FmTone
  private operators:Operator[]=[]
  private previous=0;private older=0;private currentM1=0
  private time=0;private pitch=60
  private sampleRate:number
  constructor(sampleRate:number) {this.sampleRate=sampleRate}
  start(tone:FmTone,pitch:number,time:number,connected:boolean) {
    this.tone=tone
    for(let i=0;i<4;i++) {
      const p=tone.operators[i],definition:Envelope=[p.ar,p.dr,p.sr,p.rr,p.sl,p.ks]
      let op=this.operators[i]
      if(!op) op=this.operators[i]={phase:0,envelope:new EnvelopeGenerator(definition,pitch,time),definition,level:1}
      else op.envelope.sample(time)
      op.definition=definition;op.level=2**(-p.tl/8)
      op.envelope.configure(definition,pitch)
      if(!connected) {op.phase=0;op.envelope.keyOn()}
    }
    if(!connected) this.previous=this.older=0
  }
  keyOff() {for(const op of this.operators) op.envelope.keyOff()}
  private operator=(index:number,modulation:number):number=>{
    const op=this.operators[index]
    op.envelope.configure(op.definition,this.pitch)
    const value=Math.sin(2*Math.PI*(op.phase+4*modulation))*op.envelope.sample(this.time)*op.level
    op.phase=(op.phase+fmFrequency(this.pitch,this.tone!.operators[index])/this.sampleRate)%1
    if(index===0) this.currentM1=value
    return value
  }
  sample(time:number,pitch:number):number {
    if(!this.tone) return 0
    this.time=time;this.pitch=pitch
    const value=fmAlgorithm(this.tone.algorithm,this.operator,fmFeedback(this.previous,this.older,this.tone.feedback))
    this.older=this.previous;this.previous=this.currentM1
    // Fixed headroom for four carriers; avoids changing modulation indices or clipping.
    return value/4
  }
  get silent() {return this.operators.every(op=>op.envelope.silent)}
}
