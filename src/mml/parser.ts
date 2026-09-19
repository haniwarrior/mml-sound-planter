import { MmlError, type Lfo, type Command, type Envelope, type Node, type Pitch, type SetNode, type Song } from './ast.ts'
import { lex, type Token } from './lexer.ts'
const notes: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
class Parser {
  tokens: Token[]; i = 0; depth = 0
  constructor(source: string) { this.tokens = lex(source) }
  get token() { return this.tokens[this.i] }
  get text(): string { return this.token.text }
  error(message: string): never { throw new MmlError(message, this.token.pos) }
  take(text: string) { if (this.text !== text) this.error(`「${text}」が必要です`); return this.tokens[this.i++] }
  number(min: number, max: number, optional?: number): number {
    if (!/^\d+$/.test(this.text)) { if (optional !== undefined) return optional; this.error('整数が必要です') }
    const token = this.tokens[this.i++], n = Number(token.text)
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new MmlError(`値は${min}～${max}で指定してください`, token.pos)
    return n
  }
  pitch(): Pitch {
    const token = this.token; this.i++
    let note = notes[token.text]
    if (this.text === '+' || this.text === '-') { note += this.text === '+' ? 1 : -1; this.i++ }
    return { kind: 'pitch', note, pos: token.pos }
  }
  length() { const length = /^\d+$/.test(this.text) ? this.number(1, 128) : undefined; let dots = 0; while (this.text === '.') { this.i++; dots++ } return { length, dots } }
  set(): SetNode {
    const pos = this.token.pos; let command = this.text; this.i++
    if (command === '@') { command += this.text; this.i++; if (command === '@l') { command += this.text; this.i++ } }
    const ranges: Record<string, [number, number]> = { t: [1,255], o: [1,8], l: [1,128], v: [0,15], '@v': [0,127], q: [1,8], p: [0,8], '@d': [-16,16], '@s': [0,131], '@lv': [0,Number.MAX_SAFE_INTEGER], '@lt': [0,Number.MAX_SAFE_INTEGER], '@e': [0,Number.MAX_SAFE_INTEGER], '>': [0,Number.MAX_SAFE_INTEGER], '<': [0,Number.MAX_SAFE_INTEGER] }
    if (!(command in ranges)) throw new MmlError(`未知のコマンド「${command}」`, pos)
    if (['@s','@e','@lv','@lt'].includes(command)) this.take(',')
    let sign = 1
    if (command === '@d' && (this.text === '+' || this.text === '-')) { sign = this.text === '-' ? -1 : 1; this.i++ }
    const [min,max] = ranges[command]
    if (command === '@s' && (!/^\d+$/.test(this.text) || !(Number(this.text) <= 31 || (Number(this.text) >= 101 && Number(this.text) <= 131)))) this.error('invalid @s value: 0～31 または101～131で指定してください')
    const value = command === '@d' ? sign * this.number(0,16) : this.number(min,max,command === '>' || command === '<' ? 1 : undefined)
    return { kind: 'set', command: command as Command, value, pos }
  }
  body(end: string, inLoop = false): Node[] {
    const body: Node[] = []; let breaks = 0
    if (++this.depth > 128) this.error('構造の入れ子は128段までです')
    while (this.text !== end) {
      if (!this.text) this.error(`「${end}」が必要です`)
      const pos = this.token.pos
      if (this.text.startsWith('$')) { this.i++; if (this.text === '{') this.error('マクロ定義はtrack0のみ許可されています'); body.push({kind:'macro',name:this.tokens[this.i-1].text.slice(1,-1),pos}) }
      else if (this.text in notes) { const pitch = this.pitch(); body.push({ kind: 'note', note: pitch.note, ...this.length(), pos }) }
      else if (this.text === 'r') { this.i++; body.push({ kind: 'note', note: null, ...this.length(), pos }) }
      else if (this.text === '[') {
        this.i++; const children = this.body(']',true); this.take(']'); const count = this.number(0,255,2)
        if (count === 0 && children.some(n => n.kind === 'break')) throw new MmlError('無限ループに「:」は使用できません',pos)
        body.push({ kind: 'loop', body: children, count, pos })
      } else if (this.text === ':') {
        if (!inLoop || ++breaks > 1) this.error('「:」は1つのループ内に1個だけ使用できます')
        this.i++; body.push({ kind: 'break', pos })
      } else if (this.text === '&') { this.i++; body.push({ kind: 'tie', pos }) }
      else if (this.text === '(') {
        this.i++; const pitches: (Pitch | SetNode)[] = []
        while (this.token.text !== ')') {
          if (this.text in notes) pitches.push(this.pitch())
          else if (['o','>','<'].includes(this.text)) pitches.push(this.set())
          else this.error('invalid dotted portamento / ポルタメント内部には音符2個とオクターブ指定のみ記述できます')
        }
        this.take(')')
        if (pitches.filter(n=>n.kind === 'pitch').length !== 2) throw new MmlError('ポルタメントには音符がちょうど2個必要です',pos)
        body.push({ kind: 'portamento', pitches, ...this.length(), pos })
      } else body.push(this.set())
    }
    this.depth--; return body
  }
  song(): Song {
    const song: Song = { tracks: {}, envelopes: {}, macros: Object.create(null), lfos: {'@lv':{},'@lt':{}} }; const seen = new Set<number>()
    while (this.text) {
      this.take('track'); const pos = this.token.pos, track = this.number(0,11)
      if (seen.has(track)) throw new MmlError(`track${track}が重複しています`,pos)
      seen.add(track); this.take('{')
      if (track === 0) {
        while (this.text !== '}') {
          const pos = this.token.pos
          if (this.text.startsWith('$')) {
            const name=this.text.slice(1,-1);this.i++
            if (song.macros[name]) throw new MmlError(`duplicate macro: $${name}$`,pos)
            this.take('{');const body=this.body('}');this.take('}');song.macros[name]={body,pos};continue
          }
          this.take('@')
          if (this.text === 'l') {
            this.i++;const kind=this.token.text === 'v' ? '@lv' : this.token.text === 't' ? '@lt' : undefined
            if (!kind) this.error('invalid LFO parameter: @lv または @ltが必要です')
            this.i++
            try {
              this.take(',');const id=this.number(1,Number.MAX_SAFE_INTEGER)
              if (song.lfos[kind][id]) throw new MmlError(`duplicate LFO definition: ${kind},${id}`,pos)
              this.take('{');const depth=this.number(0,127);this.take(',');const period=this.number(1,255);this.take(',');const delay=this.number(0,255);this.take(',')
              const direction=this.token.text;if (direction !== '+' && direction !== '-') this.error('Directionは+または-です');this.i++;this.take(',')
              const mode=this.token.text;if (mode !== 'r' && mode !== 'h') this.error('Modeはrまたはhです');this.i++;this.take('}')
              song.lfos[kind][id]={depth,period,delay,direction,mode} as Lfo
            } catch (error) {
              if (error instanceof MmlError && !error.message.startsWith('duplicate LFO')) throw new MmlError(`invalid LFO parameter: ${error.message}`,error.position)
              throw error
            }
            continue
          }
          this.take('e'); this.take(','); const id = this.number(1,Number.MAX_SAFE_INTEGER)
          if (song.envelopes[id]) throw new MmlError(`エンベロープ${id}が重複しています`,pos)
          this.take('{'); const values = [31,31,31,15,15,3].map((max,i)=> { if (i) this.take(','); return this.number(0,max) }); this.take('}')
          song.envelopes[id] = values as Envelope
        }
      } else song.tracks[track] = this.body('}')
      this.take('}')
    }
    if (!seen.has(0)) this.error('track0が必要です')
    return song
  }
}
export const parseSong = (source: string): Song => new Parser(source).song()
export const parseTest = (source: string): Node[] => new Parser(source).body('')
