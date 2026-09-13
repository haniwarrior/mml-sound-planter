import { parseSong, parseTest } from './parser.ts'
import { validate } from './validate.ts'
export function compile(main: string, test?: string) {
  const song=parseSong(main)
  if (test !== undefined) song.tracks={1:parseTest(test)}
  validate(song)
  return song
}
