import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { Miniflare, Response as LocalResponse } from 'miniflare'
import pg from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { structuredDesign } from '../fixtures/email-design/structured'

// Opt in only against the disposable local FigFlow cluster and a built artifact.
// This exercises the real Worker, canonical auth, pg transport and transactions.
const socket = process.env.FIGFLOW_DESIGN_PG_SOCKET
const artifact = process.env.FIGFLOW_DESIGN_WORKER_ARTIFACT
const runtimeTest = socket && artifact ? it : it.skip
const actor = randomUUID()
const template = randomUUID()
const database = `figflow_worker_${randomUUID().replaceAll('-', '')}`
const secret = 'synthetic-only-design-runtime-secret'
let admin: pg.Client | undefined
let db: pg.Client | undefined
let runtime: Miniflare | undefined
let configuration: ConstructorParameters<typeof Miniflare>[0]
let created = false
let rendererDirectory: string | undefined
let outboundRequests = 0
const blockOutbound = () => {
  outboundRequests++
  return new LocalResponse('blocked', { status: 500 })
}

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Worker runtime deadline')), 15_000)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

function token(key = secret, issuedAt = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ userId: actor, iat: issuedAt, exp: Date.now() + 60_000 }))
  return `${payload.toString('base64')}.${createHmac('sha256', key).update(payload).digest('base64')}`
}

async function request(path: string, body?: unknown, key = secret, method = body === undefined ? 'GET' : 'POST', issuedAt = Date.now()) {
  const url = path.startsWith('/') ? `https://app.xeroflow.io${path}` : `https://app.xeroflow.io/api/email/design/drafts/${path}`
  const response = await bounded(runtime!.dispatchFetch(url, {
    method,
    headers: {
      'authorization': `Bearer ${token(key, issuedAt)}`,
      'origin': 'https://app.xeroflow.io',
      'content-type': 'application/json',
      'x-xeroflow-email-design-environment': 'staging'
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }))
  return { status: response.status, body: await response.json() as Record<string, unknown> }
}

beforeAll(async () => {
  if (!socket || !artifact) return
  if (!socket.startsWith('/private/tmp/figflow-postgres-'))
    throw new Error('Requires the isolated FigFlow test cluster')
  const scriptPath = resolve(artifact)
  if (!scriptPath.startsWith(`${process.cwd()}/`))
    throw new Error('Worker artifact must be inside this checkout')
  const config = { host: socket, port: 55483, user: 'figflow_test' }
  admin = new pg.Client({ ...config, database: 'figflow_design_test' })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${database}`)
  created = true
  db = new pg.Client({ ...config, database })
  await db.connect()
  await db.query(`
    CREATE TABLE team_members(id uuid PRIMARY KEY, email text, name text,
      user_role text, is_active boolean, avatar_url text, custom_role_id uuid,
      sessions_invalidated_at timestamptz);
    CREATE TABLE custom_roles(id uuid PRIMARY KEY, name text, is_read_only boolean, is_system boolean, slug text);
    CREATE TABLE role_permission_groups(role_id uuid, permission_group text);
    CREATE TABLE client_team_assignments(team_member_id uuid, client_id uuid);
    CREATE TABLE agency_clients(id uuid PRIMARY KEY, is_active boolean);
    CREATE TABLE edm_templates(id uuid PRIMARY KEY, client_id uuid, name text, folder_name text, body_source jsonb,
      body_html text, subject text, preview_text text, template_kind text DEFAULT 'draft',
      updated_at timestamptz DEFAULT now());
    CREATE TABLE edm_custom_modules(id uuid PRIMARY KEY, client_id uuid, blocks jsonb);
    CREATE TABLE campaigns(id uuid PRIMARY KEY, client_id uuid, status text);
  `)
  for (const file of ['491_email_design_revisions.sql', '492_email_design_revision_metadata.sql', '493_email_design_handoffs.sql'])
    await db.query(readFileSync(resolve('server/database/migrations', file), 'utf8'))
  await db.query('INSERT INTO team_members VALUES($1,\'synthetic@example.invalid\',\'Synthetic\',\'admin\',true,null,null,null)', [actor])
  await db.query('INSERT INTO edm_templates(id, body_html, subject) VALUES($1,\'<p>Synthetic original</p>\',\'Synthetic\')', [template])
  await mkdir(resolve('.verification'), { recursive: true })
  rendererDirectory = await mkdtemp(resolve('.verification/figflow-renderer-'))
  const rendererFile = resolve(rendererDirectory, 'index.mjs')
  await build({
    entryPoints: [resolve('workers/email-rendering/src/index.ts')],
    outfile: rendererFile, bundle: true, format: 'esm', platform: 'neutral',
    target: 'esnext', conditions: ['workerd', 'worker', 'browser'],
    mainFields: ['module', 'main'], external: ['cloudflare:*'], logLevel: 'silent'
  })
  configuration = { workers: [{
    name: 'design',
    modules: true,
    scriptPath,
    compatibilityDate: '2026-07-08',
    compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
    bindings: {
      EMAIL_DESIGN_SESSION_AUTHORITY: 'pages-auth-me-v1',
      FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true',
      EMAIL_DESIGN_ENVIRONMENT: 'staging',
      PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging'
    },
    serviceBindings: { EMAIL_RENDERER: { name: 'renderer', entrypoint: 'EmailRenderer' } },
    hyperdrives: {
      HYPERDRIVE: `postgres://figflow_test:synthetic@127.0.0.1:55483/${database}`,
      HYPERDRIVE_FRESH: `postgres://figflow_test:synthetic@127.0.0.1:55483/${database}`
    },
    // No network fallback or hosted database is allowed in this fixture.
    outboundService: async (req) => {
      // Isolated canonical authority fixture; no production request is permitted.
      if (req.url !== 'https://preview.agency-dashboard-6cm.pages.dev/api/auth/me' || req.method !== 'GET') return blockOutbound()
      const supplied = req.headers.get('authorization')?.slice(7) ?? ''
      const [data, signature] = supplied.split('.')
      try {
        const payload = Buffer.from(data, 'base64')
        if (createHmac('sha256', secret).update(payload).digest('base64') !== signature) return LocalResponse.json({}, { status: 401 })
        const claims = JSON.parse(payload.toString())
        const row = (await db!.query('SELECT id,is_active,sessions_invalidated_at FROM team_members WHERE id=$1', [claims.userId])).rows[0]
        if (!row?.is_active || claims.exp < Date.now() || (row.sessions_invalidated_at && claims.iat < new Date(row.sessions_invalidated_at).getTime())) return LocalResponse.json({}, { status: 401 })
        return LocalResponse.json({ success: true, user: { id: row.id, is_active: true } })
      } catch { return LocalResponse.json({}, { status: 401 }) }
    }
  }, {
    name: 'renderer', modules: true, scriptPath: rendererFile,
    compatibilityDate: '2026-07-08', bindings: { EMAIL_RENDER_ENVIRONMENT: 'staging' },
    outboundService: blockOutbound
  }] }
  runtime = new Miniflare(configuration)
  await bounded(runtime.ready)
}, 30_000)

