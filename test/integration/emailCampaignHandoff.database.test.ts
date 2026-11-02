import { initializeCampaignDesignDraft } from '../../server/utils/email-marketing/designInitialization'
import { executeDesignModules, type ModuleAuthority } from '../../server/utils/email-marketing/designModules'
import { publishEmailAsset, type DesignAssetStorage } from '../../server/utils/email-marketing/designAssets'
import fs from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeDesignRoundtrip, executeDesignerRoundtrip, type Authority } from '../../server/utils/email-marketing/designHandoffs'
import { executeDesignTemplates } from '../../server/utils/email-marketing/designTemplates'
import { createCampaignFromTemplateRevision } from '../../server/utils/email-marketing/designCampaigns'
import { ensureLegacyDesignDocument, saveTemplateDesignDraft, saveCampaignDesignDraft, saveStaffCampaignDesignDraft, saveStaffTemplateDesignDraft, type DesignTransaction } from '../../server/utils/email-marketing/designRevisions'
import { getDesignDraft } from '../../server/utils/email-marketing/designReads'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { parseDesignerRoundtripRequest } from '../../shared/emailRendering/designDesigner'
import { parseRoundtripRequest, type DesignHandoff } from '../../shared/emailRendering/designRoundtrip'
import contentHandler from '../../server/api/email/design/roundtrip.post'
import { structuredDesign } from '../fixtures/email-design/structured'
import type { EmailRendererClient } from '../../shared/emailRendering/contract'
import { testEmailRenderer } from '../fixtures/emailRenderer'

// The real HTTP adapter and business transaction run against this suite's PG
// schema; only session/bindings/body transport and the renderer are fixture I/O.
const http = vi.hoisted(() => ({ body: null as unknown, actorId: '', renderer: null as EmailRendererClient | null,
  authorize: null as Authority['authorize'] | null, transaction: null as DesignTransaction | null }))
vi.mock('h3', async original => ({ ...(await original<typeof import('h3')>()), defineEventHandler: (handler: unknown) => handler,
  getCookie: () => 'fixture-session', getHeader: (_event: unknown, key: string) => ({ 'origin': 'https://app.xeroflow.io', 'content-type': 'application/json' })[key], setHeader: () => {} }))
vi.mock('~~/server/utils/auth', () => ({ validateSession: async () => ({ id: http.actorId }) }))
vi.mock('~~/server/utils/email-marketing/designAccess', () => ({ assertFreshDesignAccess: (_token: string, _actorId: string, clientId: string | null, access: 'read' | 'write') => http.authorize!(clientId, access), assertFreshDesignPublisher: async () => {} }))
vi.mock('~~/server/utils/email-marketing/designRequest', async original => ({ ...(await original<typeof import('../../server/utils/email-marketing/designRequest')>()), readBoundedJson: async () => http.body }))
vi.mock('~~/server/utils/email-marketing/render/client', async (original) => {
  const actual = await original<typeof import('../../server/utils/email-marketing/render/client')>()
  return { ...actual, createEmailRenderer: (env: Parameters<typeof actual.createEmailRenderer>[0]) => env.EMAIL_RENDERER ? actual.createEmailRenderer(env) : http.renderer! }
})
vi.mock('~~/server/utils/db', async original => ({ ...(await original<typeof import('../../server/utils/db')>()), transactionWithoutRetry: (callback: Parameters<DesignTransaction>[0]) => http.transaction!(callback) }))
const contentRequest = async (body: unknown, designerEnabled: boolean, savesEnabled = true) => {
  http.body = body
  return contentHandler({ context: { cloudflare: { env: { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: savesEnabled ? 'true' : 'false', FIGFLOW_EDM_DESIGNER_ENABLED: designerEnabled ? 'true' : 'false' } } } } as unknown as Parameters<typeof contentHandler>[0])
}

const socket = process.env.FIGFLOW_DESIGN_PG_SOCKET
const databaseTest = socket ? it : it.skip
const schema = `figflow_campaign_handoff_${Date.now()}_${process.pid}`
const config = () => ({ host: socket, port: 55483, user: 'figflow_test', database: 'figflow_design_test' })
const scope = structuredDesign().scope.clientId!
let admin: pg.Client
let actorId: string
let denied = false
let role: 'staff' | 'designer' = 'designer'
const read = async (id: string | null) => {
  if (denied || id !== scope) throw new Error('fresh authority denied')
}
const authority = (): Authority => ({ actorId, authorize: async (id) => {
  await read(id)
  return role
} })
const transaction: DesignTransaction = async (callback) => {
  const db = new pg.Client(config())
  await db.connect()
  try {
    await db.query('BEGIN')
    await db.query(`SET LOCAL search_path TO ${schema}`)
    const value = await callback(db)
    await db.query('COMMIT')
    return value
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  } finally {
    await db.end()
  }
}
const command = async (input: unknown, renderer = testEmailRenderer, storage?: DesignAssetStorage) => {
  const result = await executeDesignerRoundtrip(parseDesignerRoundtripRequest(input), authority(), renderer, transaction, storage)
  if (!('handoff' in result)) throw new Error('Expected handoff')
  return result
}
const start = async (campaignId: string) => (await command({ command: 'start', operationId: crypto.randomUUID(), owner: { kind: 'campaign', id: campaignId }, clientId: scope })).handoff
const propose = async (handoff: DesignHandoff, storage?: DesignAssetStorage) => (await command({ command: 'propose', handoffId: handoff.id, action: {
  version: 1, action: 'propose-designer-return', operationId: crypto.randomUUID(), scope: { clientId: scope }, draftId: handoff.draftId,
  baseRevisionId: handoff.baseRevisionId, operations: [{ op: 'set-style', blockId: 'heading', style: { color: '#123456' } }]
} }, testEmailRenderer, storage)).handoff
const applyRequest = (handoff: DesignHandoff) => ({ command: 'apply', handoffId: handoff.id, action: { version: 1, action: 'apply-return', operationId: crypto.randomUUID(),
  scope: { clientId: scope }, proposalId: handoff.id, expectedProposalRevisionId: handoff.proposalRevisionId, expectedDraftRevisionId: handoff.baseRevisionId } })
