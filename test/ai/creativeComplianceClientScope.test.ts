import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCreativeComplianceCheck, type RunCreativeComplianceInput } from '~~/server/utils/creativeCompliance'

const transport = vi.hoisted(() => ({ one: vi.fn(), metadata: vi.fn(), presign: vi.fn(), load: vi.fn(), ledger: vi.fn(), provider: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: transport.one }))
vi.mock('~~/server/utils/storage', () => ({ getFileMetadata: transport.metadata, getPresignedDownloadUrl: transport.presign }))
vi.mock('~~/server/utils/ai/invocationLedger', () => ({ recordAiInvocation: transport.ledger }))
vi.mock('~~/server/utils/video-generation/sourceAssetStore', async importOriginal => ({
  ...await importOriginal<typeof import('~~/server/utils/video-generation/sourceAssetStore')>(),
  loadSourceAssetsByIds: transport.load
}))
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CLIENT = id(1)
const FOREIGN = id(2)
const OWN_BANNER = id(10)
const FOREIGN_BANNER = id(11)
const AGENCY_BANNER = id(12)
const OWN_SOURCE = id(20)
const FOREIGN_SOURCE = id(21)
const AGENCY_SOURCE = id(22)
const UNAPPROVED_SOURCE = id(23)
const passing = {
  vehicleMatchesReference: true, badgeVisibleAndCorrect: true, disclaimerPresent: true,
  priceMatchesBrief: true, logoPresentUndistorted: true, artefactsDetected: false, confidence: 0.95, notes: 'Synthetic inspection.'
}
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE banner_assets(id uuid PRIMARY KEY,client_id uuid,r2_key text,file_size int,mime_type text);
    CREATE TABLE video_gen_source_assets(id uuid PRIMARY KEY,client_id uuid,r2_key text,status text,content_type text);
    CREATE TABLE creative_compliance_checks(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,asset_id uuid,source_asset_id uuid,
      created_by text,model_id text,gateway_used boolean,subject_type text,reference_source_asset_ids jsonb,
      expected_claims jsonb,verdict jsonb,passed boolean,confidence float,created_at timestamptz DEFAULT now()
    );
  `)
  transport.one.mockImplementation(async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] ?? null)
  transport.load.mockImplementation(async (ids: string[]) => (await db.query('SELECT * FROM video_gen_source_assets WHERE id=ANY($1::uuid[])', [ids])).rows)
})
afterAll(async () => {
  vi.unstubAllGlobals()
  await db.close()
})
beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('useRuntimeConfig', () => ({ aiGatewayUrl: 'https://gateway.ai.cloudflare.com/v1/account/gateway/groq', groqApiKey: 'synthetic-key' }))
  transport.provider.mockImplementation(async () => Response.json({ choices: [{ message: { content: JSON.stringify(passing) } }] }))
  vi.stubGlobal('fetch', transport.provider)
  transport.metadata.mockResolvedValue({ size: 1024, contentType: 'image/png' })
  transport.presign.mockImplementation(async (key: string) => `https://signed.example/${key}`)
  await db.exec('TRUNCATE creative_compliance_checks,banner_assets,video_gen_source_assets')
  for (const [assetId, clientId] of [[OWN_BANNER, CLIENT], [FOREIGN_BANNER, FOREIGN], [AGENCY_BANNER, null]]) {
    await db.query('INSERT INTO banner_assets VALUES($1,$2,$3,1024,\'image/png\')', [assetId, clientId, `banner/${assetId}.png`])
  }
  for (const [assetId, clientId, status] of [[OWN_SOURCE, CLIENT, 'approved'], [FOREIGN_SOURCE, FOREIGN, 'approved'], [AGENCY_SOURCE, null, 'approved'], [UNAPPROVED_SOURCE, CLIENT, 'pending']]) {
    await db.query('INSERT INTO video_gen_source_assets VALUES($1,$2,$3,$4,\'image/png\')', [assetId, clientId, `source/${assetId}.png`, status])
  }
})
function input(assetId = OWN_SOURCE) {
  return { assetId, clientScope: CLIENT, clientId: CLIENT, createdBy: 'synthetic-staff', subjectType: 'non_vehicle' as const, referenceSourceAssetIds: [] as string[] }
}
async function expectNoDisclosure() {
  expect(transport.presign).not.toHaveBeenCalled()
  expect(transport.provider).not.toHaveBeenCalled()
  expect(transport.ledger).not.toHaveBeenCalled()
  expect((await db.query('SELECT * FROM creative_compliance_checks')).rows).toEqual([])
}

