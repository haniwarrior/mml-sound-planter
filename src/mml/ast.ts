export type SourceId = 'main' | 'test'
export interface Position { source?: SourceId; end?: number; offset: number; line: number; column: number }
export class MmlError extends Error {
  position: Position
  constructor(message: string, position: Position) { super(message); this.name = 'MmlError'; this.position = position }
}
export type Envelope = [number, number, number, number, number, number]
export type Command = 't' | 'o' | '>' | '<' | 'l' | 'v' | '@v' | 'q' | 'p' | '@d' | '@s' | '@e' | '@lv' | '@lt' | '@f' | '@w'
export interface Pitch { kind: 'pitch'; note: number; pos: Position }
export interface SetNode { kind: 'set'; command: Command; value: number; pos: Position }
export interface Lfo { depth: number; period: number; delay: number; mode: 0 | 1 }
export interface FmOperator { ar:number; dr:number; sr:number; rr:number; sl:number; tl:number; ks:number; ml:number; dt1:number; dt2:number }
export interface FmTone { algorithm:number; feedback:number; operators:[FmOperator,FmOperator,FmOperator,FmOperator] }
export type Macros = Record<string, { body: Node[]; pos: Position }>
export type Lfos = Record<'@lv' | '@lt', Record<number, Lfo>>
export type Node = SetNode
  | { kind: 'macro'; name: string; pos: Position }
  | { kind: 'note'; note: number | null; length?: number; dots: number; pos: Position }
  | { kind: 'portamento'; pitches: (Pitch | SetNode)[]; length?: number; dots: number; pos: Position }
  | { kind: 'loop'; body: Node[]; count: number; pos: Position }
  | { kind: 'break' | 'tie'; pos: Position }
export type WaveTone = readonly number[]
export interface Song { waveTones: Record<number,WaveTone>; fmTones: Record<number,FmTone>; macros: Macros; lfos: Lfos; envelopes: Record<number, Envelope>; tracks: Record<number, Node[]> }
