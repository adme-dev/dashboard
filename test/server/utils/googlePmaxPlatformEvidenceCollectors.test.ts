import { describe, expect, it, vi } from 'vitest'
import { buildGooglePmaxDecisionEvidence } from '../../../workers/google-pmax-provider/src/decisionEvidencePolicy'
import { createGooglePmaxPlatformEvidenceCollectors } from '~~/server/utils/googlePmaxPlatformEvidenceCollectors'

const identity = {
  tenantId: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  clientId: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
  briefId: '23799282-283b-4508-b065-3fd36e8c05fd',
  configVersion: 3,
  configHash: 'a'.repeat(64)
}

const collectedAt = '2026-08-07T10:00:00.000Z'

function rowsFor(sql: string) {
  if (sql.includes('FROM briefs b')) return [{
    id: identity.briefId,
    reference_number: 'BR-123',
    title: 'Northern GAC Vehicle Ads',
    status: 'approved',
    budget_currency: 'AUD',
    budget_min: '700',
    budget_max: '700',
    requested_deadline: '2026-08-31',
    template_slug: 'google-pmax',
    updated_at: '2026-08-07T09:00:00.000Z'
  }]
  if (sql.includes('crm_audience_cohort_snapshots')) return [{
    id: '11111111-1111-4111-8111-111111111111',
    scope_hash: 'cohort-one',
    generated_at: '2026-08-07T08:00:00.000Z',
    expires_at: '2026-08-08T08:00:00.000Z'
  }]
  if (sql.includes('crm_persona_definitions')) return [{
    id: '22222222-2222-4222-8222-222222222222',
    persona_key: 'active_vehicle_shopper',
    label: 'Active vehicle shopper',
    vertical: 'automotive',
    version: 2,
    targeting_allowed: true,
    reporting_allowed: true,
    updated_at: '2026-08-07T07:00:00.000Z'
  }]
  if (sql.includes('ai_knowledge_articles')) return [{
    id: '33333333-3333-4333-8333-333333333333',
    title: 'Vehicle Ads launch policy',
    category: 'google-ads',
    updated_at: '2026-08-07T06:00:00.000Z'
  }]
  if (sql.includes('COUNT(*) FILTER') && sql.includes('JOIN departments')) return [{
    department_id: '44444444-4444-4444-8444-444444444444',
    department_name: 'Paid Media',
    total_count: 8,
    blocked_count: 1,
    completed_count: 3,
    updated_at: '2026-08-07T05:00:00.000Z'
  }]
  if (sql.includes('deduped_candidates')) return [{
    source_id: 'discussion:abc-123',
    evidence_type: 'discussion',
    title: 'PMax brainstorm',
    occurred_at: '2026-08-07T04:00:00.000Z'
  }]
  if (sql.includes('FROM media_spend')) return [{
    campaign_count: 2,
    allocated_total: '1400',
    actual_spend_total: '650',
    impressions_total: '12000',
    clicks_total: '400',
    conversions_total: '25',
    latest_synced_at: '2026-08-07T03:00:00.000Z'
  }]
  if (sql.includes('FROM anomalies')) return [{
    id: '55555555-5555-4555-8555-555555555555',
    type: 'adspend',
    severity: 'warning',
    status: 'open',
    title: 'Spend pacing',
    last_detected_at: '2026-08-07T02:00:00.000Z'
  }]
  if (sql.includes('FROM tasks t') && sql.includes('campaign_launch_tasks')) return [{
    task_id: '66666666-6666-4666-8666-666666666666',
    title: 'Resolve Merchant review',
    priority: 'high',
    is_blocked: true,
    status_category: 'working',
    updated_at: '2026-08-07T01:00:00.000Z',
    launch_task_key: 'merchant-review'
  }]
  throw new Error(`Unexpected query: ${sql}`)
}

describe('Google PMax platform evidence collectors', () => {
  it('collects bounded, non-PII facts from every internal platform source', async () => {
    const queryRows = vi.fn(async (sql: string) => rowsFor(sql))
    const collectors = createGooglePmaxPlatformEvidenceCollectors({ queryRows })
    const context = { identity, collectedAt }

    const entries = await Promise.all(Object.entries(collectors).map(async ([source, collector]) => [
      source,
      await collector!(context)
    ] as const))
    const bySource = Object.fromEntries(entries)

    expect(Object.keys(bySource).sort()).toEqual([
      'anomalies', 'audiences', 'boards', 'brief', 'knowledge', 'monday', 'performance', 'personas', 'tasks'
    ])
    expect(bySource.brief).toMatchObject({ authority: 'approved', status: 'available' })
    expect(bySource.knowledge).toMatchObject({ authority: 'approved', status: 'available' })
    expect(bySource.monday).toMatchObject({ authority: 'draft', status: 'available' })
    expect(bySource.performance.facts).toMatchObject({ campaignCount: 2, conversionsTotal: 25 })
    expect(JSON.stringify(bySource)).not.toContain('content')
    expect(JSON.stringify(bySource)).not.toContain('subject_hash')

    for (const [, params] of queryRows.mock.calls) {
      expect(params).toContain(identity.clientId)
    }
    const anomalyCall = queryRows.mock.calls.find(([sql]) => sql.includes('FROM anomalies'))
    expect(anomalyCall?.[1]).toEqual([identity.tenantId, identity.clientId])
  })

  it('keeps draft Monday discussion out of deterministic decisions', async () => {
    const collectors = createGooglePmaxPlatformEvidenceCollectors({
      queryRows: async (sql: string) => rowsFor(sql)
    })
    const sections = await Promise.all(Object.entries(collectors).map(async ([source, collector]) => ({
      source,
      tenantId: identity.tenantId,
      clientId: identity.clientId,
      ...await collector!({ identity, collectedAt })
    })))
    const evidence = buildGooglePmaxDecisionEvidence({
      identity,
      collectedAt,
      sections: sections as Parameters<typeof buildGooglePmaxDecisionEvidence>[0]['sections']
    })

    expect(evidence.sections.find(section => section.source === 'monday')).toMatchObject({
      authority: 'draft',
      decisionEligible: false
    })
  })

  it('returns unavailable advisory evidence instead of inventing facts when no rows exist', async () => {
    const collectors = createGooglePmaxPlatformEvidenceCollectors({ queryRows: async () => [] })
    const result = await collectors.audiences!({ identity, collectedAt })

    expect(result).toMatchObject({
      authority: 'operational',
      status: 'unavailable',
      references: [],
      facts: { count: 0 }
    })
  })

  it('requires an approved brief before it can become launch-critical evidence', async () => {
    const collectors = createGooglePmaxPlatformEvidenceCollectors({
      queryRows: async (sql: string) => sql.includes('FROM briefs b')
        ? [{ ...rowsFor(sql)[0], status: 'submitted' }]
        : []
    })
    const result = await collectors.brief!({ identity, collectedAt })

    expect(result).toMatchObject({ authority: 'approved', status: 'partial' })
  })
})
