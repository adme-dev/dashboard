/* eslint @typescript-eslint/no-explicit-any: off -- Bounded actual Worker and Pages JSON is asserted at the acceptance boundary. */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { admitCampaignReceipt, validateCampaignReceiptShape, CAMPAIGN_NATIVE, CAMPAIGN_MIGRATIONS, CAMPAIGN_499_SHA256 } from '../helpers/figflowCampaignBrowser'
// PREPARATION ONLY: the following actual-runtime case is skipped unless all
// exact frozen artifacts AND a package-calibrated visible-control plan arrive.
// A receipt variable alone never skips failed admission or missing plan/source.
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { deflateSync, inflateSync, crc32 } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer, createConnection, type Server, type Socket } from 'node:net'
import { resolve } from 'node:path'
import pg from 'pg'
import { Miniflare, Response as LocalResponse } from 'miniflare'
import { transform } from 'esbuild'
import { parseDesignTemplateRequest } from '../../shared/emailRendering/designTemplates'
import { CAMPAIGN_EVIDENCE_ROOT, campaignFixtureEntry, verifyCampaignReceipt, exerciseCampaignBrowser, sha256, type CampaignReceipt, type CampaignUiPlan, type CampaignSnapshot } from '../helpers/figflowCampaignBrowser'
import { frozenReader } from '../helpers/figflowNativeLibraryBrowser'
// Pure parser execution of the source-frozen shared contract is not publication
// or current-worktree runtime acceptance. Full runtime reads committed source.
describe('same-T successor strict request contract (pure)', () => {
  const request = () => ({ version: 1, command: 'revise-template', operationId: '10000000-0000-4000-8000-000000000001', draftId: '10000000-0000-4000-8000-000000000002', expectedRevisionId: '10000000-0000-4000-8000-000000000003', templateId: '10000000-0000-4000-8000-000000000004', expectedTemplateRevisionId: '10000000-0000-4000-8000-000000000005', name: 'Same published template', category: 'fixture', includedOverridePaths: [] })
  it('accepts exactly the owner/head metadata command without canonical content', () => expect(parseDesignTemplateRequest(request())).toEqual(request()))
  it('rejects content/policy/actor fields and an invalid expected target head', () => {
    for (const extra of [{ design: {} }, { html: '<p>forged</p>' }, { actorId: 'injected' }, { policy: {} }, { expectedTemplateRevisionId: 'HEAD' }]) expect(() => parseDesignTemplateRequest({ ...request(), ...extra })).toThrow()
  })
})
// Pure admission tests are not browser, Worker, database or actual-WASM proof.
describe('campaign runtime receipt admission (pure)', () => {
  const input = () => ({ sourceCommit: 'a'.repeat(40), approvedSourceCommit: 'a'.repeat(40), native: { workflowHead: 'a'.repeat(40), actualCheckout: 'b'.repeat(40), parents: ['a'.repeat(40)], ciRun: '99999999999', engineSha256: CAMPAIGN_NATIVE.engine, patchSha256: CAMPAIGN_NATIVE.patch, engineTests: 40, bridgeTests: 9, uiTests: 8, allNamedPassed: true, allSummariesPassed: true, nativeHashesMatch: true, packageHashesMatch: true, wasmSha256: 'c'.repeat(64), zipSha256: 'd'.repeat(64) }, migrations: CAMPAIGN_MIGRATIONS.map(path => ({ path, sha256: path.endsWith('/499_email_template_successor_projection.sql') ? CAMPAIGN_499_SHA256 : 'e'.repeat(64) })), pages: { sourceCommit: 'a'.repeat(40), handler: 'server/api/email/campaigns/[id].patch.ts', authentication: 'pages-auth-me-v1', origin: 'https://app.xeroflow.io', senderEnabled: false, cohost: { authAdapter: 'workers/email-design/sessionToken.ts', authorityUrl: 'https://preview.agency-dashboard-6cm.pages.dev/api/auth/me', method: 'PATCH', route: '/api/email/campaigns/:id' } }, worker: { sourceCommit: 'a'.repeat(40) }, renderer: { sourceCommit: 'a'.repeat(40) } })
  it('actual admission rejects withdrawn499 until explicit reviewed replacement arrives', () => {
    expect(() => admitCampaignReceipt(input())).toThrow('499 acceptance blocked')
  })
  it('pins historical499 shape and rejects arbitrary successor SQL bytes', () => {
    expect(CAMPAIGN_MIGRATIONS).toContain('server/database/migrations/499_email_template_successor_projection.sql')
    const changed = input()
    changed.migrations.find(file => file.path.endsWith('/499_email_template_successor_projection.sql'))!.sha256 = '0'.repeat(64)
    expect(() => validateCampaignReceiptShape(changed)).toThrow()
  })
  it('validates historical source/count/owner shape, not499 approval', () => {
    expect(() => validateCampaignReceiptShape(input())).not.toThrow()
  })
  it.each(['engineTests', 'bridgeTests', 'uiTests'] as const)('rejects wrong %s including published32/9/8', (key) => {
    const value = input()
    value.native[key]--
    expect(() => validateCampaignReceiptShape(value)).toThrow()
  })
  it('rejects the prior actual08a WASM bytes even with new labels', () => {
    const value = input()
    value.native.wasmSha256 = '18a31d0079c72f0ed07bb678c0ca548098c81d06c8bf05deb94c25c782457c59'
    expect(() => validateCampaignReceiptShape(value)).toThrow()
  })
  it.each(['worker', 'renderer', 'pages'] as const)('rejects mixed %s source', (key) => {
    const value = input()
    value[key].sourceCommit = 'f'.repeat(40)
    expect(() => validateCampaignReceiptShape(value)).toThrow()
  })
  it('requires exact approved committed source and matching native workflow', () => {
    const value = input()
    value.native.workflowHead = 'f'.repeat(40)
    expect(() => validateCampaignReceiptShape(value)).toThrow()
  })
  it('rejects missing498/499, duplicate migrations and mock staff-save owner', () => {
    for (const id of ['498_', '499_']) {
      const missing = input()
      missing.migrations = missing.migrations.filter(file => !file.path.includes('/' + id))
      expect(() => validateCampaignReceiptShape(missing)).toThrow()
    }
    const duplicate = input()
    duplicate.migrations.push(duplicate.migrations[0]!)
    expect(() => validateCampaignReceiptShape(duplicate)).toThrow()
    const wrong = input()
    wrong.pages.handler = 'server/api/email/design/drafts/[id].patch.ts'
    expect(() => validateCampaignReceiptShape(wrong)).toThrow()
  })
  it('requires fresh-auth cohost with no sender and successful CI summaries', () => {
    const wrong = input()
    wrong.pages.senderEnabled = true
    expect(() => validateCampaignReceiptShape(wrong)).toThrow()
    const failed = input()
    failed.native.allSummariesPassed = false
    expect(() => validateCampaignReceiptShape(failed)).toThrow()
  })
})
it('compiles both cohost transport modules without running or mocking their handlers', async () => {
  for (const name of ['campaign-design', 'campaign-pages'] as const) await transform(campaignFixtureEntry('figflow_campaign_browser_' + 'a'.repeat(32), name), { loader: 'js', format: 'esm' })
  expect(() => campaignFixtureEntry('public; DROP SCHEMA public', 'campaign-design')).toThrow('Only unique owned schema')
})
const receiptPath = process.env.FIGFLOW_CAMPAIGN_RECEIPT
const planPath = process.env.FIGFLOW_CAMPAIGN_UI_PLAN
const runtimeTest = receiptPath ? it : it.skip
const schema = 'figflow_campaign_browser_' + randomUUID().replaceAll('-', '')
const evidence = resolve(CAMPAIGN_EVIDENCE_ROOT, schema)
const actor = randomUUID(), clientId = randomUUID(), workingTemplate = randomUUID(), assetA = randomUUID(), assetB = randomUUID(), contentCampaign = randomUUID()
const socket = '/private/tmp/figflow-postgres-20261102-recovered', secret = 'synthetic-campaign-local-auth-only'
let runtime: Miniflare | undefined, admin: pg.Client | undefined, db: pg.Client | undefined, proxy: Server | undefined, created = false
let receipt: CampaignReceipt, plan: CampaignUiPlan, campaignA = '', campaignB = '', frozenCampaign = '', contentHandoff = '', originalImageId = '', newImageId = '', publishedTemplate = '', publishedModule = ''
const connections = new Set<Socket>(), outbound: string[] = []
/** Two deterministic valid2x2 RGBA PNGs; CRC and scanline bytes differ visibly.
 * These synthetic fixtures prove two registered byte identities, not OEM art. */
