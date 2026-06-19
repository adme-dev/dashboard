import { describe, it, expect } from 'vitest'
import { resolveSearchArgs } from '~~/server/utils/aiVectorize'

const fakeEvent = { context: {} } as any

describe('resolveSearchArgs', () => {
  it('string form: (query) defaults topK=5, no filter', () => {
    expect(resolveSearchArgs('hello')).toEqual({ query: 'hello', topK: 5, filter: undefined })
  })

  it('string form: (query, topK)', () => {
    expect(resolveSearchArgs('hello', 8)).toEqual({ query: 'hello', topK: 8, filter: undefined })
  })

  it('string form: (query, topK, filter)', () => {
    const r = resolveSearchArgs('hello', 3, { userId: 'u1', memType: 'semantic' })
    expect(r).toEqual({ query: 'hello', topK: 3, filter: { userId: 'u1', memType: 'semantic' } })
  })

  it('event form: (event, query) defaults topK=5', () => {
    const r = resolveSearchArgs(fakeEvent, 'hello')
    expect(r.event).toBe(fakeEvent)
    expect(r.query).toBe('hello')
    expect(r.topK).toBe(5)
    expect(r.filter).toBeUndefined()
  })

  it('event form: (event, query, topK, filter)', () => {
    const filter = { userId: 'u9', scope: 'user' }
    const r = resolveSearchArgs(fakeEvent, 'hello', 4, filter)
    expect(r).toEqual({ event: fakeEvent, query: 'hello', topK: 4, filter })
  })

  it('ignores a non-object in the string-form filter slot', () => {
    // (query, topK, <not a filter>) — guards against accidental misuse
    expect(resolveSearchArgs('hello', 2, 99 as any).filter).toBeUndefined()
  })
})
