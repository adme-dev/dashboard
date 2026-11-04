import { createHash, createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createConnection, createServer, type Server, type Socket } from 'node:net'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { build } from 'esbuild'
import { Miniflare, Response as LocalResponse } from 'miniflare'
import pg from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { structuredDesign } from '../fixtures/email-design/structured'

// Opt in only against the disposable local FigFlow cluster and a built artifact.
// This exercises the real Worker, canonical auth, pg transport and transactions.
const socket = process.env.FIGFLOW_DESIGN_PG_SOCKET
const artifact = process.env.FIGFLOW_DESIGN_WORKER_ARTIFACT
const runtimeTest = socket && artifact && process.env.FIGFLOW_EDM_NATIVE_PACKAGE ? it : it.skip
const actor = randomUUID()
const template = randomUUID()
const database = 'figflow_design_test'
const schema = `figflow_designer_browser_${randomUUID().replaceAll('-', '')}`
const secret = 'synthetic-only-design-runtime-secret'
let admin: pg.Client | undefined
let db: pg.Client | undefined
let runtime: Miniflare | undefined
let configuration: ConstructorParameters<typeof Miniflare>[0]
let created = false
let rendererDirectory: string | undefined
let socketProxy: Server | undefined
const proxySockets = new Set<Socket>()
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
  if (!socket || !artifact || !process.env.FIGFLOW_EDM_NATIVE_PACKAGE) return
  if (socket !== '/private/tmp/figflow-postgres-20261102-recovered')
    throw new Error('Requires the isolated FigFlow test cluster')
  const scriptPath = resolve(artifact)
  if (!scriptPath.startsWith(`${process.cwd()}/`))
    throw new Error('Worker artifact must be inside this checkout')
  const config = { host: socket, port: 55483, user: 'figflow_test' }
  admin = new pg.Client({ ...config, database: 'figflow_design_test' })
  await admin.connect()
  await admin.query(`CREATE SCHEMA ${schema}`)
  created = true
  db = new pg.Client({ ...config, database, options: `-c search_path=${schema},public` })
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
    CREATE TABLE edm_custom_modules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, blocks jsonb, name text, description text, category text, preview_tone text, created_by uuid, updated_at timestamptz DEFAULT now());
    CREATE TABLE banner_assets(id uuid PRIMARY KEY, client_id uuid, uploaded_by uuid, r2_key text, url text, mime_type text, file_size integer);
    CREATE TABLE campaigns(id uuid PRIMARY KEY, client_id uuid, status text);
  `)
  for (const file of ['491_email_design_revisions.sql', '492_email_design_revision_metadata.sql', '493_email_design_handoffs.sql', '495_email_asset_publication.sql'])
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
  // The supplied cluster listens on its owned Unix socket, not TCP. Bridge
  // only this loopback ephemeral listener to that exact socket; no PG config.
  socketProxy = createServer((downstream) => {
    const upstream = createConnection({ path: resolve(socket, '.s.PGSQL.55483') })
    let serverBytes = Buffer.alloc(0)
    upstream.on('data', (chunk: Buffer) => {
      serverBytes = Buffer.concat([serverBytes, chunk])
      while (serverBytes.length >= 5) {
        const length = serverBytes.readInt32BE(1)
        if (length < 4 || length > 2 * 1024 * 1024) {
          serverBytes = Buffer.alloc(0)
          break
        }
        if (serverBytes.length < length + 1) break
        if (serverBytes[0] === 69) console.error('Synthetic fixture PostgreSQL error:', serverBytes.subarray(5, length + 1).toString().replaceAll('\0', ' '))
        serverBytes = serverBytes.subarray(length + 1)
      }
    })
    for (const connection of [downstream, upstream]) {
      proxySockets.add(connection)
      connection.on('close', () => proxySockets.delete(connection))
      connection.on('error', () => {
        downstream.destroy()
        upstream.destroy()
      })
    }
    downstream.pipe(upstream).pipe(downstream)
  })
  await new Promise<void>((resolve, reject) => {
    socketProxy!.once('error', reject)
    socketProxy!.listen(0, '127.0.0.1', resolve)
  })
  const address = socketProxy.address()
  if (!address || typeof address === 'string') throw new Error('Local PG bridge unavailable')
  const pgPort = address.port
  // Miniflare's native Hyperdrive connectionString drops URL query options.
  // A fixture entry module appends only our schema search_path to that local
  // magic-host connection string; the actual private Worker bytes are untouched.
  const workerBytes = readFileSync(scriptPath)
  configuration = { workers: [{
    name: 'design',
    modules: [
      { type: 'ESModule', path: resolve(rendererDirectory, 'design-entry.mjs'), contents: `
        import worker from './design-artifact.mjs';
        export default { fetch(request, env, context) {
          const scoped = { ...env };
          for (const key of ['HYPERDRIVE', 'HYPERDRIVE_FRESH']) {
            const url = new URL(env[key].connectionString);
            url.searchParams.set('options', '-c search_path=${schema},public');
            scoped[key] = { connectionString: url.href };
          }
          return worker.fetch(request, scoped, context);
        } };
      ` },
      { type: 'ESModule', path: resolve(rendererDirectory, 'design-artifact.mjs'), contents: workerBytes }
    ],
    compatibilityDate: '2026-07-08',
    compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
    bindings: {
      EMAIL_DESIGN_SESSION_AUTHORITY: 'pages-auth-me-v1',
      FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true',
      FIGFLOW_EDM_DESIGNER_ENABLED: 'true',
      FIGFLOW_EDM_LIBRARY_ENABLED: 'true',
      FIGFLOW_EDM_BRAND_ENABLED: 'true',
      EMAIL_DESIGN_ENVIRONMENT: 'staging',
      PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging'
    },
    serviceBindings: { EMAIL_RENDERER: { name: 'renderer', entrypoint: 'EmailRenderer' } },
    hyperdrives: {
      HYPERDRIVE: `postgres://figflow_test:synthetic@127.0.0.1:${pgPort}/${database}`,
      HYPERDRIVE_FRESH: `postgres://figflow_test:synthetic@127.0.0.1:${pgPort}/${database}`
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
  for (const connection of proxySockets) connection.destroy()
  if (socketProxy) await new Promise<void>((resolve, reject) => socketProxy!.close(error => error ? reject(error) : resolve()))
  if (db) await db.end()
  if (created) {
    await admin!.query(`DROP SCHEMA ${schema} CASCADE`)
    const remaining = (await admin!.query('SELECT nspname FROM pg_namespace WHERE nspname=$1', [schema])).rows
    expect(remaining).toEqual([])
    await writeFile(resolve('.verification/figflow-designer-browser/cleanup.json'), JSON.stringify({ schema, dropped: true, proxyConnectionsRemaining: proxySockets.size }, null, 2))
  }
  if (admin) await admin.end()
  if (rendererDirectory) await rm(rendererDirectory, { recursive: true, force: true })
  for (const result of disposed)
    if (result.status === 'rejected') throw result.reason
})

