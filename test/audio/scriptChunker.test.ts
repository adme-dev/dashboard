import { describe, expect, it } from 'vitest'
import { chunkVoiceoverScript } from '~~/server/utils/audio/scriptChunker'

describe('chunkVoiceoverScript', () => {
  it('groups sentence-aware chunks without exceeding maxChars when possible', () => {
    expect(chunkVoiceoverScript(
      'Start with the offer. Then show the vehicle. Close with a clear call to action.',
      { maxChars: 45 }
    )).toEqual([
      { index: 0, text: 'Start with the offer. Then show the vehicle.' },
      { index: 1, text: 'Close with a clear call to action.' }
    ])
  })

  it('preserves bracketed expressive tags with the spoken sentence', () => {
    expect(chunkVoiceoverScript(
      '[excited] The new Eclipse Cross is here. [pause] Book your test drive today.',
      { maxChars: 48 }
    )).toEqual([
      { index: 0, text: '[excited] The new Eclipse Cross is here.' },
      { index: 1, text: '[pause] Book your test drive today.' }
    ])
  })

  it('does not split common abbreviations as sentence boundaries', () => {
    expect(chunkVoiceoverScript(
      'Dr. Smith approved the offer at 10 a.m. It runs on Jan. 31 only.',
      { maxChars: 80 }
    )).toEqual([
      { index: 0, text: 'Dr. Smith approved the offer at 10 a.m. It runs on Jan. 31 only.' }
    ])
  })

  it('handles CJK sentence punctuation', () => {
    expect(chunkVoiceoverScript(
      '今すぐ予約しましょう。週末限定です！詳しくは店舗までお問い合わせください。',
      { maxChars: 24 }
    )).toEqual([
      { index: 0, text: '今すぐ予約しましょう。週末限定です！' },
      { index: 1, text: '詳しくは店舗までお問い合わせください。' }
    ])
  })

  it('splits oversized sentences at word boundaries', () => {
    expect(chunkVoiceoverScript(
      'This sentence has several words and no early punctuation before the limit.',
      { maxChars: 24 }
    )).toEqual([
      { index: 0, text: 'This sentence has' },
      { index: 1, text: 'several words and no' },
      { index: 2, text: 'early punctuation before' },
      { index: 3, text: 'the limit.' }
    ])
  })
})
