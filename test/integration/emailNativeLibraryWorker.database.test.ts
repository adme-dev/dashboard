/* eslint @typescript-eslint/no-explicit-any: off -- Synthetic Worker JSON and read-only database projections are asserted by the browser driver. */
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createConnection, createServer, type Server, type Socket } from 'node:net'
import { resolve } from 'node:path'
import pg from 'pg'
import { Miniflare, Response as LocalResponse } from 'miniflare'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { exerciseNativeLibraryBrowser, frozenReader, sha256, validateNativeLibraryReceipt, NATIVE_LIBRARY_EVIDENCE_ROOT, NATIVE_LIBRARY_MIGRATIONS, type NativeLibraryDraft, type NativeLibraryReceipt, type NativeLibraryUiPlan } from '../helpers/figflowNativeLibraryBrowser'
// PREPARED ONLY until the parent supplies the matching 32/9/8 package AND
// frozen Worker/renderer receipt. No fallback to old core bytes or dirty source.
const receiptPath = process.env.FIGFLOW_NATIVE_LIBRARY_RECEIPT
const planPath = process.env.FIGFLOW_NATIVE_LIBRARY_UI_PLAN
const runtimeTest = receiptPath ? it : it.skip
const actor = randomUUID(), templateId = randomUUID()
const schema = `figflow_native_browser_${randomUUID().replaceAll('-', '')}`
const evidence = resolve(NATIVE_LIBRARY_EVIDENCE_ROOT, schema)
const socket = '/private/tmp/figflow-postgres-20261102-recovered'
const authSecret = 'synthetic-local-native-library-session-only'
const assetA = randomUUID(), assetB = randomUUID()
const imageName = 'Synthetic registered replacement'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lWQAAAAASUVORK5CYII=', 'base64')
const assetUrl = (id: string) => `https://app.xeroflow.io/api/public/banner-assets/v1.synthetic.${id.replaceAll('-', '')}`
const assetKey = (id: string) => `banner-assets/${actor}/${id}/image.png`
let receipt: NativeLibraryReceipt, plan: NativeLibraryUiPlan
let runtime: Miniflare | undefined, admin: pg.Client | undefined, db: pg.Client | undefined
let proxy: Server | undefined, created = false, originalImageBlockId = ''
const connections = new Set<Socket>()
const outbound: string[] = []
const blockOutbound = (request: { method: string, url: string }) => {
  outbound.push(request.method + ' ' + new URL(request.url).origin + new URL(request.url).pathname)
  return new LocalResponse('Unexpected outbound fixture request', { status: 500 })
}
function authToken() {
  const payload = Buffer.from(JSON.stringify({ userId: actor, iat: Date.now(), exp: Date.now() + 20 * 60000 }))
  return payload.toString('base64') + '.' + createHmac('sha256', authSecret).update(payload).digest('base64')
}
async function bounded<T>(value: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([value, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Bounded local Worker timeout')), 20000)
    })])
  } finally {
    clearTimeout(timer)
  }
}
async function workerRequest(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  assert(runtime)
  const response = await bounded(runtime.dispatchFetch('https://app.xeroflow.io' + path, {
    method, headers: { 'authorization': 'Bearer ' + authToken(), 'origin': 'https://app.xeroflow.io', 'content-type': 'application/json', 'x-xeroflow-email-design-environment': 'staging' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }))
  const text = await response.text()
  let result: any
  try {
    result = JSON.parse(text)
  } catch {
    throw new Error(`Non-JSON Worker reply ${response.status} ${path}: ${text.slice(0, 200)}`)
  }
  return { status: response.status, body: result }
}
async function readDraft(): Promise<NativeLibraryDraft> {
  const row = (await db!.query(`SELECT d.id,d.head_revision_id,r.payload,t.subject,t.preview_text,r.schema_version,
    r.subject AS revision_subject,r.preview_text AS revision_preview_text,r.base_template_revision_id,r.rendered_html_sha256,
    t.body_source,t.email_design_revision_id FROM email_design_documents d
    JOIN email_design_revisions r ON r.document_id=d.id AND r.id=d.head_revision_id
    JOIN edm_templates t ON t.id=d.template_id WHERE t.id=$1`, [templateId])).rows[0]
  assert(row)
  assert.equal(row.email_design_revision_id, row.head_revision_id)
  assert.deepEqual(row.body_source, row.payload.blocks, 'Canonical projection is not the stored head')
  assert.equal(row.schema_version, 1)
  assert.equal(row.revision_subject, row.subject, 'Revision/owner subject readback diverged')
  assert.equal(row.revision_preview_text, row.preview_text, 'Revision/owner preview readback diverged')
  assert.equal(row.base_template_revision_id, null, 'A template draft acquired a campaign-only base pin')
  assert.equal(row.rendered_html_sha256, null, 'A template draft acquired campaign-only render metadata')
  return { documentId: row.id, templateId, revisionId: row.head_revision_id, blocks: row.payload.blocks, moduleInstances: row.payload.moduleInstances, assets: row.payload.assets, locks: row.payload.policy.designerLocks, dependencies: row.payload.dependencies, revisionMetadata: { schemaVersion: row.schema_version, subject: row.revision_subject, previewText: row.revision_preview_text, baseTemplateRevisionId: row.base_template_revision_id, renderedHtmlSha256: row.rendered_html_sha256 }, lineage: row.payload.lineage, scope: row.payload.scope, provenance: row.payload.source, subject: row.subject, previewText: row.preview_text }
}
/** Read-only Pages list/projection fixture, not a replacement write owner.
 * All canonical actions and preview rendering dispatch the actual local Worker.
 * Public images use registered fixture bytes, NOT Pages signed-delivery proof. */
async function browserRequest(path: string, body: any, method: string) {
  if (path.startsWith('/api/email/design/'))
    return workerRequest(path, body, method)
  if (path === '/api/email/templates/render' && method === 'POST') {
    const rendered = await workerRequest('/__fixture/preview', body)
    assert.equal(rendered.status, 200)
    assert(rendered.body.ok && rendered.body.operation === 'document', 'Fixture preview RPC: ' + JSON.stringify(rendered.body))
    return { status: 200, body: { html: rendered.body.value.html } }
  }
  assert.equal(method, 'GET', `No fixture write implementation is allowed for ${path}`)
  if (path === '/api/email/template-clients')
    return { status: 200, body: { clients: [], canUseSharedTemplates: true } }
  if (path === `/api/email/templates/${templateId}`) {
    const row = (await db!.query(`SELECT t.*,d.id AS design_document_id,d.head_revision_id,r.schema_version AS revision_schema_version
      FROM edm_templates t LEFT JOIN email_design_documents d ON d.template_id=t.id
      LEFT JOIN email_design_revisions r ON r.document_id=d.id AND r.id=d.head_revision_id WHERE t.id=$1`, [templateId])).rows[0]
    assert(row)
    return { status: 200, body: { template: row } }
  }
  if (path === '/api/agency/email/modules')
    return { status: 200, body: { items: (await db!.query(`SELECT m.*,d.id AS design_document_id,d.head_revision_id,r.schema_version AS revision_schema_version
    FROM edm_custom_modules m LEFT JOIN email_design_documents d ON d.module_id=m.id
    LEFT JOIN email_design_revisions r ON r.document_id=d.id AND r.id=d.head_revision_id ORDER BY m.updated_at DESC`)).rows } }
  if (path === '/api/agency/email/assets')
    return { status: 200, body: { assets: (await db!.query(`SELECT id,client_id AS "clientId",url,mime_type AS "mimeType",file_size AS "fileSize",name,email_publication AS "emailPublication" FROM banner_assets ORDER BY name`)).rows } }
  throw new Error('Unexpected browser API request ' + path)
}
beforeAll(async () => {
  if (!receiptPath)
    return
  assert(planPath, 'Provide calibrated visible-control UI plan; do not substitute old native positions as proof')
  assert.equal(process.env.FIGFLOW_DESIGN_PG_SOCKET, socket, 'Only the assigned disposable socket is allowed')
  receipt = JSON.parse(readFileSync(resolve(receiptPath), 'utf8'))
  plan = JSON.parse(readFileSync(resolve(planPath), 'utf8'))
  await validateNativeLibraryReceipt(receipt)
  assert(plan.expectedEditedText && plan.expectedRevisedText && plan.expectedConcurrentText)
  for (const value of [plan.expectedEditedText, plan.expectedRevisedText, plan.expectedConcurrentText])
    assert(value.includes('{{first_name}}'), 'Native edits must preserve the existing merge token')
  assert.notEqual(plan.expectedEditedText, plan.expectedRevisedText)
  assert.notEqual(plan.expectedConcurrentText, plan.expectedRevisedText)
  await mkdir(evidence, { recursive: true })
  await writeFile(resolve(evidence, 'fixture-inputs.json'), JSON.stringify({ receiptPath: resolve(receiptPath), receiptSha256: sha256(readFileSync(resolve(receiptPath))), planPath: resolve(planPath), planSha256: sha256(readFileSync(resolve(planPath))), expectedSource: receipt.sourceCommit }, null, 2))
  const config = { host: socket, port: 55483, user: 'figflow_test', database: 'figflow_design_test', connectionTimeoutMillis: 5000 }
  admin = new pg.Client(config)
  await admin.connect()
  await admin.query(`CREATE SCHEMA ${schema}`)
  created = true
  db = new pg.Client({ ...config, options: `-c search_path=${schema},public` })
  await db.connect()
  await db.query(`CREATE TABLE team_members(id uuid PRIMARY KEY,email text,name text,user_role text,is_active boolean,avatar_url text,custom_role_id uuid,sessions_invalidated_at timestamptz);
    CREATE TABLE custom_roles(id uuid PRIMARY KEY,name text,is_read_only boolean,is_system boolean,slug text);
    CREATE TABLE role_permission_groups(role_id uuid,permission_group text);
    CREATE TABLE client_team_assignments(team_member_id uuid,client_id uuid);
    CREATE TABLE agency_clients(id uuid PRIMARY KEY,is_active boolean);
    CREATE TABLE edm_templates(id uuid PRIMARY KEY,client_id uuid,name text,folder_name text,body_source jsonb,body_html text,subject text,preview_text text,template_kind text DEFAULT 'draft',updated_at timestamptz DEFAULT now());
    CREATE TABLE edm_custom_modules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,blocks jsonb,name text,description text,category text,preview_tone text,created_by uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE banner_assets(id uuid PRIMARY KEY,client_id uuid,uploaded_by uuid,r2_key text,url text,mime_type text,file_size integer,name text);
    CREATE TABLE campaigns(id uuid PRIMARY KEY,client_id uuid,status text,body_source jsonb,body_html text,subject text,preview_text text,updated_at timestamptz DEFAULT now());`)
  const source = frozenReader(receipt.sourceCommit)
  const required = NATIVE_LIBRARY_MIGRATIONS
  for (const name of required)
    assert(receipt.migrations.some(file => file.path === 'server/database/migrations/' + name), 'Missing fixture migration ' + name)
  for (const file of receipt.migrations)
    await db.query(source.read(file.path))
  await db.query('INSERT INTO team_members VALUES($1,\'synthetic@example.invalid\',\'Synthetic\',\'admin\',true,null,null,null)', [actor])
  await db.query(`INSERT INTO edm_templates(id,name,body_source,body_html,subject,preview_text) VALUES($1,'Synthetic 08a browser',$2::jsonb,'<p>Original fixture</p>','Metadata retained','Synthetic preheader retained')`, [templateId, JSON.stringify({
    root: { type: 'EmailLayout', data: { childrenIds: ['heading', 'cta'] } },
    heading: { type: 'Heading', data: { props: { text: 'Hello {{first_name}}' } } },
    cta: { type: 'Button', data: { props: { text: 'Original CTA', url: 'https://example.invalid/offer' } } }
  })])
  for (const [id, name] of [[assetA, 'Synthetic original registered image'], [assetB, imageName]])
    await db.query('INSERT INTO banner_assets VALUES($1,null,$2,$3,$4,\'image/png\',$5,$6)', [id, actor, assetKey(id!), assetUrl(id!), png.length, name])
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
  const wrapper = `import worker from './native-library-design.mjs';
    export default {async fetch(request,env,context){
      if(new URL(request.url).pathname==='/__fixture/preview'){
        const body=await request.json();
        return Response.json(await env.EMAIL_RENDERER.render({version:1,expectedEnvironment:'staging',operation:'document',document:body.body_source,options:{...(typeof body.subject==='string'?{subjectLine:body.subject}:{}),...(typeof body.preview_text==='string'?{previewText:body.preview_text}:{}),...(body.variables?{variables:body.variables}:{})}}));
      }
      const scoped={...env};
      for(const key of ['HYPERDRIVE','HYPERDRIVE_FRESH']){const url=new URL(env[key].connectionString);url.searchParams.set('options','-c search_path=${schema},public');scoped[key]={connectionString:url.href};}
      return worker.fetch(request,scoped,context);
    }};`
  runtime = new Miniflare({ workers: [{
    name: 'native-library-design', modules: [
      { type: 'ESModule', path: resolve(evidence, 'fixture-entry.mjs'), contents: wrapper },
      { type: 'ESModule', path: resolve(evidence, 'native-library-design.mjs'), contents: readFileSync(resolve(receipt.worker.path)) }
    ], compatibilityDate: '2026-07-08', compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
    bindings: { EMAIL_DESIGN_SESSION_AUTHORITY: 'pages-auth-me-v1', FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_DESIGNER_ENABLED: 'true', FIGFLOW_EDM_LIBRARY_ENABLED: 'true', FIGFLOW_EDM_BRAND_ENABLED: 'true', EMAIL_DESIGN_ENVIRONMENT: 'staging', PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' },
    serviceBindings: { EMAIL_RENDERER: { name: 'native-library-renderer', entrypoint: 'EmailRenderer' } }, r2Buckets: ['MEDIA_BUCKET'],
    hyperdrives: { HYPERDRIVE: `postgres://figflow_test:synthetic@127.0.0.1:${address.port}/figflow_design_test`, HYPERDRIVE_FRESH: `postgres://figflow_test:synthetic@127.0.0.1:${address.port}/figflow_design_test` },
    outboundService: async (request) => {
      if (request.method !== 'GET' || request.url !== 'https://preview.agency-dashboard-6cm.pages.dev/api/auth/me')
        return blockOutbound(request)
      try {
        const [raw, signature] = (request.headers.get('authorization')?.slice(7) ?? '').split('.')
        const payload = Buffer.from(raw!, 'base64')
        if (signature !== createHmac('sha256', authSecret).update(payload).digest('base64'))
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
  }, { name: 'native-library-renderer', modules: true, scriptPath: resolve(receipt.renderer.path), compatibilityDate: '2026-07-08', bindings: { EMAIL_RENDER_ENVIRONMENT: 'staging' }, outboundService: blockOutbound }] })
  await bounded(runtime.ready)
  const bucket = await runtime.getR2Bucket('MEDIA_BUCKET', 'native-library-design')
  for (const id of [assetA, assetB])
    await bucket.put(assetKey(id), png)
    // Explicit fixture setup, not evidence of visible publication/insertion: retain
    // a nonempty preexisting pin, lock and registered old image in every journey.
  const publishedAsset = await workerRequest('/api/email/design/assets/publish', { version: 1, operationId: randomUUID(), assetId: assetA })
  expect(publishedAsset.status, JSON.stringify(publishedAsset.body)).toBe(200)
  const started = await workerRequest('/api/email/design/roundtrip', { command: 'start', operationId: randomUUID(), templateId, clientId: null })
  expect(started.status, JSON.stringify(started.body)).toBe(200)
  const draftId = started.body.handoff.draftId
  let head = started.body.handoff.baseRevisionId
  const pinned = await workerRequest('/api/email/design/modules', { version: 1, command: 'publish-module', operationId: randomUUID(), draftId, expectedDraftRevisionId: head, name: 'Retained fixture pin', category: 'fixture', description: null, previewTone: 'light', includedOverridePaths: [], rootBlockIds: ['cta'] })
  expect(pinned.status, JSON.stringify(pinned.body)).toBe(200)
  const inserted = await workerRequest('/api/email/design/modules', { version: 1, command: 'insert-module', operationId: randomUUID(), draftId, expectedDraftRevisionId: head, moduleId: pinned.body.moduleId, revisionId: pinned.body.revisionId, parentId: 'root', index: 2 })
  expect(inserted.status, JSON.stringify(inserted.body)).toBe(200)
  head = inserted.body.revisionId
  const image = await workerRequest('/api/email/design/modules', { version: 1, command: 'insert-published-image', operationId: randomUUID(), draftId, expectedDraftRevisionId: head, assetId: assetA, parentId: 'root', index: 1 })
  expect(image.status, JSON.stringify(image.body)).toBe(200)
  head = image.body.revisionId
  const locked = await workerRequest(`/api/email/design/drafts/${draftId}/locks`, { version: 1, command: 'set-design-lock', operationId: randomUUID(), draftId, expectedRevisionId: head, lock: { target: 'block', blockId: 'cta', locked: true } })
  expect(locked.status, JSON.stringify(locked.body)).toBe(200)
  const initial = await readDraft()
  originalImageBlockId = Object.keys(initial.blocks).find(id => initial.blocks[id].type === 'Image' && initial.blocks[id].data.props.url === assetUrl(assetA))!
  assert(originalImageBlockId)
  assert(initial.moduleInstances.length && initial.assets.length && (initial.locks as any).blockIds.length)
  await writeFile(resolve(evidence, 'fixture-setup.json'), JSON.stringify({ sourceCommit: receipt.sourceCommit, schema, actor, templateId, assetA, assetB, originalImageBlockId, initial, fixtureEntrySha256: sha256(wrapper), publicDelivery: 'synthetic registered R2 bytes only' }, null, 2))
}, 60000)
afterAll(async () => {
  if (!receiptPath)
    return
  const failures: unknown[] = []
  try {
    await runtime?.dispose()
  } catch (error) {
    failures.push(error)
  }
  await Promise.all([...connections].map(connection => new Promise<void>((done) => {
    connection.once('close', () => done())
    connection.destroy()
  })))
  assert.equal(connections.size, 0, 'Owned socket proxy connections remained')
  if (proxy)
    await new Promise<void>(done => proxy!.close(() => done()))
  try {
    await db?.end()
  } catch (error) {
    failures.push(error)
  }
  let dropped = false
  try {
    if (created) {
      await admin!.query(`DROP SCHEMA ${schema} CASCADE`)
      dropped = (await admin!.query('SELECT nspname FROM pg_namespace WHERE nspname=$1', [schema])).rowCount === 0
      assert(dropped, 'Owned schema remained after cleanup')
    }
  } catch (error) {
    failures.push(error)
  }
  try {
    await admin?.end()
  } catch (error) {
    failures.push(error)
  }
  await mkdir(evidence, { recursive: true })
  await writeFile(resolve(evidence, 'cleanup.json'), JSON.stringify({ schema, created, dropped, proxyConnectionsRemaining: connections.size, outbound, errors: failures.map(String) }, null, 2))
  if (failures.length)
    throw new AggregateError(failures, 'Native library fixture cleanup failed')
})
runtimeTest('accepts matching actual 08a WASM in the real full builder with canonical library/image actions and reopen recovery', async () => {
  const result = await exerciseNativeLibraryBrowser({ receipt, plan, evidenceDirectory: evidence, templateId, moduleName: 'Visible native section', imageName, originalImageBlockId, replacementAssetId: assetB, request: browserRequest, readDraft,
    readModule: async (id) => {
      const row = (await db!.query('SELECT head_revision_id FROM email_design_documents WHERE module_id=$1', [id])).rows[0]
      assert(row)
      return { revisionId: row.head_revision_id }
    },
    publicAsset: async (path) => {
      const row = (await db!.query('SELECT r2_key,mime_type FROM banner_assets WHERE url=$1', ['https://app.xeroflow.io' + path])).rows[0]
      if (!row)
        return null
      const bucket = await runtime!.getR2Bucket('MEDIA_BUCKET', 'native-library-design')
      const object = await bucket.get(row.r2_key)
      assert(object)
      return { bytes: new Uint8Array(await object.arrayBuffer()), contentType: row.mime_type }
    }
  })
  expect(outbound).toEqual([])
  expect(result.reopened.documentId).toBe(result.before.documentId)
  expect(result.reopened.templateId).toBe(templateId)
  expect(result.remaining).toEqual(['public signed Pages asset delivery (this fixture serves registered bytes directly)'])
  await writeFile(resolve(evidence, 'result.json'), JSON.stringify({ ...result, outbound }, null, 2))
}, 360000)
