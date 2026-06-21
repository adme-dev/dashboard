import { describe, it, expect, vi } from 'vitest'
import { buildDistillPrompt, parseDistillResponse, distill, MAX_CANDIDATES, PARSE_LIMIT } from '~~/server/utils/ai/memory/distill'

const turn = { userMessage: 'I always report Acme in AUD', assistantMessage: 'Noted.' }

describe('buildDistillPrompt', () => {
  it('includes the turn text and asks for a JSON array', () => {
    const p = buildDistillPrompt(turn)
    expect(p).toContain('I always report Acme in AUD')
    expect(p).toContain('JSON array')
  })
})

describe('parseDistillResponse', () => {
  it('parses a clean array', () => {
    const out = parseDistillResponse('[{"memType":"semantic","content":"reports Acme in AUD","salience":0.8}]')
    expect(out).toEqual([{ memType: 'semantic', content: 'reports Acme in AUD', salience: 0.8 }])
  })

  it('extracts an array embedded in prose', () => {
    const out = parseDistillResponse('Sure! Here you go:\n[{"content":"prefers ROAS"}]\nHope that helps')
    expect(out).toEqual([{ memType: 'semantic', content: 'prefers ROAS', salience: 0.5 }]) // defaults applied
  })

  it('malformed JSON → []', () => {
    expect(parseDistillResponse('[{not json}]')).toEqual([])
    expect(parseDistillResponse('no array here')).toEqual([])
    expect(parseDistillResponse('')).toEqual([])
  })

  it('non-array JSON → []', () => {
    expect(parseDistillResponse('{"content":"x"}')).toEqual([])
  })

  it('defaults bad memType to semantic, clamps salience, drops empties', () => {
    const out = parseDistillResponse('[{"memType":"bogus","content":"a","salience":9},{"content":"  "},{"content":"b","salience":-3}]')
    expect(out).toEqual([
      { memType: 'semantic', content: 'a', salience: 1 },
      { memType: 'semantic', content: 'b', salience: 0 },
    ])
  })

  it('bounds runaway output at PARSE_LIMIT (not the post-dedup yield cap)', () => {
    const many = JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ content: `c${i}` })))
    expect(parseDistillResponse(many)).toHaveLength(PARSE_LIMIT)
  })
})

describe('distill', () => {
  it('returns parsed candidates from the injected completion', async () => {
    const complete = vi.fn().mockResolvedValue('[{"memType":"semantic","content":"reports Acme in AUD","salience":0.8}]')
    const out = await distill(turn, [], { complete })
    expect(out).toEqual([{ memType: 'semantic', content: 'reports Acme in AUD', salience: 0.8 }])
  })

  it('is fail-safe: a throwing completion → []', async () => {
    const out = await distill(turn, [], { complete: vi.fn().mockRejectedValue(new Error('model down')) })
    expect(out).toEqual([])
  })

  it('dedups against existing memory contents (case/space-insensitive)', async () => {
    const complete = vi.fn().mockResolvedValue('[{"content":"Reports Acme In AUD"},{"content":"prefers ROAS"}]')
    const out = await distill(turn, ['  reports acme in aud '], { complete })
    expect(out.map(c => c.content)).toEqual(['prefers ROAS'])
  })

  it('yields up to MAX_CANDIDATES NOVEL memories even when earlier ones dedup away (finding #8)', async () => {
    // 3 of the first items duplicate existing memory; novel #4/#5 must still be kept, not pre-dropped.
    const complete = vi.fn().mockResolvedValue(JSON.stringify([
      { content: 'dup a' }, { content: 'dup b' }, { content: 'dup c' },
      { content: 'novel d' }, { content: 'novel e' },
    ]))
    const out = await distill(turn, ['dup a', 'dup b', 'dup c'], { complete })
    expect(out.map(c => c.content)).toEqual(['novel d', 'novel e'])
    expect(out.length).toBeLessThanOrEqual(MAX_CANDIDATES)
  })
})
