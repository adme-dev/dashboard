import { describe, expect, it } from 'vitest'
import {
  pageStudioStagingAddress,
  PageStudioStagingStateSchema,
  PageStudioStagingRequestSchema,
  pageStudioStagingLink
} from '~~/shared/pageStudio/staging'

const siteId = 'c34f6347-cc63-4ed7-9a5a-da165ebefed2'
const otherSite = 'c34f6347-cc63-4ed7-9a5a-da165ebefed3'
const active = {
  id: '11111111-1111-4111-8111-111111111111',
  checkpointId: 'checkpoint_saved',
  digest: 'a'.repeat(64),
  deployedAt: '2026-09-22T06:00:00.000Z'
}
function state(status = 'ready') {
  return { siteId, ...pageStudioStagingAddress(siteId), status, canManage: true, active, currentDigest: active.digest, failure: null }
}

describe('client staging address and readiness contract', () => {
  it('accepts initial ensure without visitor-selected checkpoint or hostname authority', () => {
    const request = { operation: 'ensure', siteId, expectedEnvironment: 'production', actor: { kind: 'agency', actorId: active.id, tenantId: 'agency' } }
    expect(PageStudioStagingRequestSchema.parse(request)).toEqual(request)
    for (const extra of [{ digest: active.digest }, { hostname: 'other.example' }, { body: { digest: active.digest } }, { idempotencyKey: active.id }]) {
      expect(PageStudioStagingRequestSchema.safeParse({ ...request, ...extra }).success).toBe(false)
    }
  })
  it('assigns an immutable platform address without a domain or business name', () => {
    expect(pageStudioStagingAddress(siteId)).toEqual({
      hostname: 'preview-c34f6347cc634ed79a5ada165ebefed2.xeroflow.io',
      url: 'https://preview-c34f6347cc634ed79a5ada165ebefed2.xeroflow.io/'
    })
    expect(pageStudioStagingAddress(siteId.toUpperCase())).toEqual(pageStudioStagingAddress(siteId))
    expect(pageStudioStagingAddress(otherSite)).not.toEqual(pageStudioStagingAddress(siteId))
  })
  it.each(['', 'fantasy-limo', '../admin', 'https://evil.example', siteId + '.evil.example'])('rejects invalid site identity %s', (value) => {
    expect(() => pageStudioStagingAddress(value)).toThrow()
  })
  it('accepts a reserved address before deployment without claiming it is usable', () => {
    const reserved = { ...state('not_published'), active: null }
    expect(PageStudioStagingStateSchema.parse(reserved)).toEqual(reserved)
    expect(pageStudioStagingLink(reserved, siteId)).toBeNull()
  })
  it.each(['provisioning', 'failed', 'suspended', 'not_published'])('never opens inactive state %s', (status) => {
    expect(pageStudioStagingLink({ ...state(status), active: null }, siteId)).toBeNull()
  })
  it.each(['ready', 'building', 'update_failed'])('preserves the last verified snapshot while state is %s', (status) => {
    expect(pageStudioStagingLink(state(status), siteId)).toBe(pageStudioStagingAddress(siteId).url)
  })
  it('rejects a valid response from another site', () => {
    expect(pageStudioStagingLink(state(), otherSite)).toBeNull()
  })
  it.each([
    { hostname: 'elsewhere.example' }, { url: 'https://elsewhere.example/' },
    { url: 'javascript:alert(1)' }, { url: 'http://preview-c34f6347cc634ed79a5ada165ebefed2.xeroflow.io/' },
    { active: null }, { siteId: otherSite }, { active: { ...active, digest: 'invalid' } },
    { active: { ...active, token: 'must-not-be-exposed' } }
  ])('refuses mismatched or malformed staging metadata', (change) => {
    expect(pageStudioStagingLink({ ...state(), ...change }, siteId)).toBeNull()
  })
  it('does not require custom-domain approval to open a valid staging snapshot', () => {
    expect(pageStudioStagingLink(state(), siteId)).toContain('xeroflow.io')
  })
})
