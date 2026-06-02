import { describe, it, expect, vi } from 'vitest'
import { buildEnrichmentPrompt, parseEnrichmentResponse, enrichUnenriched } from '~~/server/utils/socialListening/enrich'

describe('buildEnrichmentPrompt', () => {
  it('includes each mention id + text and asks for strict JSON', () => {
    const p = buildEnrichmentPrompt([
      { id: 'm1', text: 'love the acme widget' },
      { id: 'm2', text: 'acme support is terrible' },
    ])
    expect(p).toContain('m1'); expect(p).toContain('m2')
    expect(p).toContain('love the acme widget')
    expect(p.toLowerCase()).toContain('json')
  })
})

describe('parseEnrichmentResponse', () => {
  it('parses a clean JSON array into an id→{sentiment,topics} map', () => {
    const out = parseEnrichmentResponse('[{"id":"m1","sentiment":"positive","topics":["product","quality"]}]')
    expect(out.m1).toEqual({ sentiment: 'positive', topics: ['product', 'quality'] })
  })
  it('tolerates code fences / prose around the JSON', () => {
    const out = parseEnrichmentResponse('Here you go:\n```json\n[{"id":"m2","sentiment":"negative","topics":["support"]}]\n```')
    expect(out.m2.sentiment).toBe('negative')
  })
  it('coerces invalid sentiment to unknown and caps/cleans topics', () => {
    const out = parseEnrichmentResponse('[{"id":"m3","sentiment":"meh","topics":["a","a","b","c","d","e","f"]}]')
    expect(out.m3.sentiment).toBe('unknown')
    expect(out.m3.topics.length).toBeLessThanOrEqual(5)
    expect(out.m3.topics).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
  it('returns {} for unparseable input (fail-safe)', () => {
    expect(parseEnrichmentResponse('not json at all')).toEqual({})
    expect(parseEnrichmentResponse('')).toEqual({})
  })
})

describe('enrichUnenriched', () => {
  const rows = [{ id: 'm1', title: null, content: 'love acme' }, { id: 'm2', title: null, content: 'hate acme' }]
  it('stamps every batch row on a successful groq call (parsed → value, missing → unknown)', async () => {
    const updates: any[] = []
    const db = {
      queryRows: vi.fn(async () => rows),
      execute: vi.fn(async (_sql: string, params?: any[]) => { updates.push(params); return 1 }),
    }
    const groq = vi.fn(async () => '[{"id":"m1","sentiment":"positive","topics":["x"]}]')
    const n = await enrichUnenriched(db, groq, 20)
    expect(n).toBe(2)
    expect(updates.find(p => p[2] === 'm1')[0]).toBe('positive')
    expect(updates.find(p => p[2] === 'm2')[0]).toBe('unknown')
  })
  it('enriches nothing and stamps nothing when groq throws', async () => {
    const db = { queryRows: vi.fn(async () => rows), execute: vi.fn(async () => 1) }
    const groq = vi.fn(async () => { throw new Error('groq down') })
    expect(await enrichUnenriched(db, groq, 20)).toBe(0)
    expect(db.execute).not.toHaveBeenCalled()
  })
  it('no-ops on an empty queue', async () => {
    const db = { queryRows: vi.fn(async () => []), execute: vi.fn(async () => 1) }
    expect(await enrichUnenriched(db, vi.fn(), 20)).toBe(0)
  })
})
