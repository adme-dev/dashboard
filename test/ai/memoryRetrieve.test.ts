import { describe, it, expect } from 'vitest'
import { recency, scoreMemory, estimateTokens, selectTopMemories, TYPE_WEIGHT } from '~~/server/utils/ai/memory/retrieve'
import type { UserMemory } from '~~/server/utils/ai/memory/types'

const NOW = new Date('2026-06-19T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

const mem = (over: Partial<UserMemory> = {}): UserMemory => ({
  id: 'm', user_id: 'u1', scope: 'user', mem_type: 'semantic', content: 'fact',
  source: 'inferred', salience: 1, embedding_id: null, metadata: {},
  last_used_at: NOW.toISOString(), created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...over,
})

describe('recency', () => {
  it('null → 0.5 neutral, now → 1', () => {
    expect(recency(null, NOW)).toBe(0.5)
    expect(recency(NOW.toISOString(), NOW)).toBe(1)
  })
  it('decays by half every 30 days', () => {
    expect(recency(daysAgo(30), NOW)).toBeCloseTo(0.5, 5)
    expect(recency(daysAgo(60), NOW)).toBeCloseTo(0.25, 5)
  })
})

describe('scoreMemory', () => {
  it('applies type weight × salience × recency × vectorScore', () => {
    // semantic, salience 1, recency 1 (last_used = now), vectorScore 1 → 0.6
    expect(scoreMemory(mem({ mem_type: 'semantic' }), 1, NOW)).toBeCloseTo(TYPE_WEIGHT.semantic, 5)
    // procedural weight is lowest
    expect(scoreMemory(mem({ mem_type: 'procedural' }), 1, NOW)).toBeCloseTo(TYPE_WEIGHT.procedural, 5)
    // salience halves the score
    expect(scoreMemory(mem({ mem_type: 'semantic', salience: 0.5 }), 1, NOW)).toBeCloseTo(0.3, 5)
  })
})

describe('estimateTokens', () => {
  it('~4 chars per token, rounded up', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
  })
})

describe('selectTopMemories', () => {
  it('ranks by score and caps at maxCount', () => {
    const cands = [
      { memory: mem({ id: 'lo', mem_type: 'procedural' }), vectorScore: 0.5 },
      { memory: mem({ id: 'hi', mem_type: 'semantic' }), vectorScore: 1 },
      { memory: mem({ id: 'mid', mem_type: 'episodic' }), vectorScore: 1 },
    ]
    const out = selectTopMemories(cands, NOW, { maxCount: 2 })
    expect(out.map(o => o.memory.id)).toEqual(['hi', 'mid'])
  })

  it('respects the token budget, skipping over-budget items for smaller ones', () => {
    const big = mem({ id: 'big', content: 'x'.repeat(800) })   // ~200 tokens
    const small = mem({ id: 'small', content: 'tiny' })          // ~1 token
    // big ranks higher (same score) but blows a 50-token budget → skipped; small fits
    const out = selectTopMemories(
      [{ memory: big, vectorScore: 1 }, { memory: small, vectorScore: 0.9 }],
      NOW, { maxTokens: 50 },
    )
    expect(out.map(o => o.memory.id)).toEqual(['small'])
  })

  it('empty candidates → empty', () => {
    expect(selectTopMemories([], NOW)).toEqual([])
  })
})
