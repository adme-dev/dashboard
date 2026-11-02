import fs from 'node:fs'
import { createApp, defineEventHandler, toWebHandler, readBody, getRouterParam, getQuery } from 'h3'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeDesignTemplates, readImmutableDesignTemplate } from '../../server/utils/email-marketing/designTemplates'
import { executeDesignHistory } from '../../server/utils/email-marketing/designHistory'
import { publishDesignLibraryAsset } from '../../server/utils/email-marketing/designLibraryOperations'
import { executeDesignModules, type ModuleAuthority } from '../../server/utils/email-marketing/designModules'
import { appendDesignRevision, ensureLegacyDesignDocument, saveCampaignDesignDraft, saveTemplateDesignDraft, type DesignTransaction } from '../../server/utils/email-marketing/designRevisions'
import { getTemplateDesignDraft, getDesignDraft } from '../../server/utils/email-marketing/designReads'
import type { DesignAssetStorage } from '../../server/utils/email-marketing/designAssets'
import { designDigest } from '../../shared/emailRendering/designModules'
import { validateEmailDesign, type EmailDesignDocument } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'
import { emailRendererEnv, testEmailRenderer } from '../fixtures/emailRenderer'
import { createCampaignFromTemplateRevision, initializeCampaignOwnedDraft, type CampaignContentMutation } from '../../server/utils/email-marketing/designCampaigns'
import { createCampaign, updateCampaign, preparedCampaignHtml, prepareCampaignHtmlForSend, materializeRecipients, scheduleCampaign, type Campaign } from '../../server/utils/email-marketing/campaigns'
import { runReviewCommand, loadReviewTarget, mapReviewDbError } from '../../server/utils/email-marketing/review'
import { runDepartmentEmailOperation } from '../../server/utils/ai/marketing/departmentEmailOperations'
import { sha256 } from '../../server/utils/ai/marketing/departmentExecutionLedger'
import { setCachedCfBindings } from '../../server/utils/cfBindings'
import type { ToolContext } from '../../server/utils/ai/toolContext'

const harness = vi.hoisted(() => ({ pool: null as pg.Pool | null, actorId: '', denied: false, failAfterCommit: false }))
vi.mock('~~/server/utils/auth', () => ({ validateSession: async (token: string) => token === 'staff-token' && !harness.denied ? { id: harness.actorId, role: 'staff' } : null, requireWriteAccess: async () => ({ id: harness.actorId, role: 'staff' }) }))
vi.mock('~~/server/utils/email-marketing/designAccess', () => ({ assertFreshDesignAccess: async (_token: string, actor: string, client: string | null) => {
  if (harness.denied || actor !== harness.actorId || client !== '10000000-0000-4000-8000-000000000001') throw Object.assign(new Error('fresh authority denied'), { statusCode: 403 })
  return 'staff'
}, assertFreshDesignPublisher: async () => {
  throw new Error('staff has no publisher grant')
} }))
vi.mock('~~/server/utils/email-marketing/access', async importOriginal => ({ ...await importOriginal<object>(), assertEmailClientAccess: async (_event: unknown, _user: unknown, client: string) => {
  if (client !== '10000000-0000-4000-8000-000000000001') throw Object.assign(new Error('scope denied'), { statusCode: 403 })
}, resolveEmailWriteClientId: async (_event: unknown, _user: unknown, client: string) => {
  if (client !== '10000000-0000-4000-8000-000000000001') throw Object.assign(new Error('scope denied'), { statusCode: 403 })
  return client
} }))
vi.stubGlobal('defineEventHandler', defineEventHandler)
vi.stubGlobal('readBody', readBody)
vi.stubGlobal('getRouterParam', getRouterParam)
vi.stubGlobal('getQuery', getQuery)
vi.mock('~~/server/utils/db', () => {
  const rows = async (sql: string, params?: unknown[]) => (await harness.pool!.query(sql, params)).rows
  const tx = async (callback: (db: pg.PoolClient) => Promise<unknown>) => {
    const db = await harness.pool!.connect()
    try {
      await db.query('BEGIN')
      const result = await callback(db)
      await db.query('COMMIT')
      if (harness.failAfterCommit) {
        harness.failAfterCommit = false
        throw new Error('committed response lost')
      }
      return result
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    } finally {
      db.release()
    }
  }
  return { queryRows: rows, queryRowsFresh: rows, queryOne: async (sql: string, params?: unknown[]) => (await rows(sql, params))[0] ?? null,
    queryOneFresh: async (sql: string, params?: unknown[]) => (await rows(sql, params))[0] ?? null, transaction: tx, transactionWithoutRetry: tx,
    execute: async (sql: string, params?: unknown[]) => {
      await harness.pool!.query(sql, params)
    }, getTransactionFailureStage: () => null }
})
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({ requireMarketingDepartment: async (ctx: unknown) => {
  if (harness.denied) throw Object.assign(new Error('department role revoked'), { statusCode: 403 })
  return ctx
} }))
vi.mock('~~/server/utils/ai/marketing/readScope', () => ({ resolveMarketingReadScope: async (ctx: unknown) => ctx, requireScopedClient: async (_ctx: unknown, clientId: string) => {
  if (clientId !== '10000000-0000-4000-8000-000000000001') throw Object.assign(new Error('denied'), { statusCode: 403 })
} }))

// Never use DATABASE_URL, runtime config, or customer rows. Each connection has
// only this run's schema in its search_path, including the real migration SQL.
const socket = process.env.FIGFLOW_DESIGN_PG_SOCKET
const databaseTest = socket ? it : it.skip
const schema = `figflow_campaign_backend_${Date.now()}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
const config = () => ({ host: socket, port: 55483, user: 'figflow_test', database: 'figflow_design_test', connectionTimeoutMillis: 5000 })
const scope = structuredDesign().scope.clientId
const originalSubject = 'Synthetic offer {{first_name}}'
const originalPreview = 'Synthetic original preview'
let admin: pg.Client | undefined
let actorId: string
let templateId: string
let documentId: string
let head: string
let design: EmailDesignDocument
let revoked: boolean
let migrationsApplied = 0
let working: { templateId: string, documentId: string, head: string }

const transaction: DesignTransaction = async (callback) => {
  const db = new pg.Client(config())
  await db.connect()
  try {
    await db.query('BEGIN')
    await db.query(`SET LOCAL search_path TO ${schema}`)
    await db.query('SET LOCAL statement_timeout = \'10s\'; SET LOCAL lock_timeout = \'5s\'')
    const result = await callback(db)
    await db.query('COMMIT') // Exercises deferred committed-head constraints too.
    return result
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  } finally {
    await db.end()
  }
}
// Both connections must begin before either command runs, rather than relying
// on Promise scheduling alone to make a supposed race overlap.
function concurrentTransactions(): DesignTransaction {
  let arrived = 0
  let release!: () => void
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  return callback => transaction(async (db) => {
    if (++arrived === 2) release()
    await ready
    return callback(db)
  })
}
const authorize = async (clientId: string | null) => {
  if (revoked || clientId !== scope) throw new Error('synthetic authority denied')
}
const authority = (): ModuleAuthority => ({ actorId, read: authorize, designer: authorize, publisher: authorize })
async function currentDesign() {
  const kind = (await admin!.query('SELECT template_kind FROM edm_templates WHERE id=$1', [templateId])).rows[0].template_kind
  if (kind === 'template') {
    const selected = await readImmutableDesignTemplate(templateId, head, authority(), admin!)
    return { source: selected.design, headRevisionId: selected.headRevisionId }
  }
  const current = await getTemplateDesignDraft(documentId, authorize, admin!)
  if (current.state !== 'structured') throw new Error('Expected structured draft')
  return current
}
async function registeredAsset() {
  const assetId = crypto.randomUUID()
  const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lWQAAAAASUVORK5CYII=', 'base64'))
  const key = `banner-assets/${actorId}/${crypto.randomUUID()}/image.png`
  const url = `https://example.invalid/registered/${assetId}`
  await admin!.query('INSERT INTO banner_assets(id,client_id,uploaded_by,r2_key,url,mime_type,file_size) VALUES($1,$2,$3,$4,$5,$6,$7)', [assetId, scope, actorId, key, url, 'image/png', bytes.length])
  const storage: DesignAssetStorage = {
    read: async (requested) => {
      expect(requested).toBe(key)
      return bytes
    },
    url: async (requested) => {
      expect(requested).toBe(assetId)
      return url
    },
    identifyUrl: async value => value === url ? assetId : null
  }
  const request = { version: 1 as const, operationId: crypto.randomUUID(), assetId }
  return { request, storage, url, key, bytes, assetId, publish: (operationId = request.operationId) => publishDesignLibraryAsset({ ...request, operationId }, actorId, authorize, storage, transaction) }
}

