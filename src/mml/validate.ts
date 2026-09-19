import { MmlError, type Node, type Song } from './ast.ts'
interface State { octave: number; mode: boolean; previous: 'none' | 'note' | 'rest' | 'tie' }
interface Result { state: State; timed: boolean; forever: boolean; head: number; tail: number; max: number }
const LIMIT = 16384
// The semantic domain is finite (8 octaves × 2 mode states × 4 connection states).
// Memoized transitions prove loop safety without expanding notes or elapsed time.
export function validate(song: Song): void {
  const memo = new WeakMap<Node[], Map<string, Result>>()
  const inspect = (nodes: Node[]) => { for (const n of nodes) {
    if (n.kind === 'set' && n.command === '@e' && n.value !== 0 && !song.envelopes[n.value]) throw new MmlError(`エンベロープ${n.value}は未定義です`,n.pos)
    if (n.kind === 'set' && (n.command === '@lv' || n.command === '@lt') && n.value !== 0 && !song.lfos[n.command][n.value]) throw new MmlError(`undefined LFO: ${n.command},${n.value}`,n.pos)
    if (n.kind === 'macro' && !song.macros[n.name]) throw new MmlError(`undefined macro: $${n.name}$`,n.pos)
    if (n.kind === 'loop') inspect(n.body)
  } }
  // Validate the entire definition graph, including unused definitions, before execution.
  const visiting = new Set<string>(), depths = new Map<string,number>()
  const visit = (name: string, depth = 0): number => {
    const definition=song.macros[name]
    if (visiting.has(name)) throw new MmlError(`macro circular reference: $${name}$`,definition.pos)
    if (depth > 128) throw new MmlError('マクロの入れ子は128段までです',definition.pos)
    const cached=depths.get(name);if(cached !== undefined) return cached
    visiting.add(name);let height=1
    const refs=(nodes:Node[], nesting=0) => { for(const n of nodes) {
      if(n.kind === 'macro') height=Math.max(height,nesting+1+visit(n.name,depth+1))
      if(n.kind === 'loop') {height=Math.max(height,nesting+2);refs(n.body,nesting+1)}
    } }
    refs(definition.body);visiting.delete(name)
    if(height>128) throw new MmlError('マクロの入れ子は128段までです',definition.pos)
    depths.set(name,height);return height
  }
  for(const definition of Object.values(song.macros)) inspect(definition.body)
  for(const name of Object.keys(song.macros)) visit(name)
  const checkDepth=(nodes:Node[], nesting=0) => {for(const n of nodes) {
    if(n.kind === 'macro' && nesting+depths.get(n.name)!>128) throw new MmlError('マクロとループの入れ子は128段までです',n.pos)
    if(n.kind === 'loop') checkDepth(n.body,nesting+1)
  }}
  const run = (nodes: Node[], input: State, last = false): Result => {
    const key = JSON.stringify([input,last]); let cache = memo.get(nodes)
    if (!cache) { cache = new Map(); memo.set(nodes,cache) }
    const cached = cache.get(key); if (cached) return cached
    let state = {...input}, timed = false, forever = false, head = 0, tail = 0, max = 0
    const merge = (part: Result) => {
      max = Math.max(max,part.max,tail+part.head)
      if (!timed) head += part.head
      tail = part.timed ? part.tail : tail+part.tail
      timed ||= part.timed; forever ||= part.forever; state = {...part.state}
    }
    const octave = (n: Extract<Node,{kind:'set'}>) => {
      if (n.command === 'o') state.octave = n.value
      if (n.command === '>') state.octave += n.value
      if (n.command === '<') state.octave -= n.value
      if (state.octave < 1 || state.octave > 8) throw new MmlError('オクターブがo1～o8の範囲外です',n.pos)
    }
    for (const n of nodes) {
      if (n.kind === 'break' && last) break
      if (n.kind === 'macro') {
        merge({state,timed:false,forever:false,head:1,tail:1,max:1})
        merge(run(song.macros[n.name].body,state))
      } else if (n.kind === 'loop') {
        const seen = new Map<string, { iteration: number; timed: boolean }>()
        let iteration = 0
        while (n.count === 0 || iteration < n.count) {
          const final = n.count !== 0 && iteration === n.count-1
          const loopKey = JSON.stringify([state,final]); const old = seen.get(loopKey)
          if (old && n.count === 0) {
            if (!old.timed) throw new MmlError('時間が進まない無限ループです',n.pos)
            forever = true; break
          }
          // Finite counts are ≤255. Memoization makes nested finite loops bounded.
          merge({state,timed:false,forever:false,head:1,tail:1,max:1})
          const part = run(n.body,state,final)
          for (const value of seen.values()) value.timed ||= part.timed
          seen.set(loopKey,{iteration,timed:part.timed})
          merge(part); iteration++
          if (part.forever) break
        }
      } else {
        tail++; if (!timed) head++; max = Math.max(max,tail)
        if (n.kind === 'set') { octave(n); if (n.command === '@s') state.mode = true }
        if (n.kind === 'tie') {
          if (state.previous !== 'note') throw new MmlError('「&」の接続元には音符またはポルタメントが必要です',n.pos)
          state.previous = 'tie'
        }
        if (n.kind === 'note' || n.kind === 'portamento') {
          const isRest = n.kind === 'note' && n.note === null
          if (!isRest && !state.mode) throw new MmlError('発音前に@s,Nを指定してください',n.pos)
          if (n.kind === 'portamento') for (const p of n.pitches) if (p.kind === 'set') octave(p)
          state.previous = isRest ? 'rest' : 'note'; timed = true; tail = 0
        }
      }
      if (max > LIMIT) throw new MmlError(`同時刻の処理が多すぎます（上限${LIMIT}ステップ）`,n.pos)
      if (forever) break
    }
    const result = { state, timed, forever, head, tail, max }; cache.set(key,result); return result
  }
  for (const nodes of Object.values(song.tracks)) { inspect(nodes); checkDepth(nodes); run(nodes,{octave:4,mode:false,previous:'none'}) }
}