async function acceptance(includeStructure: boolean, structureAndMobile = false) {
  const { exerciseDesignerRoundtrip } = await import('../helpers/figflowDesignerBrowserRoundtrip')
  const { handleEmailRender } = await import('../../workers/email-rendering/src/handleRender')
  const id = randomUUID()
  let blocks = structuredDesign().blocks
  await db!.query('INSERT INTO edm_templates(id,body_source,subject,preview_text) VALUES($1,$2::jsonb,$3,$4)', [id, JSON.stringify(blocks), 'Designer metadata preserved', 'Synthetic preview preserved'])
  // Convert using the existing authenticated content start, then discover designer
  // availability from the saved structured head as the real composer does.
  const initial = await request('/api/email/design/roundtrip', { command: 'start', operationId: randomUUID(), templateId: id, clientId: null })
  expect(initial.status).toBe(200)
  const opened = initial.body.handoff as { draftId: string, baseRevisionId: string }
  const published = await request('/api/email/design/modules', {
    version: 1, command: 'publish-module', operationId: randomUUID(),
    draftId: opened.draftId, expectedDraftRevisionId: opened.baseRevisionId,
    name: 'Synthetic pinned heading', category: 'acceptance', description: null,
    previewTone: 'light', includedOverridePaths: [], rootBlockIds: ['heading']
  })
  expect(published.status, JSON.stringify(published.body)).toBe(200)
  const inserted = await request('/api/email/design/modules', {
    version: 1, command: 'insert-module', operationId: randomUUID(),
    draftId: opened.draftId, expectedDraftRevisionId: opened.baseRevisionId,
    moduleId: published.body.moduleId, revisionId: published.body.revisionId,
    parentId: 'root', index: 2
  })
  expect(inserted.status, JSON.stringify(inserted.body)).toBe(200)
  const locked = await request(`/api/email/design/drafts/${opened.draftId}/locks`, {
    version: 1, command: 'set-design-lock', operationId: randomUUID(),
    draftId: opened.draftId, expectedRevisionId: inserted.body.revisionId,
    lock: { blockId: 'cta', target: 'block', locked: true }
  })
  expect(locked.status, JSON.stringify(locked.body)).toBe(200)
  // Linked module roots are conservatively locked by designer capabilities.
  // The explicit CTA lock and immutable pin must survive the roundtrip.
  const current = await request('/api/email/design/roundtrip', { command: 'lookup', templateId: id })
  expect(current.status).toBe(200)
  const seeded = current.body.draft as { source: { blocks: typeof blocks, dependencies: unknown[], moduleInstances: unknown[], policy: { designerLocks?: unknown } } }
  blocks = seeded.source.blocks
  expect(seeded.source.dependencies).toHaveLength(1)
  expect(seeded.source.moduleInstances).toHaveLength(1)
  expect(seeded.source.policy.designerLocks).toEqual({ blockIds: ['cta'], styleFields: [] })
  const evidenceDirectory = resolve('.verification/figflow-designer-browser', structureAndMobile ? 'structure-mobile' : includeStructure ? 'structure' : 'props-style')
  await mkdir(evidenceDirectory, { recursive: true })
  await writeFile(resolve(evidenceDirectory, 'seed.json'), JSON.stringify(seeded, null, 2))
  let result: Awaited<ReturnType<typeof exerciseDesignerRoundtrip>>
  try {
    result = await exerciseDesignerRoundtrip({
      packageDirectory: process.env.FIGFLOW_EDM_NATIVE_PACKAGE!, evidenceDirectory,
      templateId: id, blocks, includeStructure, structureAndMobile,
      request: (path, body, method) => request(path, body, secret, method),
      render: async (body) => {
        const rendered = handleEmailRender({ version: 1, expectedEnvironment: 'staging', operation: 'document', document: body.body_source, options: {} }, 'staging')
        if (!rendered.ok || rendered.operation !== 'document') throw new Error('Browser preview render failed')
        return rendered.value.html
      }
    })
  } catch (error) {
    const unchanged = (await db!.query('SELECT body_source,email_design_revision_id,subject,preview_text FROM edm_templates WHERE id=$1', [id])).rows[0]
    const expectedHead = (current.body.draft as { headRevisionId: string }).headRevisionId
    const checkpoint = { templateId: id, expectedHead, persistedHead: unchanged.email_design_revision_id, bodyUnchanged: isDeepStrictEqual(unchanged.body_source, blocks), outboundRequests }
    await writeFile(resolve(evidenceDirectory, 'database-on-failure.json'), JSON.stringify(checkpoint, null, 2))
    if (includeStructure) {
      expect(unchanged.email_design_revision_id).toBe(expectedHead)
      expect(unchanged.body_source).toEqual(blocks)
      expect(outboundRequests).toBe(0)
    }
    throw error
  }
  const row = (await db!.query('SELECT body_source,body_html,email_design_revision_id,subject,preview_text FROM edm_templates WHERE id=$1', [id])).rows[0]
  expect(row.body_source).toEqual(result.final.blocks)
  expect(row.email_design_revision_id).toBe(result.final.draft.headRevisionId)
  expect(row.subject).toBe('Designer metadata preserved')
  expect(row.preview_text).toBe('Synthetic preview preserved')
  expect(row.body_html).toContain('Concurrent staff edit')
  expect(outboundRequests).toBe(0)
  await writeFile(resolve(evidenceDirectory, 'database-result.json'), JSON.stringify({ schema, database, templateId: id, headRevisionId: row.email_design_revision_id, subject: row.subject, previewText: row.preview_text, workerSha256: createHash('sha256').update(readFileSync(resolve(artifact!))).digest('hex'), outboundRequests }, null, 2))
}

runtimeTest('accepts actual native designer props/style through Worker, previews, apply, reload, staff and conflict', () => acceptance(false), 180_000)
runtimeTest('accepts actual native approved section insertion without weakening its emitted operation', () => acceptance(true), 180_000)

runtimeTest('accepts actual native move duplicate remove and mobile style with compiled review and saved pins', () => acceptance(true, true), 180_000)