afterAll(async () => {
  // Runtime initialization can fail; still close clients and remove our database.
  const disposed = runtime ? await Promise.allSettled([runtime.dispose()]) : []
  if (db) await db.end()
  if (created) await admin!.query(`DROP DATABASE ${database}`)
  if (admin) await admin.end()
  if (rendererDirectory) await rm(rendererDirectory, { recursive: true, force: true })
  for (const result of disposed)
    if (result.status === 'rejected') throw result.reason
})

runtimeTest('initializes once through a real fresh transaction and reopens the immutable legacy head', async () => {
  const input = { version: 1, templateId: template, scope: { clientId: null } }
  const first = await request('initialize', input)
  expect(first.status).toBe(200)
  expect(first.body).toMatchObject({ version: 1, schemaVersion: 0, origin: 'legacy', published: false })
  expect(await request('initialize', input)).toEqual(first)
  const reopened = await request(String(first.body.draftId))
  expect(reopened.status).toBe(200)
  expect(reopened.body.draft).toMatchObject({ state: 'legacy', templateId: template, headRevisionId: first.body.revisionId })
  expect((await db!.query('SELECT count(*)::int AS count FROM email_design_revisions')).rows[0].count).toBe(1)
}, 30_000)

runtimeTest('renders through the real private RPC service and atomically saves a canonical revision', async () => {
  const baseline = await request('initialize', { version: 1, templateId: template, scope: { clientId: null } })
  expect(baseline.status).toBe(200)
  const action = {
    version: 1, action: 'save-draft', operationId: randomUUID(), scope: { clientId: null },
    draftId: baseline.body.draftId, expectedRevisionId: baseline.body.revisionId,
    design: { ...structuredDesign(), scope: { clientId: null } }
  }
  const saved = await request(String(action.draftId), action, secret, 'PATCH')
  expect(saved.status).toBe(200)
  expect(saved.body).toMatchObject({ ok: true, published: false, operationId: action.operationId })
  expect(await request(String(action.draftId), action, secret, 'PATCH')).toEqual(saved)
  const reopened = await request(String(action.draftId))
  expect(reopened.body.draft).toMatchObject({ state: 'structured', projection: { state: 'current' }, headRevisionId: saved.body.revisionId })
  const owner = (await db!.query('SELECT body_html, email_design_revision_id FROM edm_templates WHERE id=$1', [template])).rows[0]
  expect(owner.email_design_revision_id).toBe(saved.body.revisionId)
  expect(owner.body_html).toContain('Hello {{first_name}}')
  expect(owner.body_html).toContain('https://example.com/offer')
  const stale = await request(String(action.draftId), { ...action, operationId: randomUUID() }, secret, 'PATCH')
  expect(stale.status).toBe(409)
  expect((await db!.query('SELECT count(*)::int AS count FROM email_design_revisions')).rows[0].count).toBe(2)
  const metadata = {
    version: 1, operationId: randomUUID(), expectedRevisionId: saved.body.revisionId,
    scope: { clientId: null }, subject: 'Updated synthetic subject', previewText: ''
  }
  const updated = await request(`${action.draftId}/metadata`, metadata, secret, 'PATCH')
  expect(updated.status).toBe(200)
  expect(await request(`${action.draftId}/metadata`, metadata, secret, 'PATCH')).toEqual(updated)
  const projection = (await db!.query('SELECT subject, preview_text, email_design_revision_id FROM edm_templates WHERE id=$1', [template])).rows[0]
  expect(projection).toEqual({ subject: metadata.subject, preview_text: '', email_design_revision_id: updated.body.revisionId })
  const source = (await db!.query('SELECT payload_text FROM email_design_revisions WHERE id IN ($1,$2)', [saved.body.revisionId, updated.body.revisionId])).rows
  expect(source).toHaveLength(2)
  expect(source[0].payload_text).toBe(source[1].payload_text)
  expect(JSON.parse(source[0].payload_text)).toEqual(action.design)
  expect((await db!.query('SELECT count(*)::int AS count FROM email_design_revisions')).rows[0].count).toBe(3)
}, 30_000)

