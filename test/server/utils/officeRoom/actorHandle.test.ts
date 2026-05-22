import { describe, it, expect } from 'vitest'
import {
  toActorHandle,
  parseActorHandle,
  isUserHandle,
  isClientHandle
} from '~~/server/utils/officeRoom'
import type { ActorHandle } from '~~/app/types/office'

describe('ActorHandle', () => {
  it('toActorHandle builds a user handle from a User-like object', () => {
    const u = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'x@y.z' }
    expect(toActorHandle(u, 'user')).toBe('user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  })

  it('toActorHandle builds a client handle from a ClientUser-like object', () => {
    const c = { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', clientId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' }
    expect(toActorHandle(c, 'client')).toBe('client:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
  })

  it('parseActorHandle round-trips user handles', () => {
    expect(parseActorHandle('user:abc-123')).toEqual({ type: 'user', id: 'abc-123', handle: 'user:abc-123' })
  })

  it('parseActorHandle round-trips client handles', () => {
    expect(parseActorHandle('client:xyz-789')).toEqual({ type: 'client', id: 'xyz-789', handle: 'client:xyz-789' })
  })

  it('parseActorHandle throws on malformed input', () => {
    expect(() => parseActorHandle('garbage' as ActorHandle)).toThrow()
    expect(() => parseActorHandle('user:' as ActorHandle)).toThrow()
    expect(() => parseActorHandle(':abc' as ActorHandle)).toThrow()
  })

  it('isUserHandle / isClientHandle discriminate', () => {
    expect(isUserHandle('user:abc')).toBe(true)
    expect(isUserHandle('client:abc')).toBe(false)
    expect(isClientHandle('client:abc')).toBe(true)
    expect(isClientHandle('user:abc')).toBe(false)
  })
})
