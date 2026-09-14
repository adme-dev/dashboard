import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptPageStudioPublicAnalyticsEvent, acceptPageStudioPublicLead, PageStudioPublicAnalyticsEventSchema, PageStudioPublicLeadSubmissionSchema } from '~~/server/utils/pageStudio/publicBoundary'

const db = vi.hoisted(() => ({ queryOneFresh: vi.fn(), execute: vi.fn(), transaction: vi.fn() }))
vi.mock('~~/server/utils/db', () => db)
vi.mock('~~/server/utils/leads/acceptance', () => ({ acceptLead: vi.fn(), resolveLeadCaptureMode: vi.fn() }))
vi.mock('~~/server/utils/leads/autoAssign', () => ({ resolveAssignedAm: vi.fn() }))
vi.mock('~~/server/utils/leads/db', () => ({ upsertFormMetadata: vi.fn() }))
vi.mock('~~/server/utils/measurement/outbox', () => ({ appendCanonicalConversionEvent: vi.fn() }))
vi.mock('~~/server/utils/measurement/publisher', () => ({ conversionOutboxPublisher: { publishEvent: vi.fn() } }))
const base = { scope: { tenantId: 'tenant', clientId: 'client', siteId: 'site' }, releaseId: 'release', versionDigest: 'a'.repeat(64), pageId: 'page', pageRoute: '/', occurredAt: '2026-09-14T00:00:00.000Z' }
const lead = { ...base, fields: {}, attribution: {}, formId: 'contact', idempotencyKey: 'request' }
const analytics = { ...base, eventId: 'page_view', kind: 'page_view' as const, idempotencyKey: 'event-request' }
const event = (environment: unknown) => ({ context: { cloudflare: { env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: environment } } } }) as H3Event
beforeEach(() => {
  vi.resetAllMocks()
  db.queryOneFresh.mockResolvedValue(null)
})
describe('trusted public release environment', () => {
  it.each([undefined, null, '', 'preview', 'PRODUCTION', 'unknown'])('fails closed for configuration %s before database access', async (environment) => {
    await expect(acceptPageStudioPublicLead(event(environment), lead)).rejects.toMatchObject({ statusCode: 503 })
    await expect(acceptPageStudioPublicAnalyticsEvent(event(environment), analytics)).rejects.toMatchObject({ statusCode: 503 })
    expect(db.queryOneFresh).not.toHaveBeenCalled()
    expect(db.execute).not.toHaveBeenCalled()
    expect(db.transaction).not.toHaveBeenCalled()
  })
  it.each(['staging', 'production'])('uses only trusted %s configuration for both boundaries', async (environment) => {
    await expect(acceptPageStudioPublicLead(event(environment), { ...lead, environment: environment === 'production' ? 'staging' : 'production' } as typeof lead)).rejects.toMatchObject({ statusCode: 403 })
    await expect(acceptPageStudioPublicAnalyticsEvent(event(environment), analytics)).rejects.toMatchObject({ statusCode: 403 })
    for (const [sql, params] of db.queryOneFresh.mock.calls) {
      expect(sql).toContain('pointer.environment = $6')
      expect(sql).toContain('release.environment = $6')
      expect(params).toEqual(['tenant', 'client', 'site', 'release', 'a'.repeat(64), environment])
    }
  })
  it('rejects caller environment fields in the actual public payload schemas', () => {
    const { idempotencyKey: _leadKey, ...leadBody } = lead
    const { idempotencyKey: _analyticsKey, ...analyticsBody } = analytics
    expect(PageStudioPublicLeadSubmissionSchema.safeParse({ ...leadBody, environment: 'staging' }).success).toBe(false)
    expect(PageStudioPublicAnalyticsEventSchema.safeParse({ ...analyticsBody, environment: 'staging' }).success).toBe(false)
  })
})