runtimeTest('persists and applies a FigFlow content proposal through actual authenticated Worker and renderer RPC', async () => {
  const id = randomUUID()
  await db!.query('INSERT INTO edm_templates(id,body_source,subject) VALUES($1,$2::jsonb,$3)', [id, JSON.stringify(structuredDesign().blocks), 'Round trip'])
  const endpoint = '/api/email/design/roundtrip'
  const opened = await request(endpoint, { command: 'start', operationId: randomUUID(), templateId: id, clientId: null })
  expect(opened.status).toBe(200)
  const handoff = opened.body.handoff as any
  const design = JSON.parse(JSON.stringify(handoff.source))
  design.blocks.heading.data.props.text = 'Actual Worker round trip'
  const proposed = await request(endpoint, { command: 'propose', handoffId: handoff.id, action: {
    version: 1, action: 'propose-return', operationId: randomUUID(), scope: { clientId: null }, draftId: handoff.draftId, baseRevisionId: handoff.baseRevisionId, design
  } })
  expect(proposed.status).toBe(200)
  const proposal = proposed.body.handoff as any
  expect((await db!.query('SELECT email_design_revision_id FROM edm_templates WHERE id=$1', [id])).rows[0].email_design_revision_id).toBe(handoff.baseRevisionId)
  const action = { command: 'apply', handoffId: handoff.id, action: {
    version: 1, action: 'apply-return', operationId: randomUUID(), scope: { clientId: null }, proposalId: handoff.id,
    expectedProposalRevisionId: proposal.proposalRevisionId, expectedDraftRevisionId: handoff.baseRevisionId
  } }
  const applied = await request(endpoint, action)
  expect(applied.status).toBe(200)
  expect(await request(endpoint, action)).toEqual(applied)
  const row = (await db!.query('SELECT body_source,body_html,email_design_revision_id FROM edm_templates WHERE id=$1', [id])).rows[0]
  expect(row.body_source).toEqual(design.blocks)
  expect(row.body_html).toContain('Actual Worker round trip')
  expect(row.email_design_revision_id).toBe((applied.body.handoff as any).appliedRevisionId)
  expect(outboundRequests).toBe(0)
}, 30_000)

