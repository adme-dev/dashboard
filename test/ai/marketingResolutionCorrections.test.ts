import { beforeEach, expect, it, vi } from 'vitest'
import { resolveScopedClient } from '../../server/utils/ai/marketing/clientReads'
import { resolveScopedSearchTermTarget, readScopedSearchTermSnapshot } from '../../server/utils/ai/marketing/searchTermReads'
import { readAdSnapshots, selectScopedAdTargets } from '../../server/utils/ai/marketing/adReads'

const db = vi.hoisted(() => ({ queryRowsFresh: vi.fn(), queryOneFresh: vi.fn() }))
vi.mock('~~/server/utils/db', () => db)

const scope: any = { clientIds: ['a', 'a2'], permissionGroups: ['MEDIA_BUYING'], reportingGranted: true }
beforeEach(() => vi.clearAllMocks())
it.each(['canonical', 'alias'])('unique exact %s wins over fuzzy neighbours before limit', async (kind) => {
  const candidates = [{ id: 'a', name: 'Kia Northern', aliases: [] }, { id: 'a2', name: kind === 'canonical' ? 'KIA' : 'Other', aliases: kind === 'alias' ? ['KIA'] : [] }]
  db.queryRowsFresh.mockImplementation(async (sql, values) => values[0] === 'kia' ? candidates.filter(c => c.name.toLowerCase() === 'kia' || c.aliases.includes('KIA')) : candidates)
  expect((await resolveScopedClient(scope, 'kia'))?.id).toBe('a2')
})
it('genuine exact alias collisions reject ambiguity', async () => {
  db.queryRowsFresh.mockResolvedValue([{ id: 'a', name: 'One', aliases: ['Kia'] }, { id: 'a2', name: 'Two', aliases: ['Kia'] }])
  await expect(resolveScopedClient(scope, 'Kia')).rejects.toMatchObject({ statusCode: 400 })
})
it('Google target prefers exact campaign name and excludes Meta before ambiguity limit', async () => {
  const candidates = [{ id: 'meta', client_id: 'a', platform: 'meta', campaign_id: 'same', campaign_name: 'Brand' }, { id: 'google', client_id: 'a', platform: 'google', campaign_id: 'same', campaign_name: 'Brand', campaign_type: 'search' }, { id: 'other', client_id: 'a', platform: 'google_ads', campaign_id: 'other', campaign_name: 'Brand Shopping' }]
  db.queryRowsFresh.mockImplementation(async (sql, values) => candidates.filter(r => (!sql.includes('ms.platform IN (\'google\', \'google_ads\')') || r.platform !== 'meta') && (!values.includes('Brand') || r.campaign_name === 'Brand')).slice(0, 2))
  expect(await resolveScopedSearchTermTarget(scope, { campaignName: 'Brand' })).toMatchObject({ mediaSpendId: 'google', campaignType: 'SEARCH', platform: 'google' })
})
it.each(['google', 'google_ads'])('ad stored windows match normalized %s media identities', async (platform) => {
  db.queryRowsFresh.mockImplementation(async (sql, values) => {
    const selected = JSON.parse(values[2])[0]
    const match = sql.includes('CASE WHEN ms.platform = \'google\' THEN \'google_ads\' ELSE ms.platform END') ? 'google_ads' : platform
    return selected.platform === match ? [{ client_id: 'a', platform, connection_id: 'c', campaign_id: 'same', ad_id: 'ad', spend: 7 }] : []
  })
  const result = await readAdSnapshots(scope, [{ clientId: 'a', platform, connectionId: 'c', campaignId: 'same' }], '2026-10-01', '2026-10-27')
  expect(result.snapshotCoverage.missingTargetCount).toBe(0)
})
it.each(['google', 'google_ads'])('search stored window joins normalize %s', async (platform) => {
  db.queryOneFresh.mockImplementation(async (sql, values) => (sql.includes('CASE WHEN ms.platform = \'google\' THEN \'google_ads\' ELSE ms.platform END') ? 'google_ads' : platform) === values[1] ? { id: 'sync', coverage: 'full' } : null)
  db.queryRowsFresh.mockResolvedValue([{ search_term: 'stored', cost: 7 }])
  expect((await readScopedSearchTermSnapshot(scope, { clientId: 'a', platform, connectionId: 'c', campaignId: 'same' }, '2026-10-01', '2026-10-27'))?.terms[0].cost).toBe(7)
})
it('Google target filtering includes legacy google rows before target cap', async () => {
  db.queryRowsFresh.mockImplementation(async sql => sql.includes('ms.platform IN (\'google\', \'google_ads\')') ? [{ id: 'old', platform: 'google', client_id: 'a', campaign_id: 'same' }] : [])
  expect((await selectScopedAdTargets(scope, { campaignId: 'same', platform: 'google' } as any)).targets).toHaveLength(1)
})

