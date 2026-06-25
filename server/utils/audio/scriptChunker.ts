export interface VoiceoverScriptChunk {
  index: number
  text: string
}

export interface ChunkVoiceoverScriptOptions {
  maxChars?: number
}

const DEFAULT_MAX_CHARS = 900
const SENTENCE_END = new Set(['.', '!', '?', '。', '！', '？'])
const CJK_SENTENCE_END = new Set(['。', '！', '？'])
const ABBREVIATIONS = new Set([
  'dr.',
  'mr.',
  'mrs.',
  'ms.',
  'prof.',
  'sr.',
  'jr.',
  'st.',
  'vs.',
  'etc.',
  'e.g.',
  'i.e.',
  'a.m.',
  'p.m.',
  'jan.',
  'feb.',
  'mar.',
  'apr.',
  'jun.',
  'jul.',
  'aug.',
  'sep.',
  'sept.',
  'oct.',
  'nov.',
  'dec.'
])

export function chunkVoiceoverScript(script: string, options: ChunkVoiceoverScriptOptions = {}): VoiceoverScriptChunk[] {
  const maxChars = Math.max(1, Math.floor(options.maxChars ?? DEFAULT_MAX_CHARS))
  const sentences = splitSentences(script)
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      chunks.push(...splitOversizedSentence(sentence, maxChars))
      continue
    }

    const candidate = current ? `${current}${sentenceJoiner(current, sentence)}${sentence}` : sentence
    if (candidate.length <= maxChars) {
      current = candidate
    } else {
      if (current) chunks.push(current)
      current = sentence
    }
  }

  if (current) chunks.push(current)
  return chunks.map((text, index) => ({ index, text }))
}

function splitSentences(script: string): string[] {
  const normalized = script.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const sentences: string[] = []
  let start = 0

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    if (!SENTENCE_END.has(char)) continue
    if (char === '.' && isAbbreviationAt(normalized, index)) continue

    const next = normalized[index + 1]
    const atBoundary = !next || /\s/.test(next) || CJK_SENTENCE_END.has(char)
    if (!atBoundary) continue

    const sentence = normalized.slice(start, index + 1).trim()
    if (sentence) sentences.push(sentence)

    start = index + 1
    while (normalized[start] === ' ') start += 1
  }

  const tail = normalized.slice(start).trim()
  if (tail) sentences.push(tail)
  return sentences
}

function isAbbreviationAt(text: string, periodIndex: number): boolean {
  const prefix = text.slice(0, periodIndex + 1).toLowerCase()
  const match = prefix.match(/(?:^|\s)([a-z](?:\.[a-z])?\.|[a-z]{2,5}\.)$/)
  return Boolean(match?.[1] && ABBREVIATIONS.has(match[1]))
}

function splitOversizedSentence(sentence: string, maxChars: number): string[] {
  const words = sentence.split(/\s+/).filter(Boolean)
  if (words.length <= 1) return splitHard(sentence, maxChars)

  const chunks: string[] = []
  let current = ''

  for (const word of words) {
    if (word.length > maxChars) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      chunks.push(...splitHard(word, maxChars))
      continue
    }

    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars) {
      current = candidate
    } else {
      if (current) chunks.push(current)
      current = word
    }
  }

  if (current) chunks.push(current)
  return chunks
}

function sentenceJoiner(left: string, right: string): string {
  return /[。！？]$/.test(left) && isNonAscii(right.charAt(0)) ? '' : ' '
}

function isNonAscii(value: string): boolean {
  return value ? value.charCodeAt(0) > 127 : false
}

function splitHard(value: string, maxChars: number): string[] {
  const chunks: string[] = []
  for (let index = 0; index < value.length; index += maxChars) {
    chunks.push(value.slice(index, index + maxChars))
  }
  return chunks
}