function fixturePng(rgba: number[]) {
  const crc = (bytes: Buffer) => {
    let n = 0xffffffff
    for (const b of bytes) {
      n ^= b
      for (let i = 0; i < 8; i++)
        n = n >>> 1 ^ (n & 1 ? 0xedb88320 : 0)
    }
    return (n ^ 0xffffffff) >>> 0
  }
  const chunk = (name: string, data: Buffer) => {
    const type = Buffer.from(name), head = Buffer.alloc(4), tail = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    tail.writeUInt32BE(crc(Buffer.concat([type, data])))
    return Buffer.concat([head, type, data, tail])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(2)
  ihdr.writeUInt32BE(2, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, ...rgba, ...rgba, 0, ...rgba, ...rgba]))), chunk('IEND', Buffer.alloc(0))])
}
const pngA = fixturePng([225, 40, 40, 255]), pngB = fixturePng([30, 70, 225, 255])
it('uses distinct CRC-valid local PNG fixture bytes (not native acceptance)', () => {
  expect(sha256(pngA)).not.toBe(sha256(pngB))
  expect(pngA.readUInt32BE(16)).toBe(2)
  expect(pngB.readUInt32BE(20)).toBe(2)
  const pixels = (png: Buffer) => {
    const size = png.readUInt32BE(33)
    expect(crc32(png.subarray(37, 41 + size))).toBe(png.readUInt32BE(41 + size))
    return inflateSync(png.subarray(41, 41 + size))
  }
  expect([...pixels(pngA)]).toEqual([0, 225, 40, 40, 255, 225, 40, 40, 255, 0, 225, 40, 40, 255, 225, 40, 40, 255])
  expect([...pixels(pngB)]).toEqual([0, 30, 70, 225, 255, 30, 70, 225, 255, 0, 30, 70, 225, 255, 30, 70, 225, 255])
})
const assetUrl = (id: string) => `https://app.xeroflow.io/api/public/banner-assets/v1.synthetic.${id.replaceAll('-', '')}`
const assetKey = (id: string) => `banner-assets/${actor}/${id}/image.png`
async function bounded<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Bounded actual local runtime timeout')), 20000)
    })])
  } finally {
    clearTimeout(timer)
  }
}
async function request(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  assert(runtime)
  const payload = Buffer.from(JSON.stringify({ userId: actor, iat: Date.now(), exp: Date.now() + 20 * 60000 }))
  const token = payload.toString('base64') + '.' + createHmac('sha256', secret).update(payload).digest('base64')
  const target = /^\/api\/email\/campaigns\/[^/]+$/.test(path) && method === 'PATCH' ? 'campaign-pages' : 'campaign-design'
  const response = await bounded(runtime.dispatchFetch('https://app.xeroflow.io' + path, { method, headers: { 'authorization': 'Bearer ' + token, 'cookie': 'auth_token=' + token, 'origin': 'https://app.xeroflow.io', 'content-type': 'application/json', 'x-xeroflow-email-design-environment': 'staging' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }))
  const text = await response.text()
  let value: any
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`Non-JSON actual ${target} ${response.status} ${path}: ${text.slice(0, 180)}`)
  }
  return { status: response.status, body: value }
}
async function ok(path: string, body: unknown, method = 'POST') {
  const response = await request(path, body, method)
  assert.equal(response.status, 200, JSON.stringify(response.body))
  return response.body
}
async function read(id: string): Promise<CampaignSnapshot> {
  const row = (await db!.query(`SELECT c.*,d.id AS document_id,d.head_revision_id,r.payload,r.subject AS revision_subject,r.preview_text AS revision_preview,r.schema_version,r.base_template_revision_id,r.rendered_html_sha256
    FROM campaigns c JOIN email_design_documents d ON d.campaign_id=c.id JOIN email_design_revisions r ON r.document_id=d.id AND r.id=d.head_revision_id WHERE c.id=$1`, [id])).rows[0]
  assert(row)
  assert.equal(row.schema_version, 1)
  assert.equal(row.payload.kind, 'campaign-draft')
  assert.equal(row.email_design_revision_id, row.head_revision_id)
  assert.equal(row.revision_subject, row.subject)
  assert.equal(row.revision_preview, row.preview_text)
  assert.equal(row.rendered_html_sha256, sha256(row.body_html))
  assert.deepEqual(row.body_source, row.payload.blocks)
  return { campaignId: id, documentId: row.document_id, revisionId: row.head_revision_id, source: row.payload, subject: row.subject, previewText: row.preview_text, baseTemplateRevisionId: row.base_template_revision_id, renderedHtmlSha256: row.rendered_html_sha256, bodyHtml: row.body_html, status: row.status, fromEmail: row.from_email, filterRules: row.filter_rules }
}
async function protectedState() {
  return { b: await read(campaignB), frozen: await read(frozenCampaign), template: (await db!.query('SELECT t.*,d.head_revision_id FROM edm_templates t JOIN email_design_documents d ON d.template_id=t.id WHERE t.id=$1', [publishedTemplate])).rows,
    module: (await db!.query('SELECT m.*,d.head_revision_id FROM edm_custom_modules m JOIN email_design_documents d ON d.module_id=m.id WHERE m.id=$1', [publishedModule])).rows,
    revisions: (await db!.query('SELECT r.* FROM email_design_revisions r JOIN email_design_documents d ON d.id=r.document_id WHERE d.template_id=$1 OR d.module_id=$2 ORDER BY r.id', [publishedTemplate, publishedModule])).rows }
}
async function browserRequest(path: string, body: any, method: string) {
  if (path.startsWith('/api/email/design/') || (method === 'PATCH' && /^\/api\/email\/campaigns\/[^/]+$/.test(path)))
    return request(path, body, method)
  if (path === '/api/email/templates/render' && method === 'POST') {
    const reply = await ok('/__fixture/preview', body)
    assert(reply.ok && reply.operation === 'document')
    return { status: 200, body: { html: reply.value.html } }
  }
  assert.equal(method, 'GET', 'No synthetic write adapter: ' + method + ' ' + path)
  const url = new URL(path, 'https://app.xeroflow.io')
  if (/^\/api\/email\/campaigns\/[^/]+$/.test(url.pathname)) {
    const id = url.pathname.split('/').at(-1)
    const row = (await db!.query('SELECT * FROM campaigns WHERE id=$1', [id])).rows[0]
    assert(row)
    return { status: 200, body: { campaign: row } }
  }
  if (url.pathname === '/api/agency/email/merge-tags' || url.pathname === '/api/agency/email/conditions') {
    assert.equal(url.searchParams.get('client_id'), clientId)
    const items = url.pathname.endsWith('/merge-tags')
      ? (await db!.query('SELECT id,client_id,name,token,preview_value,fallback FROM email_merge_tag_definitions WHERE client_id=$1 ORDER BY name,id', [clientId])).rows
      : (await db!.query('SELECT id,client_id,name,predicate FROM email_content_conditions WHERE client_id=$1 ORDER BY name,id', [clientId])).rows
    return { status: 200, body: { items } }
  }
  if (url.pathname === '/api/email/template-clients')
    return { status: 200, body: { clients: [{ id: clientId, name: 'Synthetic campaign client' }], canUseSharedTemplates: true } }
  if (url.pathname === '/api/agency/email/assets')
    return { status: 200, body: { assets: (await db!.query('SELECT id,client_id AS "clientId",url,mime_type AS "mimeType",file_size AS "fileSize",name,email_publication AS "emailPublication" FROM banner_assets ORDER BY name')).rows } }
  if (url.pathname === '/api/agency/email/modules')
    return { status: 200, body: { items: (await db!.query('SELECT m.*,d.id AS design_document_id,d.head_revision_id,r.schema_version AS revision_schema_version FROM edm_custom_modules m JOIN email_design_documents d ON d.module_id=m.id JOIN email_design_revisions r ON r.id=d.head_revision_id ORDER BY m.id')).rows } }
  throw new Error('Unimplemented read-only Pages projection: ' + path)
}
beforeAll(async () => {
  if (!receiptPath)
    return
  assert(planPath && process.env.FIGFLOW_CAMPAIGN_SOURCE_COMMIT, 'Require parent frozen source and package-calibrated plan')
  assert.equal(process.env.FIGFLOW_DESIGN_PG_SOCKET, socket)
  receipt = await verifyCampaignReceipt(JSON.parse(readFileSync(resolve(receiptPath), 'utf8')), process.env.FIGFLOW_CAMPAIGN_SOURCE_COMMIT)
  plan = JSON.parse(readFileSync(resolve(planPath), 'utf8'))
  assert.equal(plan.expectedText.length, 4)
  assert(plan.expectedText.every(x => x.includes('{{first_name}}')) && new Set(plan.expectedText).size === 4)
  assert(plan.staff.length > 0 && plan.staffNewImage.length > 0)
  await mkdir(evidence, { recursive: true })
  await writeFile(resolve(evidence, 'input-receipts.json'), JSON.stringify({ receipt, plan, receiptSha256: sha256(readFileSync(receiptPath)), planSha256: sha256(readFileSync(planPath)), pngA: sha256(pngA), pngB: sha256(pngB) }, null, 2))
  const config = { host: socket, port: 55483, user: 'figflow_test', database: 'figflow_design_test', connectionTimeoutMillis: 5000 }
  admin = new pg.Client(config)
  await admin.connect()
  await admin.query(`CREATE SCHEMA ${schema}`)
  created = true
  db = new pg.Client({ ...config, options: `-c search_path=${schema},public` })
  await db.connect()
  await db.query(`CREATE TABLE team_members(id uuid PRIMARY KEY,email text,name text,user_role text,is_active boolean,avatar_url text,custom_role_id uuid,sessions_invalidated_at timestamptz);
    CREATE TABLE custom_roles(id uuid PRIMARY KEY,name text,is_read_only boolean,is_system boolean,slug text); CREATE TABLE role_permission_groups(role_id uuid,permission_group text); CREATE TABLE client_team_assignments(team_member_id uuid,client_id uuid);
    CREATE TABLE agency_clients(id uuid PRIMARY KEY,is_active boolean,name text);
    CREATE TABLE edm_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,name text,folder_name text,created_by uuid,body_source jsonb,body_html text,subject text,preview_text text,template_kind text DEFAULT 'draft',updated_at timestamptz DEFAULT now());
    CREATE TABLE edm_custom_modules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,blocks jsonb,name text,description text,category text,preview_tone text,created_by uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE banner_assets(id uuid PRIMARY KEY,client_id uuid,uploaded_by uuid,r2_key text,url text,mime_type text,file_size integer,name text);
    CREATE TABLE campaigns(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,name text,subject text,preview_text text,from_name text,from_email text,reply_to text,filter_rules jsonb,template_id uuid,status text DEFAULT 'draft',body_source jsonb,body_html text,created_by uuid,updated_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now());`)
  const frozen = frozenReader(receipt.sourceCommit)
  for (const migration of receipt.migrations)
    await db.query(frozen.read(migration.path))
  await db.query('INSERT INTO team_members VALUES($1,\'fixture@example.invalid\',\'Synthetic campaign actor\',\'admin\',true,null,null,null)', [actor])
  await db.query('INSERT INTO agency_clients VALUES($1,true,\'Synthetic campaign client\')', [clientId])
  const blocks = { originalImage: { type: 'Image', data: { props: { url: assetUrl(assetA), alt: 'Registered red original', linkHref: 'https://example.invalid/image' } } }, root: { type: 'EmailLayout', data: { childrenIds: ['heading', 'originalImage', 'cta', 'moduleText', 'lockedFooter'] } }, heading: { type: 'Heading', data: { props: { text: 'Hello {{first_name}}' } } }, cta: { type: 'Button', data: { props: { text: 'Original CTA', url: 'https://example.invalid/offer' } } }, moduleText: { type: 'Text', data: { props: { text: 'Retained linked module' } } }, lockedFooter: { type: 'Text', data: { props: { text: 'Locked legal fixture' } } } }
  await db.query('INSERT INTO edm_templates(id,client_id,name,body_source,body_html,subject,preview_text) VALUES($1,$2,\'Campaign source fixture\',$3,\'<p>Original</p>\',\'Metadata retained\',\'Synthetic preheader retained\')', [workingTemplate, clientId, blocks])
  for (const [id, name, bytes] of [[assetA, 'Synthetic red registered image', pngA], [assetB, 'Synthetic blue registered replacement', pngB]] as const)
    await db.query('INSERT INTO banner_assets VALUES($1,$2,$3,$4,$5,\'image/png\',$6,$7)', [id, clientId, actor, assetKey(id), assetUrl(id), bytes.length, name])
  proxy = createServer((downstream) => {
    const upstream = createConnection({ path: resolve(socket, '.s.PGSQL.55483') })
    for (const connection of [downstream, upstream]) {
      connections.add(connection)
      connection.on('close', () => connections.delete(connection))
      connection.on('error', () => {
        downstream.destroy()
        upstream.destroy()
      })
    }
    downstream.pipe(upstream).pipe(downstream)
  })
  await new Promise<void>((done, reject) => {
    proxy!.once('error', reject)
    proxy!.listen(0, '127.0.0.1', done)
  })
  const address = proxy.address()
  assert(address && typeof address !== 'string')
  const blockOutbound = (req: {
    method: string
    url: string
  }) => {
    const u = new URL(req.url)
    outbound.push(req.method + ' ' + u.origin + u.pathname)
    return new LocalResponse('Unexpected outbound', { status: 500 })
  }
  const authAuthority = async (req: Request) => {
    if (req.method !== 'GET' || req.url !== 'https://preview.agency-dashboard-6cm.pages.dev/api/auth/me')
      return blockOutbound(req)
    try {
      const [raw, signature] = (req.headers.get('authorization')?.slice(7) ?? '').split('.')
      const payload = Buffer.from(raw!, 'base64')
      if (signature !== createHmac('sha256', secret).update(payload).digest('base64'))
        return LocalResponse.json({}, { status: 401 })
      const claims = JSON.parse(payload.toString())
      const user = (await db!.query('SELECT id,is_active FROM team_members WHERE id=$1', [claims.userId])).rows[0]
      if (!user?.is_active || claims.exp < Date.now())
        return LocalResponse.json({}, { status: 401 })
      return LocalResponse.json({ success: true, user: { id: user.id, is_active: true } })
    } catch {
      return LocalResponse.json({}, { status: 401 })
    }
  }
  const workers = ([['campaign-design', receipt.worker], ['campaign-pages', receipt.pages]] as const).map(([name, artifact]) => ({
    name, modules: [{ type: 'ESModule' as const, path: resolve(evidence, name + '-entry.mjs'), contents: campaignFixtureEntry(schema, name) }, { type: 'ESModule' as const, path: resolve(evidence, name + '.mjs'), contents: readFileSync(resolve(artifact.path)) }],
    compatibilityDate: '2026-07-08', compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'], bindings: { EMAIL_DESIGN_SESSION_AUTHORITY: 'pages-auth-me-v1', FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_DESIGNER_ENABLED: 'true', FIGFLOW_EDM_LIBRARY_ENABLED: 'true', FIGFLOW_EDM_BRAND_ENABLED: 'true', EMAIL_DESIGN_ENVIRONMENT: 'staging', PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' },
    serviceBindings: { EMAIL_RENDERER: { name: 'campaign-renderer', entrypoint: 'EmailRenderer' }, ...(name === 'campaign-design' ? { CAMPAIGN_PAGES: { name: 'campaign-pages' } } : {}) }, r2Buckets: { MEDIA_BUCKET: 'campaign-fixture-assets' },
    hyperdrives: { HYPERDRIVE: `postgres://figflow_test:synthetic@127.0.0.1:${address.port}/figflow_design_test`, HYPERDRIVE_FRESH: `postgres://figflow_test:synthetic@127.0.0.1:${address.port}/figflow_design_test` }, outboundService: authAuthority
  }))
  runtime = new Miniflare({ workers: [...workers, { name: 'campaign-renderer', modules: true, scriptPath: resolve(receipt.renderer.path), compatibilityDate: '2026-07-08', bindings: { EMAIL_RENDER_ENVIRONMENT: 'staging' }, outboundService: blockOutbound }] })
  await bounded(runtime.ready)
  const bucket = await runtime.getR2Bucket('MEDIA_BUCKET', 'campaign-design')
  await bucket.put(assetKey(assetA), pngA)
  await bucket.put(assetKey(assetB), pngB)
  // Setup commands deliberately create an existing linked library fixture; only
  // the later full-builder journeys establish visible-edit acceptance.
  for (const id of [assetA, assetB])
    await ok('/api/email/design/assets/publish', { version: 1, operationId: randomUUID(), assetId: id })
  const started = await ok('/api/email/design/roundtrip', { command: 'start', operationId: randomUUID(), templateId: workingTemplate, clientId })
  const draftId = started.handoff.draftId
  let head = started.handoff.baseRevisionId
  const module = await ok('/api/email/design/modules', { version: 1, command: 'publish-module', operationId: randomUUID(), draftId, expectedDraftRevisionId: head, name: 'Linked fixture module R1', category: 'fixture', description: null, previewTone: 'light', includedOverridePaths: [], rootBlockIds: ['moduleText'] })
  publishedModule = module.moduleId
  head = (await ok('/api/email/design/modules', { version: 1, command: 'insert-module', operationId: randomUUID(), draftId, expectedDraftRevisionId: head, moduleId: module.moduleId, revisionId: module.revisionId, parentId: 'root', index: 2 })).revisionId
  head = (await ok('/api/email/design/modules', { version: 1, command: 'insert-published-image', operationId: randomUUID(), draftId, expectedDraftRevisionId: head, assetId: assetA, parentId: 'root', index: 1 })).revisionId
  head = (await ok(`/api/email/design/drafts/${draftId}/locks`, { version: 1, command: 'set-design-lock', operationId: randomUUID(), draftId, expectedRevisionId: head, lock: { target: 'block', blockId: 'lockedFooter', locked: true } })).revisionId
  const sourceDraft = await ok('/api/email/design/roundtrip', { command: 'lookup', templateId: workingTemplate })
  originalImageId = 'originalImage'
  newImageId = Object.keys(sourceDraft.draft.source.blocks).find(id => id !== originalImageId && sourceDraft.draft.source.blocks[id].type === 'Image')!
  assert(newImageId && sourceDraft.draft.source.policy.editableFields.includes(newImageId + '.data.props.url'), 'New inserted image must have the actual product URL grant')
  assert(sourceDraft.draft.source.lineage.find((item: any) => item.blockId === newImageId)?.fields.url, 'New inserted image URL requires stable field lineage')
  assert(sourceDraft.draft.source.policy.editableFields.includes(originalImageId + '.data.props.url'), 'Typed staff replacement must be actually granted by product policy')
  const published = await ok('/api/email/design/templates', { version: 1, command: 'publish-template', operationId: randomUUID(), draftId, expectedRevisionId: head, name: 'Published campaign T', category: 'fixture', includedOverridePaths: [] })
  publishedTemplate = published.templateId
  const selection = (name: string) => ({ version: 1, command: 'create-from-template', operationId: randomUUID(), templateId: published.templateId, revisionId: published.revisionId, clientId, campaign: { name } })
  const aRequest = selection('Independent campaign A'), a = await ok('/api/email/design/campaigns', aRequest)
  assert.deepEqual(await ok('/api/email/design/campaigns', aRequest), a, 'Typed exact selection replay duplicated campaign')
  const b = await ok('/api/email/design/campaigns', selection('Independent campaign B')), f = await ok('/api/email/design/campaigns', selection('Frozen campaign fixture'))
  campaignA = a.campaignId
  campaignB = b.campaignId
  frozenCampaign = f.campaignId
  const baselineA = await read(campaignA), baselineB = await read(campaignB)
  assert.notEqual(baselineA.documentId, baselineB.documentId)
  assert.notEqual(campaignA, campaignB)
  assert.equal(baselineA.baseTemplateRevisionId, published.revisionId)
  assert.equal(baselineB.baseTemplateRevisionId, published.revisionId)
  assert.deepEqual(baselineA.source, baselineB.source)
  // Advance the saved working source, then actual same-owner publication.
  // New source is implemented/review pending; only future exact artifacts run it.
  const changedWorking = structuredClone(sourceDraft.draft.source)
  changedWorking.blocks.heading.data.props.text = 'Later module source {{first_name}}'
  const workingSuccessor = await ok(`/api/email/design/drafts/${draftId}`, { version: 1, action: 'save-draft', operationId: randomUUID(), scope: { clientId }, draftId, expectedRevisionId: head, design: changedWorking }, 'PATCH')
  const revised = await ok('/api/email/design/modules', { version: 1, command: 'revise-module', operationId: randomUUID(), draftId, expectedDraftRevisionId: workingSuccessor.revisionId, moduleId: publishedModule, expectedModuleRevisionId: module.revisionId, name: 'Linked fixture module R2', category: 'fixture', description: null, previewTone: 'light', includedOverridePaths: [], rootBlockIds: ['heading'] })
  assert.notEqual(revised.revisionId, module.revisionId)
  const r1 = (await db!.query('SELECT * FROM email_design_revisions WHERE document_id=$1 AND id=$2', [published.documentId, published.revisionId])).rows[0]
  const successorRequest = { version: 1, command: 'revise-template', operationId: randomUUID(), draftId, expectedRevisionId: workingSuccessor.revisionId, templateId: published.templateId, expectedTemplateRevisionId: published.revisionId, name: 'Published campaign T revised', category: 'fixture', includedOverridePaths: [] }
  const successor = await ok('/api/email/design/templates', successorRequest)
  assert.equal(successor.templateId, published.templateId)
  assert.equal(successor.documentId, published.documentId)
  assert.equal(successor.published, true)
  assert.notEqual(successor.revisionId, published.revisionId)
  assert.deepEqual(await ok('/api/email/design/templates', successorRequest), successor, 'Same-T publication replay changed the receipt')
  assert.deepEqual((await db!.query('SELECT * FROM email_design_revisions WHERE document_id=$1 AND id=$2', [published.documentId, published.revisionId])).rows[0], r1, 'Published R1 was changed')
  const library = (await db!.query('SELECT t.*,d.head_revision_id,r.template_rendered_html_sha256 FROM edm_templates t JOIN email_design_documents d ON d.template_id=t.id JOIN email_design_revisions r ON r.id=d.head_revision_id WHERE t.id=$1', [publishedTemplate])).rows[0]
  assert.equal(library.head_revision_id, successor.revisionId)
  assert.equal(library.email_design_revision_id, successor.revisionId)
  assert.equal(library.template_rendered_html_sha256, sha256(library.body_html))
  assert.deepEqual(await read(campaignA), baselineA)
  assert.deepEqual(await read(campaignB), baselineB)
  await db.query('UPDATE campaigns SET status=\'scheduled\' WHERE id=$1', [frozenCampaign])
  const plain = { root: { type: 'EmailLayout', data: { childrenIds: ['heading'] } }, heading: { type: 'Heading', data: { props: { text: 'Content campaign {{first_name}}' } } } }
  await db.query('INSERT INTO campaigns(id,client_id,name,body_source,body_html,subject,preview_text) VALUES($1,$2,\'Content-only campaign D\',$3,\'<p>Own existing campaign</p>\',\'Content subject\',\'Content preview\')', [contentCampaign, clientId, plain])
  contentHandoff = (await ok('/api/email/design/roundtrip', { command: 'start', operationId: randomUUID(), owner: { kind: 'campaign', id: contentCampaign }, clientId })).handoff.id
  await writeFile(resolve(evidence, 'setup.json'), JSON.stringify({ schema, source: receipt.sourceCommit, aRequest, a, b, f, published, workingSuccessor, module, revised, successorRequest, successor, sameTStatus: 'source-implemented/review-pending; asserted only when actual runtime executes', originalImageId, baselineA, baselineB, protectedBefore: await protectedState(), setupOnlyNotUiProof: true }, null, 2))
}, 90000)
afterAll(async () => {
  if (!receiptPath)
    return
  const errors: string[] = []
  try {
    await runtime?.dispose()
  } catch (error) {
    errors.push(String(error))
  }
  await Promise.all([...connections].map(connection => new Promise<void>((done) => {
    connection.once('close', done)
    connection.destroy()
  })))
  if (proxy)
    await new Promise<void>(done => proxy!.close(() => done()))
  try {
    await db?.end()
  } catch (error) {
    errors.push(String(error))
  }
  let dropped = false
  try {
    if (created) {
      await admin!.query(`DROP SCHEMA ${schema} CASCADE`)
      dropped = (await admin!.query('SELECT nspname FROM pg_namespace WHERE nspname=$1', [schema])).rowCount === 0
      assert(dropped)
    }
  } catch (error) {
    errors.push(String(error))
  }
  try {
    await admin?.end()
  } catch (error) {
    errors.push(String(error))
  }
  await mkdir(evidence, { recursive: true })
  await writeFile(resolve(evidence, 'cleanup.json'), JSON.stringify({ schema, created, dropped, proxyConnectionsRemaining: connections.size, outbound, errors }, null, 2))
  assert.equal(connections.size, 0)
  assert.deepEqual(errors, [])
})
runtimeTest('PENDING exact frozen40/9/8: full campaign native/staff/native journeys, original receipts, conflict and recovery', async () => {
  const result = await exerciseCampaignBrowser({ receipt, plan, evidence, campaignA, campaignB, contentCampaign, contentHandoff, originalImageId, newImageId, replacementAssetId: assetB, request: browserRequest, read, protectedState,
    campaignCount: async () => (await db!.query('SELECT count(*)::int AS n FROM campaigns')).rows[0].n,
    guard: async (change) => {
      if (change === 'revoke' || change === 'restore')
        await db!.query('UPDATE team_members SET is_active=$2 WHERE id=$1', [actor, change === 'restore'])
      else
        await db!.query('UPDATE campaigns SET status=$2 WHERE id=$1', [campaignA, change === 'freeze' ? 'scheduled' : 'draft'])
    },
    publicAsset: async (path) => {
      const row = (await db!.query('SELECT r2_key,mime_type FROM banner_assets WHERE url=$1', ['https://app.xeroflow.io' + path])).rows[0]
      if (!row)
        return null
      const object = await (await runtime!.getR2Bucket('MEDIA_BUCKET', 'campaign-design')).get(row.r2_key)
      assert(object)
      return { bytes: new Uint8Array(await object.arrayBuffer()), contentType: row.mime_type }
    }
  })
  expect(outbound).toEqual([])
  await writeFile(resolve(evidence, 'result.json'), JSON.stringify({ ...result, outbound }, null, 2))
}, 420000)
