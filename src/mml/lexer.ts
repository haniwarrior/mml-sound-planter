import { MmlError, type Position } from './ast.ts'
export interface Token { text: string; pos: Position }
// Trivia is consumed in place: every token retains its original source coordinates.
export function lex(source: string): Token[] {
  const tokens: Token[] = []
  let offset = 0, line = 1, column = 1
  const advance = () => { const c = source[offset++]; if (c === '\n') { line++; column = 1 } else column++; return c }
  while (offset < source.length) {
    if (/\s/.test(source[offset])) { advance(); continue }
    if (source.slice(offset, offset + 2) === '//') { while (offset < source.length && source[offset] !== '\n') advance(); continue }
    const pos = { offset, line, column }
    let text = advance().toLowerCase()
    if (text === '$') {
      while (offset < source.length && source[offset] !== '$' && source[offset] !== '\n') text += advance().toLowerCase()
      if (source[offset] !== '$') throw new MmlError('invalid macro name: $で閉じてください', pos)
      text += advance()
      if (!/^\$[a-z0-9_+\-]{1,16}\$$/.test(text)) throw new MmlError('invalid macro name: 1～16文字の英数字・_・+・-で指定してください', pos)
    } else if (/\d/.test(text)) { while (/\d/.test(source[offset] ?? '')) text += advance() }
    else if (text === 't' && source.slice(offset, offset + 4).toLowerCase() === 'rack') { for (let i = 0; i < 4; i++) text += advance().toLowerCase() }
    else if (!/[a-z@{},.\[\]:&()+<>-]/.test(text)) throw new MmlError(`未知の文字「${text}」`, pos)
    tokens.push({ text, pos })
  }
  tokens.push({ text: '', pos: { offset, line, column } })
  return tokens
}