runtimeTest('preserves ordinary template edits/deletes, read-only denial and versioned-history conflicts', async () => {
  configuration.workers![0]!.bindings!.FIGFLOW_EDM_DRAFT_SAVES_ENABLED = 'false'
  await bounded(runtime!.setOptions(configuration))
  try {
    expect((await request('invalid')).status).toBe(404)
    const legacy = randomUUID()
    await db!.query('INSERT INTO edm_templates(id,name,body_source) VALUES($1,$2,$3)', [legacy, 'Legacy synthetic', structuredDesign().blocks])
    const route = `/api/email/templates/${legacy}`
    const edited = await request(route, { name: 'Renamed synthetic' }, secret, 'PATCH')
    expect(edited.status).toBe(200)
    expect(edited.body.template).toMatchObject({ id: legacy, name: 'Renamed synthetic' })
    expect((await db!.query('SELECT body_html FROM edm_templates WHERE id=$1', [legacy])).rows[0].body_html).toContain('Hello {{first_name}}')
    await db!.query('UPDATE team_members SET user_role=\'viewer\' WHERE id=$1', [actor])
    expect((await request(route, { name: 'Forbidden' }, secret, 'PATCH')).status).toBe(403)
    expect((await request(route, undefined, secret, 'DELETE')).status).toBe(403)
    await db!.query('UPDATE team_members SET user_role=\'admin\' WHERE id=$1', [actor])
    const versionedRoute = `/api/email/templates/${template}`
    expect((await request(versionedRoute, { subject: 'Stale legacy mutation' }, secret, 'PATCH')).status).toBe(409)
    expect((await request(versionedRoute, undefined, secret, 'DELETE')).status).toBe(409)
    const client = randomUUID()
    await db!.query('INSERT INTO agency_clients VALUES($1,true)', [client])
    expect((await request(versionedRoute, { client_id: client }, secret, 'PATCH')).status).toBe(409)
    expect((await request(route, undefined, secret, 'DELETE')).status).toBe(200)
    expect((await db!.query('SELECT id FROM edm_templates WHERE id=$1', [legacy])).rows).toEqual([])
  } finally {
    configuration.workers![0]!.bindings!.FIGFLOW_EDM_DRAFT_SAVES_ENABLED = 'true'
    await bounded(runtime!.setOptions(configuration))
  }
}, 30_000)

runtimeTest('uses the configured signing key and immediately observes session deactivation', async () => {
  expect((await request('invalid', undefined, 'wrong-synthetic-key')).status).toBe(401)
  expect((await request('invalid')).status).toBe(400)
  await db!.query('UPDATE team_members SET is_active=false WHERE id=$1', [actor])
  expect((await request('invalid')).status).toBe(401)
  const oldIssuedAt = Date.now() - 1_000
  await db!.query('UPDATE team_members SET is_active=true, sessions_invalidated_at=now() WHERE id=$1', [actor])
  expect((await request('invalid', undefined, secret, 'GET', oldIssuedAt)).status).toBe(401)
  expect((await request('invalid')).status).toBe(400)
}, 30_000)

const nativeBrowserTest = socket && artifact && process.env.FIGFLOW_EDM_NATIVE_PACKAGE ? it : it.skip
nativeBrowserTest('completes two actual native browser returns with explicit preview/apply and composer undo', async () => {
  const { exerciseNativeRoundtrip } = await import('../helpers/figflowBrowserRoundtrip')
  const { handleEmailRender } = await import('../../workers/email-rendering/src/handleRender')
  const id = randomUUID()
  const blocks = structuredDesign().blocks
  await db!.query('INSERT INTO edm_templates(id,body_source,subject) VALUES($1,$2::jsonb,$3)', [id, JSON.stringify(blocks), 'Native browser fixture'])
  const result = await exerciseNativeRoundtrip({
    packageDirectory: process.env.FIGFLOW_EDM_NATIVE_PACKAGE!,
    evidenceDirectory: resolve('.verification/figflow-native-browser'), templateId: id, blocks,
    request: (path, body, method) => request(path, body, secret, method),
    render: async body => {
      const result = handleEmailRender({ version: 1, expectedEnvironment: 'staging', operation: 'document', document: body.body_source, options: {} }, 'staging')
      if (!result.ok || result.operation !== 'document') throw new Error('Browser preview render failed')
      return result.value.html
    }
  })
  const row = (await db!.query('SELECT body_source,body_html,email_design_revision_id FROM edm_templates WHERE id=$1', [id])).rows[0]
  expect(row.body_source).toEqual(result.final.blocks)
  expect(row.body_html).toContain('Second real native return')
  expect(row.body_html).toContain('Staff CTA preserved')
  expect(row.email_design_revision_id).toBe(result.final.handoff.appliedRevisionId)
  expect(outboundRequests).toBe(0)
}, 180_000)

runtimeTest('closes request and transaction clients after responses', async () => {
  expect(outboundRequests).toBe(0)
  const rows = (await admin!.query('SELECT pid FROM pg_stat_activity WHERE datname=$1', [database])).rows
  // Only this fixture control connection may remain, including after failures.
  expect(rows).toHaveLength(1)
  expect(rows[0].pid).toBe((await db!.query('SELECT pg_backend_pid() AS pid')).rows[0].pid)
})