function useWorkingSource() {
  ;({ templateId, documentId, head } = working)
}
async function publishSource(storage?: DesignAssetStorage) {
  const published = await executeDesignTemplates({ version: 1, command: 'publish-template', operationId: crypto.randomUUID(), draftId: documentId, expectedRevisionId: head,
    name: 'Published synthetic source', category: null, includedOverridePaths: [] }, authority(), testEmailRenderer, storage, transaction)
  templateId = published.templateId!
  documentId = published.documentId
  head = published.revisionId
}
async function publishedImageSource() {
  useWorkingSource()
  const asset = await registeredAsset()
  const image = validateEmailDesign(design)
  image.blocks.image = { type: 'Image', data: { props: { url: asset.url, alt: 'Synthetic registered image' } } }
  image.blocks.root.data.childrenIds!.push('image')
  image.lineage.push({ blockId: 'image', nodeId: 'image-node', fields: { alt: 'image-alt' } })
  image.policy.editableFields.push('image.data.props.alt')
  image.assets = [(await asset.publish()).asset]
  head = (await saveTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: head, design: image }, authorize, testEmailRenderer, transaction)).revisionId
  await publishSource(asset.storage)
  return asset
}

describe('campaign backend with isolated real PostgreSQL', () => {
  beforeAll(async () => {
    if (!socket) return
    if (socket !== '/private/tmp/figflow-postgres-20261102-recovered') throw new Error('Requires the explicitly assigned disposable PostgreSQL fixture')
    admin = new pg.Client(config())
    await admin.connect()
    await admin.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`)
    // Include the actual owner columns used by library publication, rather than
    // letting a SQL mock overlook missing defaults/name/folder/created_by.
    await admin.query(`
      CREATE TABLE agency_clients(id uuid PRIMARY KEY,is_active boolean DEFAULT true);
      CREATE TABLE edm_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, name text, folder_name text, created_by uuid, body_source jsonb, body_html text, subject text, preview_text text, template_kind text DEFAULT 'draft', updated_at timestamptz DEFAULT now());
      CREATE TABLE edm_custom_modules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, blocks jsonb, name text, description text, category text, preview_tone text, created_by uuid, updated_at timestamptz DEFAULT now());
      CREATE TABLE banner_assets(id uuid PRIMARY KEY, client_id uuid, uploaded_by uuid, r2_key text, url text, mime_type text, file_size integer);
      CREATE TABLE campaigns(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, name text, subject text, preview_text text,
        from_name text,from_email text,reply_to text,filter_rules jsonb,template_id uuid,status text DEFAULT 'draft',body_source jsonb,body_html text,
        scheduled_at timestamptz,created_by uuid,content_type text DEFAULT 'builder',sent integer DEFAULT 0,to_send integer DEFAULT 0,updated_at timestamptz DEFAULT now());
      CREATE TABLE email_lists(id uuid PRIMARY KEY,client_id uuid,name text,archived_at timestamptz);
      CREATE TABLE campaign_lists(campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,list_id uuid REFERENCES email_lists(id) ON DELETE CASCADE,PRIMARY KEY(campaign_id,list_id));
      CREATE TABLE god_mode_execution_ledger(actor_user_id uuid,channel text,idempotency_key text,state text,correlation_id uuid,route_or_tool text,
        executor_class text,session_digest text,execution_phase text,client_id uuid,result_reference text,result_digest text,execution_metadata jsonb,
        created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),PRIMARY KEY(actor_user_id,channel,idempotency_key));
    `)
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const file of ['491_email_design_revisions.sql', '492_email_design_revision_metadata.sql', '493_email_design_handoffs.sql', '494_email_merge_tag_definitions.sql', '495_email_asset_publication.sql', '496_email_content_conditions.sql', '497_email_review_workflow.sql', '498_email_campaign_design_projection.sql']) {
        await admin.query(fs.readFileSync(new URL(`../../server/database/migrations/${file}`, import.meta.url), 'utf8'))
        migrationsApplied++
      }
    }
    await admin.query('INSERT INTO agency_clients VALUES($1)', [scope])
    harness.pool = new pg.Pool({ ...config(), options: `-c search_path=${schema},public` })
  })
  beforeEach(async () => {
    if (!socket) return
    revoked = false
    setCachedCfBindings({})
    actorId = crypto.randomUUID()
    harness.actorId = actorId
    harness.denied = false
    harness.failAfterCommit = false
    templateId = crypto.randomUUID()
    await admin!.query('INSERT INTO edm_templates(id,client_id,name,subject,preview_text) VALUES($1,$2,$3,$4,$5)', [templateId, scope, 'Synthetic source draft', originalSubject, originalPreview])
    const baseline = await ensureLegacyDesignDocument({ kind: 'template', ownerId: templateId, actorId }, authorize, transaction)
    documentId = baseline.documentId
    design = validateEmailDesign(structuredDesign())
    design.source.brand = { kitId: crypto.randomUUID(), versionId: crypto.randomUUID(), version: 2, name: 'Synthetic pinned brand', defaults: { primaryColor: '#123456', fontFamily: 'MODERN_SANS', contentWidth: 600, fontFallback: false, requestedFont: null } }
    design.policy.designerLocks = { blockIds: ['cta'], styleFields: [] }
    head = (await saveTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: baseline.revisionId, design }, authorize, testEmailRenderer, transaction)).revisionId
    working = { templateId, documentId, head }
    await publishSource()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    setCachedCfBindings({})
  })
  afterAll(async () => {
    if (!admin) return
    try {
      setCachedCfBindings({})
      await harness.pool?.end()
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      expect((await admin.query('SELECT count(*)::int AS count FROM pg_namespace WHERE nspname=$1', [schema])).rows[0].count).toBe(0)
      console.info(`Dropped isolated PostgreSQL schema ${schema}; migration executions: ${migrationsApplied}`)
    } finally {
      await admin.end()
    }
  })

  const selection = (name = 'Campaign A', operationId = crypto.randomUUID()) => ({ version: 1, command: 'create-from-template', operationId, templateId, revisionId: head, clientId: scope, campaign: { name } })
  const campaignAuthority = () => ({ actorId, read: authorize, write: authorize })
  const copy = (request = selection(), storage?: DesignAssetStorage, tx = transaction) => createCampaignFromTemplateRevision(request, campaignAuthority(), testEmailRenderer, storage, tx)
  const campaign = async (id: string) => (await admin!.query('SELECT * FROM campaigns WHERE id=$1', [id])).rows[0] as Campaign
  const mutation = (revisionId: string, operationId = crypto.randomUUID(), storage?: DesignAssetStorage): CampaignContentMutation => ({ actorId, operationId, expectedRevisionId: revisionId, authorizeRead: authorize, authorizeWrite: authorize, storage })
  const update = (id: string, patch: Parameters<typeof updateCampaign>[1], context?: CampaignContentMutation) => transaction(db => updateCampaign(id, patch, testEmailRenderer, db, context))

  databaseTest('copies published T/R1 with module, registered image, locks and metadata into independent A/B after source heads advance', async () => {
    useWorkingSource()
    const asset = await registeredAsset()
    const descriptor = (await asset.publish()).asset
    const imageDesign = validateEmailDesign(design)
    imageDesign.blocks.registered = { type: 'Image', data: { props: { url: asset.url, alt: 'Pinned image' } } }
    imageDesign.blocks.root.data.childrenIds!.push('registered')
    imageDesign.lineage.push({ blockId: 'registered', nodeId: 'registered-node', fields: { alt: 'registered-alt' } })
    imageDesign.policy.editableFields.push('registered.data.props.alt')
    imageDesign.assets = [descriptor]
    head = (await saveTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: head, design: imageDesign }, authorize, testEmailRenderer, transaction)).revisionId
    const module = await executeDesignModules({ version: 1, command: 'publish-module', operationId: crypto.randomUUID(), draftId: documentId, expectedDraftRevisionId: head,
      name: 'Linked', description: null, category: 'test', previewTone: 'light', rootBlockIds: ['heading'], includedOverridePaths: [] }, authority(), testEmailRenderer, asset.storage, transaction)
    const inserted = await executeDesignModules({ version: 1, command: 'insert-module', operationId: crypto.randomUUID(), draftId: documentId, expectedDraftRevisionId: head,
      moduleId: module.moduleId, revisionId: module.revisionId, parentId: 'root', index: 1 }, authority(), testEmailRenderer, asset.storage, transaction)
    head = inserted.revisionId
    const source = await currentDesign()
    const sourceDraftId = documentId
    const published = await executeDesignTemplates({ version: 1, command: 'publish-template', operationId: crypto.randomUUID(), draftId: sourceDraftId, expectedRevisionId: head,
      name: 'Published exact source', category: null, includedOverridePaths: [] }, authority(), testEmailRenderer, asset.storage, transaction)
    templateId = published.templateId!
    documentId = published.documentId
    const originalHead = head = published.revisionId
    const a = await copy(selection('A'), asset.storage)
    const b = await copy(selection('B'), asset.storage)
    expect(a.campaignId).not.toBe(b.campaignId)
    expect(a.documentId).not.toBe(b.documentId)
    const newer = validateEmailDesign(source.source)
    newer.blocks.heading.data.props!.text = 'Template R2'
    await appendDesignRevision({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: originalHead, design: newer }, authorize, transaction,
      { authorizeModuleRead: (_id, clientId) => authorize(clientId) })
    newer.blocks.heading.data.props!.text = 'Independent module R2'
    const moduleDraft = await saveTemplateDesignDraft({ documentId: sourceDraftId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: inserted.revisionId, design: newer }, authorize, testEmailRenderer, transaction,
      { authorizeModuleRead: (_id, clientId) => authorize(clientId) })
    const moduleR2 = await executeDesignModules({ version: 1, command: 'revise-module', operationId: crypto.randomUUID(), draftId: sourceDraftId, expectedDraftRevisionId: moduleDraft.revisionId,
      moduleId: module.moduleId, expectedModuleRevisionId: module.revisionId, name: 'New module head', description: null, category: 'test', previewTone: 'light', rootBlockIds: ['heading'], includedOverridePaths: [] }, authority(), testEmailRenderer, asset.storage, transaction)
    expect(moduleR2.revisionId).not.toBe(module.revisionId)
    const c = await copy(selection('C from old R1'), asset.storage)
    expect(await getDesignDraft(c.documentId, authorize, admin!)).toMatchObject({ baseTemplateRevisionId: originalHead, source: { blocks: source.source.blocks } })
    for (const selected of [a, b]) {
      const draft = await getDesignDraft(selected.documentId, authorize, admin!)
      expect(draft).toMatchObject({ owner: { kind: 'campaign', id: selected.campaignId }, baseTemplateRevisionId: originalHead,
        metadata: { subject: originalSubject, previewText: originalPreview }, source: { kind: 'campaign-draft', assets: [descriptor], dependencies: source.source.dependencies,
          moduleInstances: source.source.moduleInstances, policy: source.source.policy, lineage: source.source.lineage }, projection: { state: 'current' } })
      if (draft.state === 'structured') expect(draft.source.blocks).toEqual(source.source.blocks)
    }
  })
  databaseTest('refuses unpublished working draft selection without campaign, revision or projection effects', async () => {
    const before = (await admin!.query('SELECT count(*)::int AS n FROM campaigns')).rows[0].n
    await expect(copy({ ...selection(), templateId: working.templateId, revisionId: working.head })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await admin!.query('SELECT count(*)::int AS n FROM campaigns')).rows[0].n).toBe(before)
  })
  for (const change of ['registered bytes unavailable', 'source withdrawn']) {
    databaseTest(`replays original committed selection after ${change} with fresh authority and no new-source I/O`, async () => {
      const asset = await publishedImageSource()
      const request = selection()
      let committed: Awaited<ReturnType<typeof copy>> | undefined
      const lost: DesignTransaction = async (callback) => {
        committed = await transaction(callback) as unknown as Awaited<ReturnType<typeof copy>>
        throw new Error('committed reply lost')
      }
      await expect(copy(request, asset.storage, lost)).rejects.toThrow('committed reply lost')
      if (change === 'registered bytes unavailable') await expect(admin!.query('UPDATE banner_assets SET email_publication=NULL WHERE id=$1', [asset.assetId])).rejects.toThrow('Published email assets are immutable')
      else await admin!.query('UPDATE edm_templates SET template_kind=\'draft\',email_design_revision_id=$2 WHERE id=$1', [templateId, head])
      const before = (await admin!.query('SELECT count(*)::int AS n FROM campaigns')).rows[0].n
      const read = vi.fn(authorize), write = vi.fn(authorize), noIo = vi.fn(async () => {
        throw new Error('replay must not read registered bytes')
      })
      const replay = () => createCampaignFromTemplateRevision(request, { actorId, read, write }, { ...testEmailRenderer, renderDocument: noIo }, { ...asset.storage, read: noIo }, transaction)
      expect(await replay()).toEqual(committed)
      expect(read).toHaveBeenCalledWith(scope)
      expect(write).toHaveBeenCalledWith(scope)
      expect(noIo).not.toHaveBeenCalled()
      expect((await admin!.query('SELECT count(*)::int AS n FROM campaigns')).rows[0].n).toBe(before)
      await expect(copy({ ...request, campaign: { name: 'changed replay payload' } }, asset.storage)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
      revoked = true
      await expect(replay()).rejects.toThrow('synthetic authority denied')
      revoked = false
      await expect(copy({ ...request, operationId: crypto.randomUUID() }, { ...asset.storage, read: async () => new Uint8Array() })).rejects.toMatchObject({ code: change === 'registered bytes unavailable' ? 'ASSET_NOT_READY' : 'NOT_FOUND' })
      expect((await admin!.query('SELECT count(*)::int AS n FROM campaigns')).rows[0].n).toBe(before)
    })
  }
  databaseTest('receipt replay retains fresh original agency-template read authority independently of destination writes', async () => {
    const sourceId = crypto.randomUUID()
    const agencyRead = vi.fn(async (_scope: string | null) => {})
    const baseline = await transaction(async (db) => {
      await db.query('INSERT INTO edm_templates(id,client_id,name,body_source,body_html,template_kind) VALUES($1,NULL,$2,$3,$4,$5)', [sourceId, 'Agency source', structuredDesign().blocks, 'Legacy agency source', 'draft'])
      return ensureLegacyDesignDocument({ kind: 'template', ownerId: sourceId, actorId }, agencyRead, cb => cb(db))
    })
    const source = validateEmailDesign({ ...structuredDesign(), scope: { clientId: null } })
    const sourceHead = (await saveTemplateDesignDraft({ documentId: baseline.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: baseline.revisionId, design: source }, agencyRead, testEmailRenderer, transaction)).revisionId
    const published = await executeDesignTemplates({ version: 1, command: 'publish-template', operationId: crypto.randomUUID(), draftId: baseline.documentId, expectedRevisionId: sourceHead,
      name: 'Agency published source', category: null, includedOverridePaths: [] }, { actorId, read: agencyRead, designer: agencyRead, publisher: agencyRead }, testEmailRenderer, undefined, transaction)
    const request = { ...selection(), templateId: published.templateId!, revisionId: published.revisionId }
    let sourceRevoked = false
    const read = vi.fn(async (client: string | null) => {
      if (client === null && sourceRevoked) throw new Error('agency source access revoked')
      if (client !== null) await authorize(client)
    })
    const write = vi.fn(authorize)
    const run = () => createCampaignFromTemplateRevision(request, { actorId, read, write }, testEmailRenderer, undefined, transaction)
    const committed = await run()
    read.mockClear()
    write.mockClear()
    expect(await run()).toEqual(committed)
    expect(read.mock.calls.map(([scope]) => scope)).toEqual([null, scope])
    expect(write.mock.calls.map(([scope]) => scope)).toEqual([scope])
    sourceRevoked = true
    await expect(run()).rejects.toThrow('agency source access revoked')
    sourceRevoked = false
    revoked = true
    await expect(run()).rejects.toThrow('synthetic authority denied')
  })
  databaseTest('MCP flag-off create, persisted-owner update and ledger replay refuse with unchanged canonical effects', async () => {
    const env = { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_LIBRARY_ENABLED: 'true' }
    const ctx = { userId: actorId, userRole: 'staff', permissionGroups: ['MARKETING_MANAGEMENT'], event: { context: { cloudflare: { env } } }, source: 'mcp' } as unknown as ToolContext
    const args = { clientId: scope, name: 'Gate fixture', templateId, templateRevisionId: head, operationId: crypto.randomUUID(), acknowledgement: 'CREATE_CLIENT_EMAIL_DRAFT' }
    const key = `mcp:${sha256(crypto.randomUUID())}`
    const call = (name: string, input: unknown, requestKey = key) => runDepartmentEmailOperation(name, input, ctx, requestKey, 'c'.repeat(64), { renderer: () => testEmailRenderer })
    const created = await call('marketing_create_email_campaign_draft', args)
    if (!created.ok) throw new Error(JSON.stringify(created))
    const a = created.data as { campaignId: string, revision: string, designRevisionId: string }
    const snapshot = async () => ({ campaign: await campaign(a.campaignId), counts: (await admin!.query('SELECT (SELECT count(*)::int FROM campaigns) AS campaigns,(SELECT count(*)::int FROM email_design_revisions) AS revisions,(SELECT count(*)::int FROM email_design_revision_receipts) AS receipts')).rows })
    const before = await snapshot()
    Reflect.deleteProperty(env, 'FIGFLOW_EDM_DRAFT_SAVES_ENABLED')
    Reflect.deleteProperty(env, 'FIGFLOW_EDM_LIBRARY_ENABLED')
    vi.stubEnv('FIGFLOW_EDM_DRAFT_SAVES_ENABLED', '')
    vi.stubEnv('FIGFLOW_EDM_LIBRARY_ENABLED', '')
    expect(await call('marketing_create_email_campaign_draft', args)).toMatchObject({ ok: false, code: 'not_found' })
    expect(await call('marketing_update_email_campaign_draft', { clientId: scope, campaignId: a.campaignId, expectedRevision: a.revision, patch: { subject: 'Absent flag refusal' }, acknowledgement: 'UPDATE_CLIENT_EMAIL_DRAFT' }, `mcp:${sha256(crypto.randomUUID())}`)).toMatchObject({ ok: false, code: 'not_found' })
    expect(await snapshot()).toEqual(before)
    env.FIGFLOW_EDM_LIBRARY_ENABLED = 'true'
    setCachedCfBindings({ FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_LIBRARY_ENABLED: 'true' })
    env.FIGFLOW_EDM_DRAFT_SAVES_ENABLED = 'false'
    expect(await call('marketing_create_email_campaign_draft', args)).toMatchObject({ ok: false, code: 'not_found' })
    expect(await call('marketing_create_email_campaign_draft', { ...args, operationId: crypto.randomUUID() }, `mcp:${sha256(crypto.randomUUID())}`)).toMatchObject({ ok: false, code: 'not_found' })
    // Omit UUID hints to prove owner-derived canonical admission still refuses.
    const update = { clientId: scope, campaignId: a.campaignId, expectedRevision: a.revision, patch: { subject: 'must not save' }, acknowledgement: 'UPDATE_CLIENT_EMAIL_DRAFT' }
    expect(await call('marketing_update_email_campaign_draft', update, `mcp:${sha256(crypto.randomUUID())}`)).toMatchObject({ ok: false, code: 'not_found' })
    expect(await snapshot()).toEqual(before)
    env.FIGFLOW_EDM_DRAFT_SAVES_ENABLED = 'true'
    env.FIGFLOW_EDM_LIBRARY_ENABLED = 'false'
    expect(await call('marketing_create_email_campaign_draft', args)).toMatchObject({ ok: false, code: 'not_found' })
    expect(await snapshot()).toEqual(before)
    // Existing canonical updates require saves, not the create-only library gate.
    const updateKey = `mcp:${sha256(crypto.randomUUID())}`
    const allowed = { ...update, operationId: crypto.randomUUID(), expectedDesignRevisionId: a.designRevisionId, patch: { subject: 'Permitted with saves only' } }
    expect(await call('marketing_update_email_campaign_draft', allowed, updateKey)).toMatchObject({ ok: true })
    const updated = await snapshot()
    env.FIGFLOW_EDM_DRAFT_SAVES_ENABLED = 'false'
    expect(await call('marketing_update_email_campaign_draft', allowed, updateKey)).toMatchObject({ ok: false, code: 'not_found' })
    expect(await snapshot()).toEqual(updated)
  })
  databaseTest('legacy MCP create, update and ledger replay remain available with release flags off despite caller UUID hints', async () => {
    const ctx = { userId: actorId, userRole: 'staff', permissionGroups: ['MARKETING_MANAGEMENT'], event: { context: { cloudflare: { env: { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'false', FIGFLOW_EDM_LIBRARY_ENABLED: 'false' } } } }, source: 'mcp' } as unknown as ToolContext
    const call = (name: string, args: unknown, key: string) => runDepartmentEmailOperation(name, args, ctx, key, 'd'.repeat(64), { renderer: () => testEmailRenderer })
    const created = await call('marketing_create_email_campaign_draft', { clientId: scope, name: 'Legacy off-gate', bodySource: structuredDesign().blocks, acknowledgement: 'CREATE_CLIENT_EMAIL_DRAFT' }, `mcp:${sha256(crypto.randomUUID())}`)
    if (!created.ok) throw new Error(JSON.stringify(created))
    const a = created.data as { campaignId: string, revision: string }
    expect((await campaign(a.campaignId)).email_design_revision_id).toBeNull()
    const update = { clientId: scope, campaignId: a.campaignId, expectedRevision: a.revision, operationId: crypto.randomUUID(), expectedDesignRevisionId: crypto.randomUUID(), patch: { subject: 'Legacy still editable' }, acknowledgement: 'UPDATE_CLIENT_EMAIL_DRAFT' }
    const key = `mcp:${sha256(crypto.randomUUID())}`
    const saved = await call('marketing_update_email_campaign_draft', update, key)
    expect(saved).toMatchObject({ ok: true })
    const current = await campaign(a.campaignId)
    expect(current).toMatchObject({ subject: 'Legacy still editable', email_design_revision_id: null })
    expect(await call('marketing_update_email_campaign_draft', update, key)).toMatchObject({ ok: true, data: { replayed: true } })
    expect(await campaign(a.campaignId)).toEqual(current)
    expect((await admin!.query('SELECT id FROM email_design_documents WHERE campaign_id=$1', [a.campaignId])).rows).toEqual([])
  })
  databaseTest('registered campaign readiness separates content correction from unavailable storage and unknown transport', async () => {
    const asset = await publishedImageSource(), a = await copy(selection(), asset.storage), current = await campaign(a.campaignId)
    const fetchAsset = vi.fn(async () => {
        throw new Error('external fetch forbidden')
      }), uploadAsset = vi.fn()
    const options = { canonicalDb: admin!, appUrl: 'https://app.example', fetchAsset, uploadAsset }
    await expect(preparedCampaignHtml(current, options)).rejects.toMatchObject({ statusCode: 503, statusMessage: 'ASSET_STORAGE_UNAVAILABLE' })
    const transient = new Error('synthetic R2 read timeout')
    await expect(preparedCampaignHtml(current, { ...options, designStorage: { ...asset.storage, read: async () => {
      throw transient
    } } })).rejects.toBe(transient)
    await expect(preparedCampaignHtml(current, { ...options, designStorage: { ...asset.storage, read: async () => new Uint8Array() } })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'canonical_campaign_asset_correction_required' })
    expect(fetchAsset).not.toHaveBeenCalled()
    expect(uploadAsset).not.toHaveBeenCalled()
    expect(await campaign(a.campaignId)).toEqual(current)
  })
  databaseTest('canonical review storage preflight runs before its transaction even without prepareSubmission', async () => {
    const asset = await publishedImageSource(), a = await copy(selection(), asset.storage)
    await admin!.query('UPDATE campaigns SET review_required=true WHERE id=$1', [a.campaignId])
    const target = await loadReviewTarget(admin!, 'campaign', a.campaignId, false)
    let inTransaction = false, reads = 0
    const storage: DesignAssetStorage = {
      read: async (key) => {
        expect(inTransaction).toBe(false)
        reads++
        return asset.storage.read(key)
      },
      url: async (id) => {
        expect(inTransaction).toBe(false)
        return asset.storage.url(id)
      },
      identifyUrl: async (url) => {
        expect(inTransaction).toBe(false)
        return asset.storage.identifyUrl(url)
      }
    }
    const tx: DesignTransaction = callback => transaction(async (db) => {
      expect(reads).toBeGreaterThan(0)
      inTransaction = true
      try {
        return await callback(db)
      } finally {
        inTransaction = false
      }
    })
    const before = await campaign(a.campaignId)
    expect(await runReviewCommand({ actorId, operationId: crypto.randomUUID(), kind: 'campaign', targetId: a.campaignId, expectedClientId: scope, expectedVersion: 0, expectedContentDigest: target!.digest, payload: { command: 'submit' } }, async () => {}, { transaction: tx as never, readDb: admin!, readReceipt: async () => null, designStorage: storage })).toMatchObject({ state: 'in_review' })
    expect(reads).toBeGreaterThan(0)
    expect((await campaign(a.campaignId)).body_html).toBe(before.body_html)
  })
  databaseTest('canonical review rejects a changed head between registered-byte preflight and locked submit with no review receipt', async () => {
    const asset = await publishedImageSource(), a = await copy(selection(), asset.storage)
    await admin!.query('UPDATE campaigns SET review_required=true WHERE id=$1', [a.campaignId])
    const target = await loadReviewTarget(admin!, 'campaign', a.campaignId, false)
    let reads = 0
    const storage = { ...asset.storage, read: async (key: string) => {
      reads++
      return asset.storage.read(key)
    } }
    let saved: Campaign | null = null
    const tx: DesignTransaction = async (callback) => {
      expect(reads).toBeGreaterThan(0)
      saved = await update(a.campaignId, { subject: 'Concurrent canonical save' }, mutation(a.revisionId, crypto.randomUUID(), asset.storage))
      return transaction(callback)
    }
    const operationId = crypto.randomUUID()
    await expect(runReviewCommand({ actorId, operationId, kind: 'campaign', targetId: a.campaignId, expectedClientId: scope, expectedVersion: 0, expectedContentDigest: target!.digest, payload: { command: 'submit' } }, async () => {}, { transaction: tx as never, readDb: admin!, readReceipt: async () => null, designStorage: storage })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'review_content_changed' })
    expect((await campaign(a.campaignId)).email_design_revision_id).toBe(saved!.email_design_revision_id)
    expect((await admin!.query('SELECT operation_id FROM email_review_operations WHERE operation_id=$1', [operationId])).rows).toEqual([])
    expect((await admin!.query('SELECT state FROM email_review_states WHERE target_id=$1', [a.campaignId])).rows).toEqual([])
  })
  databaseTest('replays creation after committed lost reply before inserting another owner, and rejects changed metadata', async () => {
    const request = selection()
    let committed: Awaited<ReturnType<typeof copy>> | undefined
    const lostReply: DesignTransaction = async (callback) => {
      const result = await transaction(callback)
      throw Object.assign(new Error('lost committed reply'), { result })
    }
    try {
      await copy(request, undefined, lostReply)
    } catch (error) {
      committed = (error as { result: typeof committed }).result
    }
    expect(committed?.campaignId).toBeTypeOf('string')
    const count = async () => Number((await admin!.query('SELECT count(*) AS n FROM campaigns')).rows[0].n)
    const before = await count()
    expect(await copy(request)).toEqual(committed)
    expect(await count()).toBe(before)
    await expect(copy({ ...request, campaign: { name: 'Changed on replay' } })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(await count()).toBe(before)
  })
  databaseTest('concurrent identical creation commands commit exactly one independent campaign and receipt', async () => {
    const request = selection()
    const concurrent = concurrentTransactions()
    const [first, replay] = await Promise.all([copy(request, undefined, concurrent), copy(request, undefined, concurrent)])
    expect(replay).toEqual(first)
    expect((await admin!.query('SELECT count(*)::int AS n FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2', [actorId, request.operationId])).rows[0].n).toBe(1)
  })
  databaseTest('rolls back new campaign, baseline, projection, receipt on creation render or receipt failure', async () => {
    const count = async () => (await admin!.query('SELECT count(*)::int AS n FROM campaigns')).rows[0].n
    const before = await count()
    await expect(createCampaignFromTemplateRevision(selection(), campaignAuthority(), { ...testEmailRenderer, renderDocument: async () => {
      throw new Error('render refused')
    } }, undefined, transaction)).rejects.toThrow('render refused')
    await admin!.query(`CREATE FUNCTION reject_copy_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt refused'; END $$;
      CREATE TRIGGER reject_copy_receipt BEFORE INSERT ON email_design_revision_receipts FOR EACH ROW EXECUTE FUNCTION reject_copy_receipt()`)
    try {
      await expect(copy()).rejects.toThrow('receipt refused')
    } finally {
      await admin!.query('DROP TRIGGER reject_copy_receipt ON email_design_revision_receipts; DROP FUNCTION reject_copy_receipt()')
    }
    expect(await count()).toBe(before)
  })
  databaseTest('refuses canonical selection through mutable template ID and browser canonical payload hints', async () => {
    await expect(transaction(db => createCampaign({ name: 'Mutable', created_by: actorId, template_id: templateId, client_id: scope }, testEmailRenderer, db))).rejects.toMatchObject({ statusCode: 409, statusMessage: 'design_revision_required' })
    await expect(transaction(db => createCampaign({ name: 'Wrong revision', created_by: actorId, template_id: templateId, client_id: scope }, testEmailRenderer, db, { templateRevisionId: crypto.randomUUID() }))).rejects.toMatchObject({ statusCode: 409, statusMessage: 'design_revision_required' })
    await expect(copy({ ...selection(), body_html: '<p>forged</p>' } as never)).rejects.toThrow()
    await expect(copy({ ...selection(), clientId: crypto.randomUUID() })).rejects.toThrow('synthetic authority denied')
    await expect(copy({ ...selection(), revisionId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  databaseTest('commits content, metadata and mixed fields under one receipt; changed replay and stale CAS leave everything unchanged', async () => {
    const a = await copy()
    const source = await getDesignDraft(a.documentId, authorize, admin!)
    if (source.state !== 'structured') throw new Error('structured fixture required')
    const blocks = structuredClone(source.source.blocks)
    blocks.heading.data.props!.text = 'Staff campaign copy'
    const patch = { body_source: blocks, subject: 'Subject two', preview_text: 'Preheader two', name: 'Renamed', from_name: 'Sender two', filter_rules: null }
    const context = mutation(a.revisionId)
    const saved = await update(a.campaignId, patch, context)
    expect(saved).toMatchObject({ name: patch.name, from_name: patch.from_name, subject: patch.subject, preview_text: patch.preview_text, body_source: blocks })
    const before = await campaign(a.campaignId)
    expect(await update(a.campaignId, patch, context)).toMatchObject({ email_design_revision_id: before.email_design_revision_id, name: patch.name })
    await expect(update(a.campaignId, { ...patch, from_name: 'Different replay sender' }, context)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    await expect(update(a.campaignId, { ...patch, subject: 'Stale' }, mutation(a.revisionId))).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    await expect(update(a.campaignId, patch)).rejects.toMatchObject({ statusCode: 409, statusMessage: 'design_revision_required' })
    expect(await campaign(a.campaignId)).toEqual(before)
    await update(a.campaignId, { subject: 'A later saved subject', from_name: 'A later sender' }, mutation(before.email_design_revision_id!))
    await admin!.query('UPDATE campaigns SET status=\'sent\' WHERE id=$1', [a.campaignId])
    const frozen = await campaign(a.campaignId)
    const replay = await update(a.campaignId, patch, context)
    expect(replay?.design_receipt?.revisionId).toBe(before.email_design_revision_id)
    expect(await campaign(a.campaignId)).toEqual(frozen)
  })
  databaseTest('reconciles an old campaign receipt whose digest predates optional mixed-patch context', async () => {
    const a = await copy()
    const source = await getDesignDraft(a.documentId, authorize, admin!)
    if (source.state !== 'structured') throw new Error('structured fixture required')
    const root = (await admin!.query('SELECT parent_revision_id FROM email_design_revisions WHERE id=$1', [a.revisionId])).rows[0].parent_revision_id as string
    const operationId = crypto.randomUUID()
    const digest = await designDigest({ owner: { kind: 'campaign', id: a.campaignId }, command: 'campaign-designer',
      documentId: a.documentId, expectedRevisionId: root, design: source.source,
      metadata: source.metadata, baseTemplateRevisionId: head, action: null })
    await admin!.query('INSERT INTO email_design_revision_receipts(actor_id,operation_id,document_id,payload_sha256,revision_id) VALUES ($1,$2,$3,$4,$5)', [actorId, operationId, a.documentId, digest, a.revisionId])
    const noRender = { ...testEmailRenderer, renderDocument: async () => {
      throw new Error('old receipt must not render')
    } }
    expect(await saveCampaignDesignDraft({ documentId: a.documentId, actorId, operationId, expectedRevisionId: root, design: source.source,
      subject: source.metadata.subject, previewText: source.metadata.previewText }, authorize, noRender, transaction,
    { baseTemplateRevisionId: head, authorizeTemplateRead: (_id, clientId) => authorize(clientId) })).toEqual({ documentId: a.documentId, revisionId: a.revisionId })
  })
  databaseTest('non-content updates never render canonical or legacy rows and receipt refusal rolls back mixed fields', async () => {
    const a = await copy()
    const noRender = { ...testEmailRenderer, renderDocument: async () => {
      throw new Error('must not render')
    } }
    await expect(transaction(db => updateCampaign(a.campaignId, { name: 'Metadata name' }, noRender, db))).resolves.toMatchObject({ name: 'Metadata name' })
    const before = await campaign(a.campaignId)
    await admin!.query(`CREATE FUNCTION reject_update_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt refused'; END $$;
      CREATE TRIGGER reject_update_receipt BEFORE INSERT ON email_design_revision_receipts FOR EACH ROW EXECUTE FUNCTION reject_update_receipt()`)
    try {
      await expect(update(a.campaignId, { subject: 'No commit', from_name: 'No sender commit' }, mutation(a.revisionId))).rejects.toThrow('receipt refused')
    } finally {
      await admin!.query('DROP TRIGGER reject_update_receipt ON email_design_revision_receipts; DROP FUNCTION reject_update_receipt()')
    }
    expect(await campaign(a.campaignId)).toEqual(before)
  })
  databaseTest('campaign module/history/template publication uses its saved owner and retains its base template pin', async () => {
    const a = await copy()
    const published = await executeDesignTemplates({ version: 1, command: 'publish-template', operationId: crypto.randomUUID(), draftId: a.documentId, expectedRevisionId: a.revisionId, name: 'New library owner', category: null, includedOverridePaths: [] }, authority(), testEmailRenderer, undefined, transaction)
    const newLibrary = await readImmutableDesignTemplate(published.templateId!, published.revisionId, authority(), admin!)
    expect(newLibrary.design.kind).toBe('template')
    expect(published.documentId).not.toBe(a.documentId)
    const restored = await executeDesignHistory({ version: 1, command: 'restore-revision', draftId: a.documentId, expectedRevisionId: a.revisionId, revisionId: a.revisionId, operationId: crypto.randomUUID() }, authority(), testEmailRenderer, undefined, transaction)
    expect(await getDesignDraft(a.documentId, authorize, admin!)).toMatchObject({ owner: { kind: 'campaign', id: a.campaignId }, baseTemplateRevisionId: head, headRevisionId: restored.revisionId })
    expect((await currentDesign()).headRevisionId).toBe(head)
  })
  databaseTest('inserts a pinned module into a campaign, restores it as a successor and replays after freeze without affecting the source', async () => {
    const module = await executeDesignModules({ version: 1, command: 'publish-module', operationId: crypto.randomUUID(), draftId: working.documentId, expectedDraftRevisionId: working.head,
      name: 'Campaign section', description: null, category: 'test', previewTone: 'light', rootBlockIds: ['heading'], includedOverridePaths: [] }, authority(), testEmailRenderer, undefined, transaction)
    const a = await copy()
    const input = { version: 1, command: 'insert-module', operationId: crypto.randomUUID(), draftId: a.documentId, expectedDraftRevisionId: a.revisionId, moduleId: module.moduleId, revisionId: module.revisionId, parentId: 'root', index: 1 }
    const inserted = await executeDesignModules(input, authority(), testEmailRenderer, undefined, transaction)
    expect(await getDesignDraft(a.documentId, authorize, admin!)).toMatchObject({ baseTemplateRevisionId: head, projection: { state: 'current' }, source: { dependencies: [{ moduleId: module.moduleId, revisionId: module.revisionId }] } })
    await admin!.query('UPDATE campaigns SET status=\'sent\' WHERE id=$1', [a.campaignId])
    expect(await executeDesignModules(input, authority(), testEmailRenderer, undefined, transaction)).toEqual(inserted)
    expect((await currentDesign()).headRevisionId).toBe(head)
  })
  databaseTest('canonical send and M06 submit preserve stored output and refuse correction before external I/O', async () => {
    const a = await copy()
    const current = await campaign(a.campaignId)
    const fetchAsset = vi.fn(async () => {
      throw new Error('external fetch forbidden')
    })
    const uploadAsset = vi.fn()
    const opts = { canonicalDb: admin!, appUrl: 'https://app.example', fetchAsset, uploadAsset, mirrorExternalAssets: true }
    expect(await preparedCampaignHtml(current, opts)).toBe(current.body_html)
    expect(await prepareCampaignHtmlForSend(current, opts)).toEqual(current)
    await admin!.query('UPDATE campaigns SET review_required=true WHERE id=$1', [a.campaignId])
    const target = await loadReviewTarget(admin!, 'campaign', a.campaignId, false)
    expect(target?.revisionId).toBe(a.revisionId)
    const request = { actorId, operationId: crypto.randomUUID(), kind: 'campaign' as const, targetId: a.campaignId, expectedClientId: scope, expectedVersion: 0, expectedContentDigest: target!.digest, payload: { command: 'submit' as const } }
    const forbiddenLegacyPreparation = vi.fn(async () => {
      throw new Error('legacy mirror callback forbidden')
    })
    const submit = await runReviewCommand(request, async () => {}, { transaction: transaction as never, readDb: admin!, readReceipt: async () => null, prepareSubmission: forbiddenLegacyPreparation })
    expect(forbiddenLegacyPreparation).not.toHaveBeenCalled()
    expect(submit).toMatchObject({ operationId: request.operationId })
    expect((await campaign(a.campaignId)).body_html).toBe(current.body_html)
    expect(fetchAsset).not.toHaveBeenCalled()
    expect(uploadAsset).not.toHaveBeenCalled()
    expect(mapReviewDbError({ code: '55000', constraint: 'email_design_campaign_revision_required' })).toMatchObject({ statusCode: 409 })
  })
  databaseTest('M06 and send preparation reject unsupported canonical images before mirror callbacks, without rewriting frozen output', async () => {
    const a = await copy()
    const current = await getDesignDraft(a.documentId, authorize, admin!)
    if (current.state !== 'structured') throw new Error('structured fixture required')
    const unsupported = validateEmailDesign(current.source)
    unsupported.blocks.external = { type: 'Image', data: { props: { url: 'https://unregistered.example/image.png', alt: 'Unsupported source' } } }
    unsupported.blocks.root.data.childrenIds!.push('external')
    const bad = await saveCampaignDesignDraft({ documentId: a.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: a.revisionId, design: unsupported, subject: 'Needs correction', previewText: null }, authorize, testEmailRenderer, transaction, { authorizeTemplateRead: (_id, clientId) => authorize(clientId) })
    const before = await campaign(a.campaignId)
    const fetchAsset = vi.fn(async () => {
      throw new Error('mirror fetch forbidden')
    })
    const uploadAsset = vi.fn()
    const designStorage: DesignAssetStorage = { read: async () => {
      throw new Error('unregistered bytes must not be read')
    }, url: async () => {
      throw new Error('unregistered URL must not be derived')
    }, identifyUrl: async () => null }
    const opts = { canonicalDb: admin!, appUrl: 'https://app.example', fetchAsset, uploadAsset, designStorage }
    await expect(prepareCampaignHtmlForSend(before, opts)).rejects.toMatchObject({ statusCode: 409, statusMessage: 'canonical_campaign_asset_correction_required' })
    await expect(materializeRecipients(a.campaignId, opts)).rejects.toMatchObject({ statusCode: 409, statusMessage: 'canonical_campaign_asset_correction_required' })
    await expect(scheduleCampaign(a.campaignId, new Date(Date.now() + 60_000).toISOString(), { ...opts, sendingConfigured: true, senderDomainAuthenticated: true })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'canonical_campaign_asset_correction_required' })
    await admin!.query('UPDATE campaigns SET review_required=true WHERE id=$1', [a.campaignId])
    const target = await loadReviewTarget(admin!, 'campaign', a.campaignId, false)
    const prepareSubmission = vi.fn(async () => {
      throw new Error('legacy mirror callback forbidden')
    })
    await expect(runReviewCommand({ actorId, operationId: crypto.randomUUID(), kind: 'campaign', targetId: a.campaignId, expectedClientId: scope, expectedVersion: 0, expectedContentDigest: target!.digest, payload: { command: 'submit' } }, async () => {}, { transaction: transaction as never, readDb: admin!, readReceipt: async () => null, prepareSubmission, designStorage })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'canonical_campaign_asset_correction_required' })
    expect(prepareSubmission).not.toHaveBeenCalled()
    expect(fetchAsset).not.toHaveBeenCalled()
    expect(uploadAsset).not.toHaveBeenCalled()
    expect(await campaign(a.campaignId)).toMatchObject({ email_design_revision_id: bad.revisionId, body_html: before.body_html })
  })
  databaseTest('readiness rejects a media URL present only in saved compiled HTML before external preparation', async () => {
    const a = await copy()
    const current = await getDesignDraft(a.documentId, authorize, admin!)
    if (current.state !== 'structured') throw new Error('structured fixture required')
    await saveCampaignDesignDraft({ documentId: a.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: a.revisionId, design: current.source, subject: 'Saved output', previewText: null }, authorize,
      { ...testEmailRenderer, renderDocument: async () => '<p>Saved</p><img src="https://external.example/unregistered.png">' }, transaction, { authorizeTemplateRead: (_id, clientId) => authorize(clientId) })
    const fetchAsset = vi.fn(async () => {
      throw new Error('external mirror must not run')
    })
    await expect(preparedCampaignHtml(await campaign(a.campaignId), { canonicalDb: admin!, appUrl: 'https://app.example', fetchAsset, designStorage: { read: async () => {
      throw new Error('unregistered bytes forbidden')
    }, url: async () => '', identifyUrl: async () => null } })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'canonical_campaign_asset_correction_required' })
    expect(fetchAsset).not.toHaveBeenCalled()
  })
  databaseTest('ordinary staff replacement uses the typed registered asset path without structure/publisher authority', async () => {
    useWorkingSource()
    const first = await registeredAsset(), second = await registeredAsset()
    await first.publish()
    await second.publish()
    const storage: DesignAssetStorage = { read: key => key === first.key ? first.storage.read(key) : second.storage.read(key), url: id => id === first.assetId ? first.storage.url(id) : second.storage.url(id), identifyUrl: async url => url === first.url ? first.assetId : url === second.url ? second.assetId : null }
    const image = validateEmailDesign(design)
    image.blocks.image = { type: 'Image', data: { props: { url: first.url, alt: 'Retained alt' } } }
    image.blocks.root.data.childrenIds!.push('image')
    image.lineage.push({ blockId: 'image', nodeId: 'image-node', fields: { url: 'image-field', alt: 'image-alt' } })
    image.policy.editableFields.push('image.data.props.url', 'image.data.props.alt')
    image.assets = [(await first.publish()).asset]
    head = (await saveTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: head, design: image }, authorize, testEmailRenderer, transaction)).revisionId
    await publishSource(storage)
    const a = await copy(selection(), storage)
    const staff: ModuleAuthority = { actorId, read: authorize, contentWrite: async () => {
      await authorize(scope)
      return 'staff'
    }, designer: async () => {
      throw new Error('no structural authority')
    }, publisher: async () => {
      throw new Error('no publisher authority')
    } }
    const request = { version: 1, command: 'replace-published-image', operationId: crypto.randomUUID(), draftId: a.documentId, expectedDraftRevisionId: a.revisionId, blockId: 'image', assetId: second.assetId }
    const saved = await executeDesignModules(request, staff, testEmailRenderer, storage, transaction)
    expect(await executeDesignModules(request, staff, testEmailRenderer, storage, transaction)).toEqual(saved)
    const current = await getDesignDraft(a.documentId, authorize, admin!)
    expect(current).toMatchObject({ baseTemplateRevisionId: head, source: { blocks: { image: { data: { props: { url: second.url, alt: 'Retained alt' } } } }, lineage: image.lineage, policy: image.policy } })
    if (current.state !== 'structured') throw new Error('structured fixture required')
    expect(current.source.assets.map(item => item.id).sort()).toEqual([first.assetId, second.assetId].sort())
    const savedCampaign = await campaign(a.campaignId)
    expect(await preparedCampaignHtml(savedCampaign, { canonicalDb: admin!, designStorage: storage, appUrl: 'https://app.example' })).toBe(savedCampaign.body_html)
    const revokedStorage = { ...storage, read: async (key: string) => {
      const bytes = await storage.read(key)
      revoked = true
      return bytes
    } }
    try {
      await expect(executeDesignModules({ ...request, operationId: crypto.randomUUID(), expectedDraftRevisionId: saved.revisionId, assetId: first.assetId }, staff, testEmailRenderer, revokedStorage, transaction)).rejects.toThrow('synthetic authority denied')
    } finally {
      revoked = false
    }
    expect((await getDesignDraft(a.documentId, authorize, admin!)).headRevisionId).toBe(saved.revisionId)
    const arbitrary = structuredClone(current.source.blocks)
    arbitrary.image.data.props!.url = 'https://unregistered.example/image.png'
    await expect(update(a.campaignId, { body_source: arbitrary }, mutation(saved.revisionId, crypto.randomUUID(), storage))).rejects.toMatchObject({ statusMessage: 'use_registered_image_replacement' })
    await expect(executeDesignModules({ ...request, command: 'insert-published-image', operationId: crypto.randomUUID(), expectedDraftRevisionId: saved.revisionId, blockId: undefined, parentId: 'root', index: 0 }, staff, testEmailRenderer, storage, transaction)).rejects.toThrow()
  })
  databaseTest('REST exact selection and PATCH enforce strict bodies, origin, fresh staff rights and exact canonical CAS', async () => {
    const createHandler = (await import('../../server/api/email/design/campaigns.post')).default
    const legacyCreateHandler = (await import('../../server/api/email/campaigns/index.post')).default
    const patchHandler = (await import('../../server/api/email/campaigns/[id].patch')).default
    const env = { ...emailRendererEnv, FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_LIBRARY_ENABLED: 'true', FIGFLOW_EDM_APP_ORIGIN: 'https://app.example' }
    const http = (handler: typeof createHandler, id?: string) => toWebHandler(createApp().use(defineEventHandler((event) => {
      event.context.cloudflare = { env }
      if (id) event.context.params = { id }
    })).use(handler))
    const request = (path: string, body: unknown, origin = 'https://app.example') => new Request(`https://app.example${path}`, { method: path.includes('/design/') || path === '/api/email/campaigns' ? 'POST' : 'PATCH', headers: { origin, 'cookie': 'auth_token=staff-token', 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const mutableSelection = await http(legacyCreateHandler as never)(request('/api/email/campaigns', { name: 'Legacy mutable selection', client_id: scope, template_id: templateId }))
    expect(mutableSelection.status).toBe(409)
    const createdResponse = await http(createHandler)(request('/api/email/design/campaigns', selection()))
    expect(createdResponse.status).toBe(200)
    const a = await createdResponse.json() as { campaignId: string, revisionId: string }
    const forged = await http(createHandler)(request('/api/email/design/campaigns', { ...selection(), actorId: actorId }))
    expect(forged.status).toBe(400)
    const foreignOrigin = await http(createHandler)(request('/api/email/design/campaigns', selection(), 'https://foreign.example'))
    expect(foreignOrigin.status).toBe(403)
    const missingCas = await http(patchHandler as never, a.campaignId)(request(`/api/email/campaigns/${a.campaignId}`, { subject: 'Missing token' }))
    expect(missingCas.status).toBe(409)
    const patch = { subject: 'REST subject', from_name: 'REST sender', operation_id: crypto.randomUUID(), expected_design_revision_id: a.revisionId }
    const saved = await http(patchHandler as never, a.campaignId)(request(`/api/email/campaigns/${a.campaignId}`, patch))
    expect(saved.status).toBe(200)
    expect(await campaign(a.campaignId)).toMatchObject({ subject: patch.subject, from_name: patch.from_name })
    const changedReplay = await http(patchHandler as never, a.campaignId)(request(`/api/email/campaigns/${a.campaignId}`, { ...patch, from_name: 'Different sender' }))
    expect(changedReplay.status).toBe(409)
    harness.denied = true
    const revoked = await http(createHandler)(request('/api/email/design/campaigns', selection()))
    expect(revoked.status).toBe(401)
  })
  databaseTest('first legacy conversion snapshots its own current row atomically and never guesses template provenance', async () => {
    const legacyId = crypto.randomUUID()
    const edited = structuredDesign().blocks
    edited.heading.data.props.text = 'Existing campaign edits'
    await admin!.query('INSERT INTO campaigns(id,client_id,name,body_source,body_html,subject,template_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [legacyId, scope, 'Legacy campaign', edited, 'Legacy HTML', 'Own subject', templateId])
    const request = { campaignId: legacyId, operationId: crypto.randomUUID() }
    const broken = { ...testEmailRenderer, renderDocument: async () => {
      throw new Error('conversion render failed')
    } }
    await expect(initializeCampaignOwnedDraft(request, authority(), broken, undefined, transaction)).rejects.toThrow('conversion render failed')
    expect((await admin!.query('SELECT id FROM email_design_documents WHERE campaign_id=$1', [legacyId])).rows).toEqual([])
    expect((await campaign(legacyId)).body_html).toBe('Legacy HTML')
    const saved = await initializeCampaignOwnedDraft(request, authority(), testEmailRenderer, undefined, transaction)
    expect(await getDesignDraft(saved.documentId, authorize, admin!)).toMatchObject({ baseTemplateRevisionId: null, metadata: { subject: 'Own subject' }, source: { blocks: edited } })
    expect(await initializeCampaignOwnedDraft(request, authority(), testEmailRenderer, undefined, transaction)).toEqual(saved)
  })
  databaseTest('MCP recovers its committed lost reply from the existing ledger without a second campaign', async () => {
    const ctx = { userId: actorId, userRole: 'staff', permissionGroups: ['MARKETING_MANAGEMENT'], event: { context: { cloudflare: { env: { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_LIBRARY_ENABLED: 'true' } } } }, source: 'mcp' } as unknown as ToolContext
    const args = { clientId: scope, name: 'Lost reply MCP', templateId, templateRevisionId: head, operationId: crypto.randomUUID(), acknowledgement: 'CREATE_CLIENT_EMAIL_DRAFT' }
    const key = `mcp:${sha256(crypto.randomUUID())}`
    const call = () => runDepartmentEmailOperation('marketing_create_email_campaign_draft', args, ctx, key, 'b'.repeat(64), { renderer: () => testEmailRenderer })
    harness.failAfterCommit = true
    expect(await call()).toMatchObject({ ok: false, code: 'unavailable' })
    const before = (await admin!.query('SELECT count(*)::int AS n FROM campaigns')).rows[0].n
    const recovered = await call()
    expect(recovered).toMatchObject({ ok: true, data: { replayed: true, campaignId: expect.any(String) } })
    expect((await admin!.query('SELECT count(*)::int AS n FROM campaigns')).rows[0].n).toBe(before)
    harness.denied = true
    expect(await call()).toMatchObject({ ok: false, code: 'forbidden' })
  })
  databaseTest('MCP exact selection and canonical update stay in the real ledger transaction and expose a separate UUID revision', async () => {
    const ctx = { userId: actorId, userRole: 'staff', permissionGroups: ['MARKETING_MANAGEMENT'], event: { context: { cloudflare: { env: { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_LIBRARY_ENABLED: 'true' } } } }, source: 'mcp' } as unknown as ToolContext
    const args = { clientId: scope, name: 'MCP exact copy', templateId, templateRevisionId: head, operationId: crypto.randomUUID(), acknowledgement: 'CREATE_CLIENT_EMAIL_DRAFT' }
    const key = `mcp:${sha256(crypto.randomUUID())}`
    const call = (name: string, data: unknown, requestKey = key) => runDepartmentEmailOperation(name, data, ctx, requestKey, 'a'.repeat(64), { renderer: () => testEmailRenderer })
    const created = await call('marketing_create_email_campaign_draft', args)
    expect(created).toMatchObject({ ok: true, data: { designRevisionId: expect.any(String), revision: expect.stringMatching(/^[a-f0-9]{64}$/) } })
    if (!created.ok) throw new Error(JSON.stringify(created))
    const result = created.data as { campaignId: string, revision: string, designRevisionId: string }
    expect(result.designRevisionId).toMatch(/^[a-f0-9-]{36}$/)
    expect(await call('marketing_create_email_campaign_draft', args)).toMatchObject({ ok: true, data: { campaignId: result.campaignId, replayed: true } })
    expect(await call('marketing_create_email_campaign_draft', { ...args, templateRevisionId: undefined, operationId: undefined }, `mcp:${sha256(crypto.randomUUID())}`)).toMatchObject({ ok: false, code: 'conflict' })
    const unsafeBlocks = structuredDesign().blocks as unknown as Record<string, { type: string, data: Record<string, unknown> }>
    unsafeBlocks.heading.data.style = { color: '#ff0000' }
    expect(await call('marketing_update_email_campaign_draft', { clientId: scope, campaignId: result.campaignId, expectedRevision: result.revision, expectedDesignRevisionId: result.designRevisionId, operationId: crypto.randomUUID(), patch: { bodySource: unsafeBlocks }, acknowledgement: 'UPDATE_CLIENT_EMAIL_DRAFT' }, `mcp:${sha256(crypto.randomUUID())}`)).toMatchObject({ ok: false, code: 'forbidden' })
    const changed = { clientId: scope, campaignId: result.campaignId, expectedRevision: result.revision, expectedDesignRevisionId: result.designRevisionId, operationId: crypto.randomUUID(), patch: { subject: 'MCP canonical subject', fromName: 'MCP sender' }, acknowledgement: 'UPDATE_CLIENT_EMAIL_DRAFT' }
    expect(await call('marketing_update_email_campaign_draft', changed, `mcp:${sha256(crypto.randomUUID())}`)).toMatchObject({ ok: true, data: { designRevisionId: expect.any(String) } })
    expect(await campaign(result.campaignId)).toMatchObject({ subject: 'MCP canonical subject', from_name: 'MCP sender' })
  })
})