describe('creative compliance trusted client scope', () => {
  it('inspects an owned banner without applying the video-source approval gate', async () => {
    expect(await runCreativeComplianceCheck(input(OWN_BANNER))).toMatchObject({ assetId: OWN_BANNER, passed: true })
    expect((await db.query('SELECT client_id,asset_id,source_asset_id FROM creative_compliance_checks')).rows)
      .toEqual([{ client_id: CLIENT, asset_id: OWN_BANNER, source_asset_id: null }])
    expect(transport.provider).toHaveBeenCalledOnce()
  })
  it('binds omitted clientId to the server-selected client and records that client', async () => {
    const { clientId: _, ...request } = input()
    expect(await runCreativeComplianceCheck(request)).toMatchObject({ assetId: OWN_SOURCE, passed: true })
    expect((await db.query('SELECT client_id,source_asset_id FROM creative_compliance_checks')).rows)
      .toEqual([{ client_id: CLIENT, source_asset_id: OWN_SOURCE }])
    expect(transport.ledger).toHaveBeenCalledWith(expect.objectContaining({ clientId: CLIENT }))
  })
  it.each([FOREIGN, null])('rejects explicit conflicting clientId %j before disclosure', async (clientId) => {
    await expect(runCreativeComplianceCheck({ ...input(clientId ? FOREIGN_SOURCE : AGENCY_SOURCE), clientId } as unknown as RunCreativeComplianceInput)).rejects.toThrow()
    await expectNoDisclosure()
  })
  it.each([FOREIGN_BANNER, AGENCY_BANNER, FOREIGN_SOURCE, AGENCY_SOURCE])('rejects inaccessible target %s before disclosure', async (assetId) => {
    await expect(runCreativeComplianceCheck(input(assetId))).rejects.toThrow()
    await expectNoDisclosure()
  })
  it.each([FOREIGN_SOURCE, AGENCY_SOURCE, UNAPPROVED_SOURCE, id(99)])('rejects unresolved, non-owned or unapproved reference %s before disclosure', async (referenceId) => {
    await expect(runCreativeComplianceCheck({ ...input(), referenceSourceAssetIds: [referenceId] })).rejects.toThrow()
    await expectNoDisclosure()
  })
  it('accepts owned approved references with the real source resolver', async () => {
    expect(await runCreativeComplianceCheck({ ...input(OWN_BANNER), subjectType: 'vehicle', referenceSourceAssetIds: [OWN_SOURCE] }))
      .toMatchObject({ passed: true })
    type ImageContent = { type: 'image_url', image_url: { url: string } }
    type TextContent = { type: 'text', text: string }
    const request = JSON.parse(transport.provider.mock.calls[0][1].body) as {
      messages: Array<{ content: Array<ImageContent | TextContent> }>
    }
    expect(request.messages[0].content.filter((item): item is ImageContent => item.type === 'image_url').map(item => item.image_url.url))
      .toEqual([`https://signed.example/banner/${OWN_BANNER}.png`, `https://signed.example/source/${OWN_SOURCE}.png`])
  })
  it('allows an owned approved source as its own vehicle reference', async () => {
    expect(await runCreativeComplianceCheck({ ...input(), subjectType: 'vehicle' })).toMatchObject({ passed: true })
  })
  it('rejects an unapproved source target before disclosure', async () => {
    await expect(runCreativeComplianceCheck(input(UNAPPROVED_SOURCE))).rejects.toThrow(/not approved/)
    await expectNoDisclosure()
  })
  it.each(['', 'not-a-uuid', null, 42])('rejects malformed supplied scope %j before database or provider access', async (clientScope) => {
    await expect(runCreativeComplianceCheck({ ...input(), clientScope } as unknown as RunCreativeComplianceInput)).rejects.toThrow()
    expect(transport.one).not.toHaveBeenCalled()
    await expectNoDisclosure()
  })
  it('preserves agency-owned target and reference sharing for unscoped callers', async () => {
    const { clientScope: _, ...request } = input(AGENCY_SOURCE)
    expect(await runCreativeComplianceCheck({ ...request, subjectType: 'vehicle', referenceSourceAssetIds: [AGENCY_SOURCE] }))
      .toMatchObject({ passed: true })
  })
})