async function legacy() {
  const id = crypto.randomUUID()
  await admin.query('INSERT INTO campaigns(id,client_id,name,subject,preview_text,body_source,body_html) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, scope, 'Own campaign', 'Own subject', 'Own preview', structuredDesign().blocks, '<p>own legacy</p>'])
  return id
}
async function selected() {
  const templateId = crypto.randomUUID()
  await admin.query('INSERT INTO edm_templates(id,client_id,name) VALUES($1,$2,$3)', [templateId, scope, 'Source'])
  const baseline = await ensureLegacyDesignDocument({ kind: 'template', ownerId: templateId, actorId }, read, transaction)
  const source = await saveTemplateDesignDraft({ documentId: baseline.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: baseline.revisionId, design: structuredDesign() }, read, testEmailRenderer, transaction)
  const published = await executeDesignTemplates({ version: 1, command: 'publish-template', operationId: crypto.randomUUID(), draftId: baseline.documentId, expectedRevisionId: source.revisionId, name: 'Published', category: null, includedOverridePaths: [] }, { actorId, read, designer: read, publisher: read }, testEmailRenderer, undefined, transaction)
  return createCampaignFromTemplateRevision({ version: 1, command: 'create-from-template', operationId: crypto.randomUUID(), templateId: published.templateId, revisionId: published.revisionId, clientId: scope, campaign: { name: 'Exact campaign' } }, { actorId, read, write: read }, testEmailRenderer, undefined, transaction)
}
async function imageFixture(explicitGrant = false, type: 'Image' | 'Avatar' = 'Image') {
  const entries = new Map<string, { key: string, url: string, bytes: Uint8Array }>()
  const storage: DesignAssetStorage = {
    read: async (key) => {
      const found = [...entries.values()].find(entry => entry.key === key)
      if (!found) throw new Error('unknown bytes')
      return found.bytes
    },
    url: async (id) => {
      const found = entries.get(id)
      if (!found) throw new Error('unknown asset')
      return found.url
    },
    identifyUrl: async url => [...entries.entries()].find(([, entry]) => entry.url === url)?.[0] ?? null
  }
  const asset = async (client = scope) => {
    const id = crypto.randomUUID(), key = `banner-assets/${actorId}/${id}/image.png`, url = `https://example.invalid/registered/${id}`
    const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lWQAAAAASUVORK5CYII=', 'base64'))
    entries.set(id, { key, url, bytes })
    await admin.query('INSERT INTO banner_assets(id,client_id,uploaded_by,r2_key,url,mime_type,file_size) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, client, actorId, key, url, 'image/png', bytes.length])
    await publishEmailAsset({ version: 1, operationId: crypto.randomUUID(), assetId: id }, actorId, async () => {}, storage, transaction)
    return { id, url }
  }
  const a = await asset(), b = await asset()
  const templateId = crypto.randomUUID()
  await admin.query('INSERT INTO edm_templates(id,client_id,name) VALUES($1,$2,$3)', [templateId, scope, 'Image draft'])
  const baseline = await ensureLegacyDesignDocument({ kind: 'template', ownerId: templateId, actorId }, read, transaction)
  const original = await saveTemplateDesignDraft({ documentId: baseline.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: baseline.revisionId, design: structuredDesign() }, read, testEmailRenderer, transaction)
  const designer: ModuleAuthority = { actorId, read, designer: read, publisher: read }
  const op = crypto.randomUUID(), blockId = `img_${op}`
  let receipt = await executeDesignModules({ version: 1, command: 'insert-published-image', operationId: op, draftId: baseline.documentId, expectedDraftRevisionId: original.revisionId, assetId: a.id, parentId: 'root', index: 0 }, designer, testEmailRenderer, storage, transaction)
  let current = await getDesignDraft(baseline.documentId, read, admin)
  if (current.state !== 'structured') throw new Error('Expected image design')
  if (explicitGrant) {
    // Trusted fixture policy seeding models an existing registered-image URL
    // grant before the insertion default changes; no product row is rewritten.
    const design = validateEmailDesign(current.source)
    if (!design.policy.editableFields.includes(`${blockId}.data.props.url`)) design.policy.editableFields.push(`${blockId}.data.props.url`)
    design.blocks[blockId].type = type
    if (type === 'Image') {
      design.blocks[blockId].data.props!.darkSrc = a.url
      design.policy.editableFields.push(`${blockId}.data.props.darkSrc`)
    }
    receipt = { ...receipt, ...await saveTemplateDesignDraft({ documentId: baseline.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: current.headRevisionId, design }, read, testEmailRenderer, transaction) }
    current = await getDesignDraft(baseline.documentId, read, admin)
  }
  const staff: ModuleAuthority = { actorId, read, contentWrite: async (client) => {
    await read(client)
    return 'staff'
  }, designer: async () => {
    throw new Error('no structure grant')
  }, publisher: async () => {
    throw new Error('no publisher grant')
  } }
  return { a, b, asset, blockId, templateId, documentId: baseline.documentId, receipt, storage, staff, designer, current }
}
describe('campaign handoffs in unique real PostgreSQL schemas', () => {
  beforeAll(async () => {
    if (!socket) return
    if (socket !== '/private/tmp/figflow-postgres-20261102-recovered') throw new Error('Requires assigned disposable PostgreSQL')
    admin = new pg.Client(config())
    await admin.connect()
    await admin.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`)
    await admin.query(`CREATE TABLE agency_clients(id uuid PRIMARY KEY); CREATE TABLE edm_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,name text,folder_name text,created_by uuid,subject text,preview_text text,body_source jsonb,body_html text,template_kind text DEFAULT 'draft',updated_at timestamptz DEFAULT now());
      CREATE TABLE edm_custom_modules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,blocks jsonb); CREATE TABLE banner_assets(id uuid PRIMARY KEY,client_id uuid,uploaded_by uuid,r2_key text,url text,mime_type text,file_size integer);
      CREATE TABLE campaigns(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,name text,subject text,preview_text text,from_name text,from_email text,reply_to text,filter_rules jsonb,template_id uuid,status text DEFAULT 'draft',body_source jsonb,body_html text,created_by uuid,updated_at timestamptz DEFAULT now());`)
    for (let i = 0; i < 2; i++) for (const file of ['491_email_design_revisions.sql', '492_email_design_revision_metadata.sql', '493_email_design_handoffs.sql', '494_email_merge_tag_definitions.sql', '495_email_asset_publication.sql', '496_email_content_conditions.sql', '498_email_campaign_design_projection.sql']) await admin.query(fs.readFileSync(new URL(`../../server/database/migrations/${file}`, import.meta.url), 'utf8'))
    await admin.query('INSERT INTO agency_clients VALUES($1)', [scope])
  })
  beforeEach(() => {
    actorId = crypto.randomUUID()
    denied = false
    role = 'designer'
    http.actorId = actorId
    http.authorize = authority().authorize
    http.transaction = transaction
    http.renderer = testEmailRenderer
  })
  afterAll(async () => {
    if (!admin) return
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    expect((await admin.query('SELECT nspname FROM pg_namespace WHERE nspname=$1', [schema])).rows).toEqual([])
    await admin.end()
  })
  databaseTest('content HTTP campaign start requires the trusted designer release gate before conversion', async () => {
    const id = await legacy()
    const request = { command: 'start', operationId: crypto.randomUUID(), owner: { kind: 'campaign', id }, clientId: scope }
    await expect(contentRequest(request, false)).rejects.toMatchObject({ statusCode: 404 })
    expect((await admin.query('SELECT id FROM email_design_documents WHERE campaign_id=$1', [id])).rows).toEqual([])
    expect((await admin.query('SELECT email_design_revision_id FROM campaigns WHERE id=$1', [id])).rows[0].email_design_revision_id).toBeNull()
    const enabled = await contentRequest(request, true)
    expect(enabled).toMatchObject({ handoff: { owner: { kind: 'campaign', id }, state: 'open' } })
    await expect(contentRequest(request, false)).rejects.toMatchObject({ statusCode: 404 })
    await expect(contentRequest(request, true, false)).rejects.toMatchObject({ statusCode: 404 })
    expect(await contentRequest({ command: 'lookup', owner: { kind: 'campaign', id } }, false)).toMatchObject({ campaignAuthoring: { available: false } })
  })
  databaseTest('content HTTP resolves persisted campaign documents and handoffs for release checks while legacy templates retain their gate', async () => {
    const id = await legacy()
    const baseline = await initializeCampaignDesignDraft({ campaignId: id, actorId, expectedClientId: scope }, read, transaction)
    const request = { command: 'open', operationId: crypto.randomUUID(), draftId: baseline.documentId, expectedRevisionId: baseline.revisionId }
    await expect(contentRequest(request, false)).rejects.toMatchObject({ statusCode: 404 })
    expect((await admin.query('SELECT head_revision_id FROM email_design_documents WHERE id=$1', [baseline.documentId])).rows[0].head_revision_id).toBe(baseline.revisionId)
    const enabled = await contentRequest(request, true)
    if (!('handoff' in enabled)) throw new Error('Expected handoff')
    const handoff = enabled.handoff
    const next = validateEmailDesign(handoff.source)
    next.blocks.heading.data.props!.text = 'Saved content route edit'
    const proposal = { command: 'propose', handoffId: handoff.id, action: { version: 1, action: 'propose-return', operationId: crypto.randomUUID(), scope: { clientId: scope }, draftId: handoff.draftId, baseRevisionId: handoff.baseRevisionId, design: next } }
    await expect(contentRequest(proposal, false)).rejects.toMatchObject({ statusCode: 404 })
    await expect(contentRequest({ command: 'resume', handoffId: handoff.id }, false)).rejects.toMatchObject({ statusCode: 404 })
    const proposed = await contentRequest(proposal, true)
    expect(proposed).toMatchObject({ handoff: { state: 'proposed' } })
    if (!('handoff' in proposed)) throw new Error('Expected proposed handoff')
    const recover = { command: 'save-proposal-as-new-draft', handoffId: handoff.id, action: { version: 1, action: 'save-proposal-as-new-draft', operationId: crypto.randomUUID(), scope: { clientId: scope }, proposalId: handoff.id, expectedProposalRevisionId: proposed.handoff.proposalRevisionId, name: 'Content recovery control' } }
    await expect(contentRequest(recover, false)).rejects.toMatchObject({ statusCode: 404 })
    expect(await contentRequest(recover, true)).toHaveProperty('recovery.campaignId')
    await expect(contentRequest(recover, false)).rejects.toMatchObject({ statusCode: 404 })
    await expect(contentRequest(recover, true, false)).rejects.toMatchObject({ statusCode: 404 })
    const templateId = crypto.randomUUID()
    await admin.query('INSERT INTO edm_templates(id,client_id,name,body_source,body_html) VALUES($1,$2,$3,$4,$5)', [templateId, scope, 'Legacy content', structuredDesign().blocks, '<p>legacy</p>'])
    expect(await contentRequest({ command: 'start', operationId: crypto.randomUUID(), templateId, clientId: scope }, false)).toMatchObject({ handoff: { templateId, state: 'open' } })
  })
  databaseTest('first Open converts the own legacy row and creates the owner-bound handoff atomically', async () => {
    const templateCount = (await admin.query('SELECT count(*)::int AS n FROM edm_templates')).rows[0].n
    const id = await legacy()
    const handoff = await start(id)
    expect(handoff.owner).toEqual({ kind: 'campaign', id })
    expect(handoff).not.toHaveProperty('templateId')
    expect(handoff.source.kind).toBe('campaign-draft')
    expect(handoff.source.blocks).toEqual(structuredDesign().blocks)
    const draft = await getDesignDraft(handoff.draftId, read, admin)
    expect(draft).toMatchObject({ owner: { kind: 'campaign', id }, baseTemplateRevisionId: null, headRevisionId: handoff.baseRevisionId, metadata: { subject: 'Own subject', previewText: 'Own preview' }, projection: { state: 'current' } })
    expect((await admin.query('SELECT count(*)::int AS n FROM edm_templates')).rows[0].n).toBe(templateCount)
  })
  databaseTest('structured campaign Apply, staff successor and exact reopen retain the campaign identity and template pin', async () => {
    const campaign = await selected()
    let handoff = await propose(await start(campaign.campaignId))
    const applied = await command(applyRequest(handoff))
    let draft = await getDesignDraft(campaign.documentId, read, admin)
    if (draft.state !== 'structured') throw new Error('Expected structured')
    expect((draft.source.blocks.heading.data.style as Record<string, unknown>)?.color).toBe('#123456')
    const pin = draft.baseTemplateRevisionId
    const content = validateEmailDesign(draft.source)
    content.blocks.heading.data.props!.text = 'Saved staff heading'
    const saved = await saveStaffCampaignDesignDraft({ documentId: draft.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: draft.headRevisionId, design: content, subject: 'Staff subject', previewText: 'Staff preview' }, read, testEmailRenderer, transaction, { authorizeTemplateRead: async (_id, client) => read(client) })
    handoff = (await command({ command: 'open', operationId: crypto.randomUUID(), draftId: draft.documentId, expectedRevisionId: saved.revisionId })).handoff
    expect(handoff.owner).toEqual({ kind: 'campaign', id: campaign.campaignId })
    expect(handoff.source).toEqual(content)
    draft = await getDesignDraft(campaign.documentId, read, admin)
    expect(draft.baseTemplateRevisionId).toBe(pin)
    expect(applied.handoff.appliedRevisionId).not.toBe(campaign.revisionId)
    await expect(command({ command: 'open', operationId: crypto.randomUUID(), draftId: draft.documentId, expectedRevisionId: campaign.revisionId })).rejects.toThrow('REVISION_CONFLICT')
  })
  databaseTest('stale Apply preserves the proposal and recovery is idempotent per named-copy operation', async () => {
    const campaign = await selected()
    const a = await propose(await start(campaign.campaignId))
    const b = await propose(await start(campaign.campaignId))
    const applied = await command(applyRequest(a))
    await expect(command(applyRequest(b))).rejects.toThrow('REVISION_CONFLICT')
    const request = { command: 'save-proposal-as-new-draft', handoffId: b.id, action: { version: 1, action: 'save-proposal-as-new-draft', operationId: crypto.randomUUID(), scope: { clientId: scope }, proposalId: b.id, expectedProposalRevisionId: b.proposalRevisionId, name: 'Recovered campaign' } }
    const recovered = await command(request)
    expect(recovered.recovery?.campaignId).not.toBe(campaign.campaignId)
    expect((await command(request)).recovery).toEqual(recovered.recovery)
    await expect(command({ ...request, action: { ...request.action, name: 'Changed replay' } })).rejects.toThrow('IDEMPOTENCY_CONFLICT')
    const copy = await getDesignDraft(recovered.recovery!.documentId, read, admin)
    expect(copy).toMatchObject({ state: 'structured', source: b.proposal })
    expect((await admin.query('SELECT status,from_email,filter_rules FROM campaigns WHERE id=$1', [recovered.recovery!.campaignId])).rows[0]).toEqual({ status: 'draft', from_email: null, filter_rules: null })
    expect((await command({ command: 'resume', handoffId: b.id })).handoff.state).toBe('proposed')
    const another = { ...request, action: { ...request.action, operationId: crypto.randomUUID(), name: 'Explicit second named copy' } }
    const second = await command(another)
    expect(second.recovery!.campaignId).not.toBe(recovered.recovery!.campaignId)
    expect((await command(another)).recovery).toEqual(second.recovery)
    expect((await getDesignDraft(campaign.documentId, read, admin)).headRevisionId).toBe(applied.handoff.appliedRevisionId)
    await admin.query('UPDATE campaigns SET status=\'scheduled\' WHERE id=$1', [campaign.campaignId])
    await expect(command({ ...request, action: { ...request.action, operationId: crypto.randomUUID(), name: 'Frozen source new action' } })).rejects.toThrow('CAMPAIGN_FROZEN')
  })
  databaseTest('committed recovery replay reads original C after downgrade, asset loss and retention expiry with zero writes or rendering', async () => {
    const fixture = await imageFixture()
    const publication = await executeDesignTemplates({ version: 1, command: 'publish-template', operationId: crypto.randomUUID(), draftId: fixture.documentId, expectedRevisionId: fixture.receipt.revisionId, name: 'Registered recovery source', category: null, includedOverridePaths: [] }, fixture.designer, testEmailRenderer, fixture.storage, transaction)
    const campaign = await createCampaignFromTemplateRevision({ version: 1, command: 'create-from-template', operationId: crypto.randomUUID(), templateId: publication.templateId, revisionId: publication.revisionId, clientId: scope, campaign: { name: 'Original A' } }, { actorId, read, write: read }, testEmailRenderer, fixture.storage, transaction)
    const opened = (await command({ command: 'start', operationId: crypto.randomUUID(), owner: { kind: 'campaign', id: campaign.campaignId }, clientId: scope }, testEmailRenderer, fixture.storage)).handoff
    const proposal = await propose(opened, fixture.storage)
    const request = { command: 'save-proposal-as-new-draft', handoffId: proposal.id, action: { version: 1, action: 'save-proposal-as-new-draft', operationId: crypto.randomUUID(), scope: { clientId: scope }, proposalId: proposal.id, expectedProposalRevisionId: proposal.proposalRevisionId, name: 'Recorded C' } }
    const lost: DesignTransaction = async (callback) => {
      await transaction(callback)
      throw new Error('committed recovery reply lost')
    }
    await expect(executeDesignerRoundtrip(parseDesignerRoundtripRequest(request), authority(), testEmailRenderer, lost, fixture.storage)).rejects.toThrow('committed recovery reply lost')
    const recorded = (await admin.query('SELECT r.document_id,r.revision_id,d.campaign_id FROM email_design_revision_receipts r JOIN email_design_documents d ON d.id=r.document_id WHERE r.actor_id=$1 AND r.operation_id=$2', [actorId, request.action.operationId])).rows[0]
    const c = await getDesignDraft(recorded.document_id, read, admin)
    if (c.state !== 'structured') throw new Error('Expected recorded C')
    const edited = validateEmailDesign(c.source)
    edited.blocks.heading.data.props!.text = 'C edited after receipt'
    const advanced = await saveStaffCampaignDesignDraft({ documentId: c.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: c.headRevisionId, design: edited, subject: c.metadata.subject, previewText: c.metadata.previewText }, read, testEmailRenderer, transaction, { authorizeTemplateRead: async (_id, client) => read(client) })
    await admin.query('UPDATE campaigns SET status=\'scheduled\' WHERE id=ANY($1::uuid[])', [[campaign.campaignId, recorded.campaign_id]])
    // Owned synthetic fixture clock advance only; production history is never
    // rewritten. This simulates time passing after an actual committed reply.
    await admin.query('ALTER TABLE email_design_handoffs DISABLE TRIGGER email_design_handoff_transition')
    try {
      await admin.query('UPDATE email_design_handoffs SET created_at=clock_timestamp()-interval \'33 days\',expires_at=clock_timestamp()-interval \'32 days\' WHERE id=$1', [proposal.id])
    } finally {
      await admin.query('ALTER TABLE email_design_handoffs ENABLE TRIGGER email_design_handoff_transition')
    }
    role = 'staff'
    let external = 0
    const unavailable = async (): Promise<never> => {
      external++
      throw new Error('external readiness unavailable')
    }
    const unavailableStorage = { read: unavailable, url: unavailable, identifyUrl: unavailable }
    const unavailableRenderer = { ...testEmailRenderer, renderDocument: unavailable }
    const guardedTables = ['campaigns', 'email_design_documents', 'email_design_revisions', 'email_design_handoffs', 'email_design_revision_receipts', 'email_design_handoff_receipts']
    await admin.query('CREATE FUNCTION refuse_recovery_replay_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'recovery replay attempted write\'; END $$')
    for (const table of guardedTables) await admin.query(`CREATE TRIGGER refuse_recovery_replay_write BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION refuse_recovery_replay_write()`)
    try {
      const readOnly: Authority = { actorId, authorize: async (clientId, access) => {
        if (access !== 'read') throw new Error('creative authority must not be requested')
        await read(clientId)
        return 'staff'
      } }
      const replay = await executeDesignerRoundtrip(parseDesignerRoundtripRequest(request), readOnly, unavailableRenderer, transaction, unavailableStorage)
      if (!('handoff' in replay)) throw new Error('Expected recorded handoff')
      expect(replay.recovery).toEqual({ campaignId: recorded.campaign_id, documentId: recorded.document_id, revisionId: recorded.revision_id })
      expect(external).toBe(0)
      expect((await getDesignDraft(c.documentId, read, admin)).headRevisionId).toBe(advanced.revisionId)
      const parsed = parseDesignerRoundtripRequest(request)
      await expect(executeDesignerRoundtrip(parsed, { ...authority(), actorId: crypto.randomUUID() }, unavailableRenderer, transaction, unavailableStorage)).rejects.toThrow('NOT_FOUND')
      for (const action of [{ ...request.action, name: 'Changed name' }, { ...request.action, scope: { clientId: crypto.randomUUID() } }, { ...request.action, expectedProposalRevisionId: crypto.randomUUID() }]) await expect(command({ ...request, action }, unavailableRenderer, unavailableStorage)).rejects.toThrow('IDEMPOTENCY_CONFLICT')
      await expect(executeDesignRoundtrip(parseRoundtripRequest(request), authority(), unavailableRenderer, transaction, unavailableStorage)).rejects.toThrow('IDEMPOTENCY_CONFLICT')
      let reads = 0
      await expect(executeDesignerRoundtrip(parsed, { actorId, authorize: async (_client, access) => {
        if (access !== 'read') throw new Error('creative access requested')
        if (++reads >= 2) throw new Error('destination read revoked')
        return 'staff'
      } }, unavailableRenderer, transaction, unavailableStorage)).rejects.toThrow('destination read revoked')
      denied = true
      await expect(command(request, unavailableRenderer, unavailableStorage)).rejects.toThrow('fresh authority denied')
      expect(external).toBe(0)
    } finally {
      for (const table of guardedTables) await admin.query(`DROP TRIGGER refuse_recovery_replay_write ON ${table}`)
      await admin.query('DROP FUNCTION refuse_recovery_replay_write()')
    }
  })
  databaseTest('known recovery receipts with missing or mismatched canonical effects fail closed instead of creating another campaign', async () => {
    const campaign = await selected(), proposal = await propose(await start(campaign.campaignId))
    const request = { command: 'save-proposal-as-new-draft', handoffId: proposal.id, action: { version: 1, action: 'save-proposal-as-new-draft', operationId: crypto.randomUUID(), scope: { clientId: scope }, proposalId: proposal.id, expectedProposalRevisionId: proposal.proposalRevisionId, name: 'Canonical C' } }
    const committed = await command(request)
    const original = (await admin.query('SELECT request_text FROM email_design_handoff_receipts WHERE actor_id=$1 AND operation_id=$2', [actorId, request.action.operationId])).rows[0].request_text
    const count = (await admin.query('SELECT count(*)::int AS n FROM campaigns')).rows[0].n
    for (const mismatch of [false, true]) {
      const operationId = crypto.randomUUID()
      await admin.query('INSERT INTO email_design_handoff_receipts(actor_id,operation_id,handoff_id,request_text) VALUES($1,$2,$3,$4)', [actorId, operationId, proposal.id, original.replaceAll(request.action.operationId, operationId)])
      if (mismatch) await admin.query('INSERT INTO email_design_revision_receipts(actor_id,operation_id,document_id,revision_id,payload_sha256) VALUES($1,$2,$3,$4,$5)', [actorId, operationId, committed.recovery!.documentId, committed.recovery!.revisionId, 'a'.repeat(64)])
      await expect(command({ ...request, action: { ...request.action, operationId } })).rejects.toThrow('IDEMPOTENCY_CONFLICT')
    }
    const canonicalOnly = crypto.randomUUID()
    await admin.query('INSERT INTO email_design_revision_receipts(actor_id,operation_id,document_id,revision_id,payload_sha256) VALUES($1,$2,$3,$4,$5)', [actorId, canonicalOnly, committed.recovery!.documentId, committed.recovery!.revisionId, 'b'.repeat(64)])
    await expect(command({ ...request, action: { ...request.action, operationId: canonicalOnly } })).rejects.toThrow('IDEMPOTENCY_CONFLICT')
    await expect(command({ command: 'cancel', handoffId: proposal.id, action: { version: 1, action: 'cancel-return', operationId: request.action.operationId, scope: { clientId: scope }, proposalId: proposal.id, expectedProposalRevisionId: proposal.proposalRevisionId } })).rejects.toThrow('IDEMPOTENCY_CONFLICT')
    expect((await admin.query('SELECT count(*)::int AS n FROM campaigns')).rows[0].n).toBe(count)
  })
  databaseTest('first Open rollback leaves no baseline or handoff after render refusal', async () => {
    const id = await legacy()
    await expect(command({ command: 'start', operationId: crypto.randomUUID(), owner: { kind: 'campaign', id }, clientId: scope }, { ...testEmailRenderer, renderDocument: async () => {
      throw new Error('render refused')
    } })).rejects.toThrow('render refused')
    expect((await admin.query('SELECT id FROM email_design_documents WHERE campaign_id=$1', [id])).rows).toEqual([])
    expect((await admin.query('SELECT email_design_revision_id FROM campaigns WHERE id=$1', [id])).rows[0].email_design_revision_id).toBeNull()
  })
  databaseTest('keeps historical resume and exact Apply receipts readable after freeze while new writes refuse', async () => {
    const campaign = await selected()
    const appliedProposal = await propose(await start(campaign.campaignId))
    const apply = applyRequest(appliedProposal)
    const committed = await command(apply)
    const pending = await propose(await start(campaign.campaignId))
    const cancelled = await propose(await start(campaign.campaignId))
    const cancel = { command: 'cancel', handoffId: cancelled.id, action: { version: 1, action: 'cancel-return', operationId: crypto.randomUUID(), scope: { clientId: scope }, proposalId: cancelled.id, expectedProposalRevisionId: cancelled.proposalRevisionId } }
    await command(cancel)
    await admin.query('UPDATE campaigns SET status=\'scheduled\' WHERE id=$1', [campaign.campaignId])
    expect((await command({ command: 'resume', handoffId: appliedProposal.id })).handoff.state).toBe('applied')
    expect((await command(apply)).handoff.appliedRevisionId).toBe(committed.handoff.appliedRevisionId)
    await expect(command(applyRequest(pending))).rejects.toThrow('CAMPAIGN_FROZEN')
    await expect(command({ command: 'open', operationId: crypto.randomUUID(), draftId: campaign.documentId, expectedRevisionId: committed.handoff.appliedRevisionId })).rejects.toThrow('CAMPAIGN_FROZEN')
    role = 'staff'
    const originalStart = { command: 'start', operationId: appliedProposal.id, owner: { kind: 'campaign', id: campaign.campaignId }, clientId: scope }
    const guardedTables = ['campaigns', 'email_design_documents', 'email_design_revisions', 'email_design_handoffs', 'email_design_revision_receipts', 'email_design_handoff_receipts']
    await admin.query('CREATE FUNCTION refuse_historical_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'historical replay attempted write\'; END $$')
    for (const table of guardedTables) await admin.query(`CREATE TRIGGER refuse_historical_write BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION refuse_historical_write()`)
    try {
      expect((await command({ command: 'resume', handoffId: appliedProposal.id })).handoff.state).toBe('applied')
      expect((await command(originalStart)).handoff.state).toBe('applied')
      expect((await command(cancel)).handoff.state).toBe('cancelled')
      expect((await command(apply)).handoff.appliedRevisionId).toBe(committed.handoff.appliedRevisionId)
      await expect(command({ ...originalStart, owner: { kind: 'template', id: campaign.campaignId } })).rejects.toThrow('IDEMPOTENCY_CONFLICT')
      await expect(command({ ...originalStart, clientId: crypto.randomUUID() })).rejects.toThrow('IDEMPOTENCY_CONFLICT')
      await expect(command({ ...apply, action: { ...apply.action, expectedDraftRevisionId: crypto.randomUUID() } })).rejects.toThrow('IDEMPOTENCY_CONFLICT')
      await expect(executeDesignRoundtrip(parseRoundtripRequest(originalStart), authority(), testEmailRenderer, transaction)).rejects.toThrow('IDEMPOTENCY_CONFLICT')
      await expect(executeDesignerRoundtrip(parseDesignerRoundtripRequest(originalStart), { ...authority(), actorId: crypto.randomUUID() }, testEmailRenderer, transaction)).rejects.toThrow('NOT_FOUND')
      await expect(command({ command: 'start', operationId: pending.id, owner: { kind: 'campaign', id: campaign.campaignId }, clientId: scope })).rejects.toThrow('DESIGNER_REQUIRED')
      await expect(command({ ...originalStart, operationId: crypto.randomUUID() })).rejects.toThrow('DESIGNER_REQUIRED')
      denied = true
      await expect(command(originalStart)).rejects.toThrow('fresh authority denied')
      await expect(command(apply)).rejects.toThrow('fresh authority denied')
      await expect(command({ command: 'resume', handoffId: pending.id })).rejects.toThrow('fresh authority denied')
    } finally {
      for (const table of guardedTables) await admin.query(`DROP TRIGGER refuse_historical_write ON ${table}`)
      await admin.query('DROP FUNCTION refuse_historical_write()')
    }
  })
  databaseTest('reconciles a committed lost start reply without another conversion or handoff', async () => {
    const id = await legacy(), operationId = crypto.randomUUID()
    const request = parseDesignerRoundtripRequest({ command: 'start', operationId, owner: { kind: 'campaign', id }, clientId: scope })
    const lost: DesignTransaction = async (callback) => {
      await transaction(callback)
      throw new Error('committed reply lost')
    }
    await expect(executeDesignerRoundtrip(request, authority(), testEmailRenderer, lost)).rejects.toThrow('committed reply lost')
    const retry = await command(request)
    expect(retry.handoff.id).toBe(operationId)
    expect((await admin.query('SELECT count(*)::int AS n FROM email_design_handoffs WHERE document_id=$1', [retry.handoff.draftId])).rows[0].n).toBe(1)
    expect((await admin.query('SELECT count(*)::int AS n FROM email_design_revisions WHERE document_id=$1', [retry.handoff.draftId])).rows[0].n).toBe(2)
  })
  databaseTest('rolls conversion back when handoff insertion fails and refuses authority revoked during render', async () => {
    const id = await legacy()
    await admin.query('CREATE FUNCTION refuse_handoff() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'handoff insert refused\'; END $$; CREATE TRIGGER refuse_handoff BEFORE INSERT ON email_design_handoffs FOR EACH ROW EXECUTE FUNCTION refuse_handoff()')
    try {
      await expect(start(id)).rejects.toThrow('handoff insert refused')
    } finally {
      await admin.query('DROP TRIGGER refuse_handoff ON email_design_handoffs; DROP FUNCTION refuse_handoff()')
    }
    expect((await admin.query('SELECT id FROM email_design_documents WHERE campaign_id=$1', [id])).rows).toEqual([])
    const revoked = await legacy()
    const renderer = { ...testEmailRenderer, renderDocument: async (...args: Parameters<typeof testEmailRenderer.renderDocument>) => {
      const html = await testEmailRenderer.renderDocument(...args)
      denied = true
      return html
    } }
    await expect(command({ command: 'start', operationId: crypto.randomUUID(), owner: { kind: 'campaign', id: revoked }, clientId: scope }, renderer)).rejects.toThrow('fresh authority denied')
    denied = false
    expect((await admin.query('SELECT id FROM email_design_documents WHERE campaign_id=$1', [revoked])).rows).toEqual([])
  })
  databaseTest('content-mode campaign Apply uses the campaign writer without accepting a designer payload', async () => {
    const campaign = await selected()
    const execute = async (request: unknown) => {
      const { executeDesignRoundtrip } = await import('../../server/utils/email-marketing/designHandoffs')
      const { parseRoundtripRequest } = await import('../../shared/emailRendering/designRoundtrip')
      const result = await executeDesignRoundtrip(parseRoundtripRequest(request), authority(), testEmailRenderer, transaction)
      if (!('handoff' in result)) throw new Error('Expected handoff')
      return result.handoff
    }
    const opened = await execute({ command: 'open', operationId: crypto.randomUUID(), draftId: campaign.documentId, expectedRevisionId: campaign.revisionId })
    const design = validateEmailDesign(opened.source)
    design.blocks.heading.data.props!.text = 'Content campaign edit'
    const proposal = await execute({ command: 'propose', handoffId: opened.id, action: { version: 1, action: 'propose-return', operationId: crypto.randomUUID(), scope: design.scope, draftId: opened.draftId, baseRevisionId: opened.baseRevisionId, design } })
    const applied = await execute(applyRequest(proposal))
    expect((await getDesignDraft(campaign.documentId, read, admin))).toMatchObject({ source: design, headRevisionId: applied.appliedRevisionId })
  })
  databaseTest('recovery receipt failure rolls back every new campaign row and leaves the original proposal', async () => {
    const campaign = await selected(), proposal = await propose(await start(campaign.campaignId))
    const before = (await admin.query('SELECT count(*)::int AS n FROM campaigns')).rows[0].n
    await admin.query('CREATE FUNCTION refuse_recovery_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'receipt refused\'; END $$; CREATE TRIGGER refuse_recovery_receipt BEFORE INSERT ON email_design_revision_receipts FOR EACH ROW EXECUTE FUNCTION refuse_recovery_receipt()')
    try {
      await expect(command({ command: 'save-proposal-as-new-draft', handoffId: proposal.id, action: { version: 1, action: 'save-proposal-as-new-draft', operationId: crypto.randomUUID(), scope: { clientId: scope }, proposalId: proposal.id, expectedProposalRevisionId: proposal.proposalRevisionId, name: 'Must roll back' } })).rejects.toThrow('receipt refused')
    } finally {
      await admin.query('DROP TRIGGER refuse_recovery_receipt ON email_design_revision_receipts; DROP FUNCTION refuse_recovery_receipt()')
    }
    expect((await admin.query('SELECT count(*)::int AS n FROM campaigns')).rows[0].n).toBe(before)
    expect((await command({ command: 'resume', handoffId: proposal.id })).handoff.state).toBe('proposed')
  })
  databaseTest('refuses an unregistered source image before native Open can request bytes', async () => {
    const campaign = await selected()
    const draft = await getDesignDraft(campaign.documentId, read, admin)
    if (draft.state !== 'structured') throw new Error('Expected structured')
    const design = validateEmailDesign(draft.source)
    design.blocks.remote = { type: 'Image', data: { props: { url: 'https://example.invalid/unregistered.png', alt: 'Unregistered' } } }
    design.blocks.root.data.childrenIds!.push('remote')
    const saved = await saveCampaignDesignDraft({ documentId: draft.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: draft.headRevisionId, design,
      subject: draft.metadata.subject, previewText: draft.metadata.previewText }, read, testEmailRenderer, transaction, { authorizeTemplateRead: async (_id, client) => read(client) })
    let reads = 0
    const storage = { identifyUrl: async () => null, url: async (id: string) => `https://example.invalid/${id}`, read: async () => {
      reads++
      return null
    } }
    await expect(executeDesignerRoundtrip(parseDesignerRoundtripRequest({ command: 'open', operationId: crypto.randomUUID(), draftId: draft.documentId, expectedRevisionId: saved.revisionId }), authority(), testEmailRenderer, transaction, storage)).rejects.toThrow('ASSET_NOT_READY')
    expect(reads).toBe(0)
  })

  databaseTest('generic staff save refuses registered Image and Avatar source URL changes without head, projection or receipt effects', async () => {
    for (const type of ['Image', 'Avatar'] as const) {
      const fixture = await imageFixture(true, type)
      const current = fixture.current
      if (current.state !== 'structured') throw new Error('Expected registered source')
      const before = (await admin.query('SELECT * FROM edm_templates WHERE id=$1', [fixture.templateId])).rows[0]
      for (const [field, value] of [['url', 'https://example.invalid/raw.png'], ['url', fixture.b.url], ...(type === 'Image' ? [['darkSrc', 'https://example.invalid/dark.png']] : [])]) {
        const design = validateEmailDesign(current.source)
        design.blocks[fixture.blockId].data.props![field] = value
        const operationId = crypto.randomUUID()
        await expect(saveStaffTemplateDesignDraft({ documentId: fixture.documentId, actorId, operationId, expectedRevisionId: current.headRevisionId, design }, read, testEmailRenderer, transaction)).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
        expect((await getDesignDraft(fixture.documentId, read, admin)).headRevisionId).toBe(current.headRevisionId)
        expect((await admin.query('SELECT * FROM edm_templates WHERE id=$1', [fixture.templateId])).rows[0]).toEqual(before)
        expect((await admin.query('SELECT operation_id FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2', [actorId, operationId])).rows).toEqual([])
      }
    }
  })
  databaseTest('new registered insertion grants typed ordinary-staff replacement while preserving saved policy and lineage', async () => {
    const fixture = await imageFixture()
    const current = fixture.current
    if (current.state !== 'structured') throw new Error('Expected registered design')
    expect(current.source.policy.editableFields).toContain(`${fixture.blockId}.data.props.url`)
    const request = { version: 1, command: 'replace-published-image', operationId: crypto.randomUUID(), draftId: fixture.documentId, expectedDraftRevisionId: current.headRevisionId, blockId: fixture.blockId, assetId: fixture.b.id }
    const saved = await executeDesignModules(request, fixture.staff, testEmailRenderer, fixture.storage, transaction)
    const after = await getDesignDraft(fixture.documentId, read, admin)
    expect(after).toMatchObject({ source: { blocks: { [fixture.blockId]: { data: { props: { url: fixture.b.url } } } }, policy: current.source.policy, lineage: current.source.lineage }, headRevisionId: saved.revisionId })
    expect(await executeDesignModules(request, fixture.staff, testEmailRenderer, fixture.storage, transaction)).toEqual(saved)
  })

  databaseTest('new image staff replacement refuses foreign, locked and revoked requests without advancing its head', async () => {
    const fixture = await imageFixture()
    const current = fixture.current
    if (current.state !== 'structured') throw new Error('Expected image')
    const request = { version: 1, command: 'replace-published-image', operationId: crypto.randomUUID(), draftId: fixture.documentId, expectedDraftRevisionId: current.headRevisionId, blockId: fixture.blockId, assetId: fixture.b.id }
    const foreignScope = crypto.randomUUID()
    await admin.query('INSERT INTO agency_clients VALUES($1)', [foreignScope])
    const foreign = await fixture.asset(foreignScope)
    await expect(executeDesignModules({ ...request, assetId: foreign.id }, fixture.staff, testEmailRenderer, fixture.storage, transaction)).rejects.toThrow()
    expect((await getDesignDraft(fixture.documentId, read, admin)).headRevisionId).toBe(current.headRevisionId)
    await expect(executeDesignModules(request, fixture.staff, { ...testEmailRenderer, renderDocument: async (...args) => {
      const html = await testEmailRenderer.renderDocument(...args)
      denied = true
      return html
    } }, fixture.storage, transaction)).rejects.toThrow('fresh authority denied')
    denied = false
    expect((await getDesignDraft(fixture.documentId, read, admin)).headRevisionId).toBe(current.headRevisionId)
    expect((await admin.query('SELECT operation_id FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2', [actorId, request.operationId])).rows).toEqual([])
    const locked = validateEmailDesign(current.source)
    locked.policy.designerLocks = { blockIds: [fixture.blockId], styleFields: [] }
    const saved = await saveTemplateDesignDraft({ documentId: fixture.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: current.headRevisionId, design: locked }, read, testEmailRenderer, transaction)
    await expect(executeDesignModules({ ...request, expectedDraftRevisionId: saved.revisionId }, fixture.staff, testEmailRenderer, fixture.storage, transaction)).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
    expect((await getDesignDraft(fixture.documentId, read, admin)).headRevisionId).toBe(saved.revisionId)
  })
  databaseTest('assetless legacy template content retains URL editing and historical receipt replay', async () => {
    const templateId = crypto.randomUUID()
    await admin.query('INSERT INTO edm_templates(id,client_id,name) VALUES($1,$2,$3)', [templateId, scope, 'Assetless legacy'])
    const baseline = await ensureLegacyDesignDocument({ kind: 'template', ownerId: templateId, actorId }, read, transaction)
    const source = validateEmailDesign(structuredDesign())
    source.blocks.oldImage = { type: 'Image', data: { props: { url: 'https://example.invalid/old.png', alt: 'Old' } } }
    source.blocks.root.data.childrenIds!.push('oldImage')
    source.policy.editableFields.push('oldImage.data.props.url')
    const initial = await saveTemplateDesignDraft({ documentId: baseline.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: baseline.revisionId, design: source }, read, testEmailRenderer, transaction)
    const next = validateEmailDesign(source)
    next.blocks.oldImage.data.props!.url = 'https://example.invalid/legacy-replacement.png'
    const input = { documentId: baseline.documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: initial.revisionId, design: next }
    const saved = await saveStaffTemplateDesignDraft(input, read, testEmailRenderer, transaction)
    expect(await saveStaffTemplateDesignDraft(input, read, { ...testEmailRenderer, renderDocument: async () => {
      throw new Error('must not render replay')
    } }, transaction)).toEqual(saved)
    expect((await getDesignDraft(baseline.documentId, read, admin))).toMatchObject({ source: next, headRevisionId: saved.revisionId })
  })

  databaseTest('allows explicit expired proposal recovery only within the existing retention window', async () => {
    const campaign = await selected(), original = await propose(await start(campaign.campaignId))
    const expired = async (days: number) => {
      const id = crypto.randomUUID()
      await admin.query(`INSERT INTO email_design_handoffs(id,actor_id,document_id,base_revision_id,open_revision_id,editor_origin,state,created_at,expires_at,proposal_revision_id,proposal_operation_id,proposal_action_text,proposal_payload_text)
        SELECT $1,actor_id,document_id,base_revision_id,open_revision_id,editor_origin,state,clock_timestamp()-($3+1)*interval '1 day',clock_timestamp()-$3*interval '1 day',proposal_revision_id,proposal_operation_id,proposal_action_text,proposal_payload_text FROM email_design_handoffs WHERE id=$2`, [id, original.id, days])
      await admin.query('INSERT INTO email_design_handoff_receipts(actor_id,operation_id,handoff_id,request_text) VALUES($1,$2,$2,$3)', [actorId, id, JSON.stringify({ authoringMode: 'designer' })])
      return { command: 'save-proposal-as-new-draft', handoffId: id, action: { version: 1, action: 'save-proposal-as-new-draft', operationId: crypto.randomUUID(), scope: { clientId: scope }, proposalId: id, expectedProposalRevisionId: original.proposalRevisionId, name: 'Recovered expired campaign' } }
    }
    const within = await expired(1)
    expect((await command(within)).recovery?.campaignId).toBeTruthy()
    const outside = await expired(31), before = (await admin.query('SELECT count(*)::int AS n FROM campaigns')).rows[0].n
    await expect(command(outside)).rejects.toThrow('NOT_FOUND')
    expect((await admin.query('SELECT count(*)::int AS n FROM campaigns')).rows[0].n).toBe(before)
  })
  databaseTest('opens a previously snapshotted legacy campaign by its exact own document baseline', async () => {
    const id = await legacy()
    const baseline = await initializeCampaignDesignDraft({ campaignId: id, actorId, expectedClientId: scope }, read, transaction)
    const opened = await command({ command: 'open', operationId: crypto.randomUUID(), draftId: baseline.documentId, expectedRevisionId: baseline.revisionId })
    expect(opened.handoff.owner).toEqual({ kind: 'campaign', id })
    expect(opened.handoff.source.kind).toBe('campaign-draft')
    expect(opened.handoff.baseRevisionId).not.toBe(baseline.revisionId)
    expect((await getDesignDraft(baseline.documentId, read, admin))).toMatchObject({ projection: { state: 'current' }, headRevisionId: opened.handoff.baseRevisionId })
  })
  databaseTest('refuses canonical operation reuse for unrelated campaign Open or proposal commands', async () => {
    const campaign = await selected()
    const operationId = (await admin.query('SELECT operation_id FROM email_design_revision_receipts WHERE actor_id=$1 AND document_id=$2 AND revision_id=$3', [actorId, campaign.documentId, campaign.revisionId])).rows[0].operation_id
    await expect(command({ command: 'open', operationId, draftId: campaign.documentId, expectedRevisionId: campaign.revisionId })).rejects.toThrow('IDEMPOTENCY_CONFLICT')
    expect((await admin.query('SELECT id FROM email_design_handoffs WHERE id=$1', [operationId])).rows).toEqual([])
    const opened = await start(campaign.campaignId)
    await expect(command({ command: 'propose', handoffId: opened.id, action: { version: 1, action: 'propose-designer-return', operationId, scope: { clientId: scope }, draftId: opened.draftId, baseRevisionId: opened.baseRevisionId, operations: [] } })).rejects.toThrow('IDEMPOTENCY_CONFLICT')
    expect((await command({ command: 'resume', handoffId: opened.id })).handoff.state).toBe('open')
    expect((await getDesignDraft(campaign.documentId, read, admin)).headRevisionId).toBe(campaign.revisionId)
  })
})