it('owner ad substring spans clients while the canonical scope still filters before the cap', async () => {
  const candidates = [{ id: 'b', client_id: 'b', client_name: 'Kia Forbidden', campaign_id: 'same', platform: 'google', connection_id: 'c' }, { id: 'a', client_id: 'a', client_name: 'Kia', campaign_id: 'same', platform: 'google', connection_id: 'c' }, { id: 'a2', client_id: 'a2', client_name: 'Kia Northern', campaign_id: 'same', platform: 'google', connection_id: 'c' }]
  db.queryRowsFresh.mockImplementation(async (sql, values) => {
    expect(sql).toMatch(/WHERE ms.client_id = ANY\(\$1::uuid\[\]\)[\s\S]*named_client.id = ms.client_id[\s\S]*LIMIT 21/)
    expect(values).toContain('%Kia%')
    return candidates.filter(row => values[0].includes(row.client_id))
  })
  const result = await selectScopedAdTargets({ ...scope, ownerVerified: true }, { clientName: 'Kia' } as any)
  expect(result.targets.map(target => target.clientId)).toEqual(['a', 'a2'])
})
it('owner search substring still rejects genuine multi-client campaign ambiguity', async () => {
  db.queryRowsFresh.mockImplementation(async (sql, values) => {
    expect(sql).toContain('named_client.id = ms.client_id')
    expect(values).toContain('%Kia%')
    return [{ client_id: 'a', campaign_id: 'same' }, { client_id: 'a2', campaign_id: 'same' }]
  })
  await expect(resolveScopedSearchTermTarget({ ...scope, ownerVerified: true }, { clientName: 'Kia', campaignId: 'same' })).rejects.toMatchObject({ statusCode: 400 })
})
it('single-target exact and fuzzy client suggestions exclude forbidden matches using the bound relation scope', async () => {
  db.queryRowsFresh.mockImplementation(async (sql, values) => {
    expect(sql).toContain('WHERE c.id = ANY($2::uuid[])')
    const rows = [{ id: 'b', name: 'Kia' }, { id: 'a', name: 'Kia Northern' }].filter(row => values[1].includes(row.id))
    return rows.filter(row => values[0] === 'Kia' ? row.name === 'Kia' : row.name.includes('Kia'))
  })
  expect((await resolveScopedClient(scope, 'Kia'))?.name).toBe('Kia Northern')
  expect(db.queryRowsFresh).toHaveBeenCalledTimes(2)
})

it('owner campaign, prior, lead and pacing adapters apply substring filters inside scoped SQL', async () => {
  const { readCampaignAnalytics, readLeadAttribution } = await import('../../server/utils/ai/marketing/campaignReads')
  const { readSpendSummary } = await import('../../server/utils/ai/marketing/spendReads')
  const owner = { ...scope, ownerVerified: true, financialReadAllowed: true }
  const verifyName = (sql: string, values: any[]) => {
    expect(sql).toContain('named_client.id = ')
    expect(values).toContain('%Kia%')
    expect(values).toContainEqual(['a', 'a2'])
    expect(sql.indexOf('named_client.id')).toBeLessThan(sql.lastIndexOf('GROUP BY') < 0 ? sql.length : sql.lastIndexOf('GROUP BY'))
  }
  db.queryOneFresh.mockImplementation(async (sql, values) => {
    if (sql.includes('xero_org_connection')) return null
    verifyName(sql, values)
    return sql.includes('FROM leads l') ? { total_submissions: 2 } : { count: 2 }
  })
  db.queryRowsFresh.mockImplementation(async (sql, values) => {
    if (sql.includes('client_kpi_targets')) return []
    verifyName(sql, values)
    if (sql.includes('FROM campaigns c')) return ['a', 'a2'].map((client_id, i) => ({ client_id, client_name: i ? 'Kia Northern' : 'Kia', campaign_id: 'same', campaign_name: 'Brand', platform: 'meta', spend: 7 }))
    return ['a', 'a2'].map((client_id, i) => ({ client_id, client_name: i ? 'Kia Northern' : 'Kia', platform: 'meta', total_spend: 7 }))
  })
  for (const startDate of ['2026-10-01', '2026-09-01']) {
    const page = await readCampaignAnalytics(owner, { clientName: 'Kia', startDate, endDate: '2026-10-27', showInactive: true, sortBy: 'spend', sortDir: 'DESC', limit: 200, offset: 0 })
    expect(page.campaigns.map(row => row.clientId)).toEqual(['a', 'a2'])
  }
  expect((await readLeadAttribution(owner, { clientName: 'Kia', startDate: '2026-10-01', endDate: '2026-10-27' })).totalSubmissions).toBe(2)
  expect((await readSpendSummary(owner, { clientName: 'Kia', month: 10, year: 2026 })).items).toHaveLength(2)
})
