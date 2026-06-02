import { describe, it, expect } from 'vitest'
import {
  validateTokenLabel,
  resolveScopeClientId,
  tokenScopeLabel,
  AGENCY_SCOPE_SENTINEL
} from '~~/app/utils/exportTokenForm'

describe('validateTokenLabel', () => {
  it('rejects empty / whitespace', () => {
    expect(validateTokenLabel('')).toBe('A label is required')
    expect(validateTokenLabel('   ')).toBe('A label is required')
  })
  it('rejects over-long labels', () => {
    expect(validateTokenLabel('x'.repeat(101))).toBe('Keep the label under 100 characters')
  })
  it('accepts a normal label', () => {
    expect(validateTokenLabel('Warehouse pull')).toBeNull()
  })
})

describe('resolveScopeClientId', () => {
  it('maps the agency sentinel to undefined', () => {
    expect(resolveScopeClientId(AGENCY_SCOPE_SENTINEL)).toBeUndefined()
  })
  it('passes a real client id through', () => {
    expect(resolveScopeClientId('client-123')).toBe('client-123')
  })
})

describe('tokenScopeLabel', () => {
  it('agency-wide when no client', () => {
    expect(tokenScopeLabel({ client_id: null, client_name: null })).toBe('Agency-wide')
  })
  it('uses the client name when scoped', () => {
    expect(tokenScopeLabel({ client_id: 'c1', client_name: 'Acme' })).toBe('Acme')
  })
  it('falls back when scoped but unnamed', () => {
    expect(tokenScopeLabel({ client_id: 'c1', client_name: null })).toBe('Client c1')
  })
})
