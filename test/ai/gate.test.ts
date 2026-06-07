import { describe, it, expect } from 'vitest'
import { shouldUseToolLoop } from '~~/server/utils/ai/gate'

describe('shouldUseToolLoop (gate)', () => {
  it('is off when the feature flag is disabled (preserves existing fast path)', () => {
    expect(shouldUseToolLoop({ aiToolsEnabled: false, hasEvent: true, intent: 'financial_query' })).toBe(false)
  })

  it('routes data/action intents to the loop when enabled', () => {
    for (const intent of ['financial_query', 'process_query', 'time_tracking_query', 'action_request', 'search']) {
      expect(shouldUseToolLoop({ aiToolsEnabled: true, hasEvent: true, intent })).toBe(true)
    }
  })

  it('keeps trivial intents on the fast path even when enabled', () => {
    expect(shouldUseToolLoop({ aiToolsEnabled: true, hasEvent: true, intent: 'general' })).toBe(false)
    expect(shouldUseToolLoop({ aiToolsEnabled: true, hasEvent: true, intent: 'greeting' })).toBe(false)
  })

  it('requires a server event (tools need request context)', () => {
    expect(shouldUseToolLoop({ aiToolsEnabled: true, hasEvent: false, intent: 'financial_query' })).toBe(false)
  })
})
