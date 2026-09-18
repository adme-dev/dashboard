import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordPageStudioCheckpoint, type PageStudioCheckpointInput, type PageStudioControlQueryClient, type PageStudioControlScope } from '~~/server/utils/pageStudio/controlStore'
import { preparePageStudioContentAttachment } from '~~/server/utils/pageStudio/contentAttachmentIntent'
import { revokePageStudioLoginSession } from '~~/server/utils/pageStudio/loginSessions'
import { createJwt } from '~~/server/utils/auth'
import fixture from '../../fixtures/pageStudio/history-manifest.json'

// Every production query runs against the disposable database. An accidental
// fallback to the application's connection fails instead of touching real data.
const loginTransactions = vi.hoisted(() => ({
  run: undefined as undefined | (<T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>)
}))
vi.mock('~~/server/utils/db', () => ({
  transaction: <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) => {
    if (!loginTransactions.run) throw new Error('Inject the disposable transaction')
    return loginTransactions.run(callback)
  },
  queryOneFresh: () => { throw new Error('Authority must use the acceptance transaction') },
  queryOne: () => { throw new Error('Unexpected application database access') },
  queryRows: () => { throw new Error('Unexpected application database access') },
  execute: () => { throw new Error('Unexpected application database access') }
}))

const databaseUrl = process.env.PAGE_STUDIO_ATTACHMENT_DATABASE_TEST_URL
if (databaseUrl) {
  const target = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['127.0.0.1', 'localhost'].includes(target.hostname)
    || !/^\/studio_attachment_intent(?:_[a-z0-9_]+)?$/.test(target.pathname) || target.search) {
    throw new Error('Attachment intent tests require an explicitly disposable localhost studio_attachment_intent database')
  }
}
const userId = '30000000-0000-4000-8000-000000000501'
const clientId = '20000000-0000-4000-8000-000000000501'
const roleId = '60000000-0000-4000-8000-000000000501'
const migrationSql = [402, 404, 420].map(number => readFileSync(new URL({
  402: '../../../server/database/migrations/402_page_studio_control_plane.sql',
  404: '../../../server/database/migrations/404_page_studio_documents.sql',
  420: '../../../server/database/migrations/420_page_studio_login_sessions.sql'
}[number]!, import.meta.url), 'utf8'))
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
type Outcome<T> = { ok: true, value: T } | { ok: false, error: unknown }
const capture = <T>(promise: Promise<T>): Promise<Outcome<T>> => promise.then(
  value => ({ ok: true, value }), error => ({ ok: false, error })
)

describe.runIf(Boolean(databaseUrl))('Native CMS attachment intent on PostgreSQL', () => {
  let observer: pg.Client
  let schema: string
  let scope: PageStudioControlScope
  let connections: pg.Client[] = []
  let loginToken: string
  const blobs = new Map<string, string>()
  let beforeRead: (() => Promise<void>) | undefined
  const bucket = {
    get: async (key: string) => {
      await beforeRead?.()
      return blobs.has(key) ? { body: new Response(blobs.get(key)).body! } : null
    }
  }

  async function connect() {
    const db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    connections.push(db)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query('SET statement_timeout TO \'6s\'')
    return db
  }

  function transactionFor(db: pg.Client, beforeCommit?: () => Promise<void>) {
    return async <T>(callback: (client: PageStudioControlQueryClient) => Promise<T>): Promise<T> => {
      await db.query('BEGIN')
      try {
        const result = await callback(db as unknown as PageStudioControlQueryClient)
        await beforeCommit?.()
        await db.query('COMMIT')
        return result
      } catch (error) {
        await db.query('ROLLBACK')
        throw error
      }
    }
  }

  function checkpoint(id: string, character: string): PageStudioCheckpointInput {
    return { checkpointId: id, scope, userId, digest: character.repeat(64), etag: `etag-${id}`,
      objectKey: `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${id}.json`,
      createdAt: '2026-09-18T00:00:00.000Z' }
  }

  async function snapshot() {
    return (await observer.query(`SELECT current_checkpoint_id, current_version_id,
      (SELECT jsonb_agg(to_jsonb(checkpoint) ORDER BY id) FROM page_studio_checkpoints checkpoint) AS checkpoints,
      (SELECT jsonb_agg(to_jsonb(version) ORDER BY id) FROM page_studio_versions version) AS versions,
      current_release_id
      FROM page_studio_sites WHERE id=$1`, [scope.siteId])).rows[0]
  }

  async function waitForBlock(waiter: pg.Client, blocker: pg.Client) {
    // Read backend IDs before callers start waiting queries; pg exposes the
    // connected process ID without queuing another query behind the lock wait.
    const waiterPid = (waiter as unknown as { processID: number }).processID
    const blockerPid = (blocker as unknown as { processID: number }).processID
    await expect.poll(async () => (await observer.query<{ blocked: boolean }>(
      'SELECT $2=ANY(pg_blocking_pids($1)) AS blocked', [waiterPid, blockerPid]
    )).rows[0]!.blocked, { timeout: 1500, interval: 20 }).toBe(true)
  }

  async function seedLogin(role: 'agency' | 'client') {
    loginToken = role === 'agency' ? await createJwt({ userId, role: 'owner' }) : randomUUID()
    if (role === 'client') await observer.query('INSERT INTO client_sessions VALUES($1,$2,NOW()+INTERVAL \'1 day\')',
      [createHash('sha256').update(loginToken).digest('hex'), userId])
  }

  beforeEach(async () => {
    connections = []
    blobs.clear()
    beforeRead = undefined
    schema = `checkpoint_authority_${randomUUID().replaceAll('-', '')}`
    observer = await connect()
    await observer.query(`CREATE SCHEMA "${schema}"`)
    await observer.query(`
      CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
      CREATE TABLE client_sessions(token_hash TEXT PRIMARY KEY,client_user_id UUID,expires_at TIMESTAMPTZ);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN,is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));
      CREATE TABLE page_studio_sessions(nonce TEXT PRIMARY KEY,tenant_id TEXT,client_id UUID,site_id UUID,user_id TEXT,
        role TEXT,capabilities JSONB,issued_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);
    `)
    await observer.query('INSERT INTO custom_roles VALUES($1,\'owner\',TRUE,FALSE)', [roleId])
    for (const migration of migrationSql) await observer.query(migration)
    await observer.query('INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)', [userId])
    await observer.query('INSERT INTO agency_clients VALUES($1,TRUE)', [clientId])
    await observer.query('INSERT INTO client_users VALUES($1,$2,\'active\',\'manager\')', [userId, clientId])
    const entitlement = (await observer.query(`INSERT INTO page_studio_entitlements(tenant_id,client_id,created_by)
      VALUES('checkpoint-authority',$1,$2) RETURNING id`, [clientId, userId])).rows[0]
    const site = (await observer.query(`INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version,created_by)
      VALUES('checkpoint-authority',$1,$2,'Checkpoint authority fixture','checkpoint-authority','fixture-v1',$3) RETURNING id`, [clientId, entitlement.id, userId])).rows[0]
    scope = { tenantId: 'checkpoint-authority', clientId, siteId: site.id }
    await observer.query(`INSERT INTO page_studio_site_memberships(tenant_id,client_id,site_id,user_id,role)
      VALUES($1,$2,$3,$4,'editor')`, [scope.tenantId, clientId, scope.siteId, userId])
    const manifest = { ...fixture, id: scope.siteId }
    const canonical = (v: unknown): string => v && typeof v === 'object' ? Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v)
    const digest = createHash('sha256').update(canonical(manifest)).digest('hex')
    for (const id of ['checkpoint_old', 'checkpoint_base']) {
      const saved = { ...checkpoint(id, 'a'), digest }
      blobs.set(saved.objectKey, JSON.stringify({ schemaVersion: 1, ...saved, manifest }))
      await recordPageStudioCheckpoint(saved, { runTransaction: transactionFor(observer) })
    }
  })

  afterEach(async () => {
    loginTransactions.run = undefined
    await Promise.all(connections.filter(db => db !== observer).map(db => db.end()))
    if (!observer) return
    try {
      await observer.query('ROLLBACK')
      await observer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally { await observer.end() }
  })

  const artifacts = { schemaDigest: 'c'.repeat(64), runtimeDigest: 'd'.repeat(64), policyVersion: 'content-attachment-v1' }
  async function intentCount() {
    return Number((await observer.query('SELECT count(*) AS count FROM page_studio_audit_events WHERE action=\'content.attachment.requested\'')).rows[0].count)
  }
  describe.each(['agency', 'client'] as const)('%s originating login', (role) => {
    beforeEach(() => seedLogin(role))
    function event() {
      const incoming = new IncomingMessage(new Socket())
      incoming.method = 'POST'
      incoming.url = '/test/attachment'
      incoming.headers = { authorization: `Bearer ${loginToken}` }
      return createEvent(incoming, new ServerResponse(incoming))
    }
    function request() {
      const actor = role === 'agency'
        ? { role, actorId: userId, tenantId: scope.tenantId, canEdit: true }
        : { role, actorId: userId, clientId }
      return { actor, event: event(), siteId: scope.siteId, bucket, environment: 'staging' as const,
        artifacts, body: { requestId: randomUUID(), expectedCheckpointId: 'checkpoint_base' } }
    }
    const options = async () => ({ runTransaction: transactionFor(await connect()) })

    it('derives and retains the exact intent; replay leaves pages/history/releases unchanged', async () => {
      const before = await snapshot(), input = request(), opts = await options()
      const saved = await preparePageStudioContentAttachment(input, opts)
      expect(saved.intent).toMatchObject({ version: 1, mode: 'attach-existing-content', scope: { ...scope, businessId: clientId, environment: 'staging' },
        actor: { kind: role === 'agency' ? 'agency-user' : 'client-user', userId, loginSessionHash: createHash('sha256').update(loginToken).digest('hex') },
        anchor: { checkpointId: 'checkpoint_base' }, ...artifacts })
      expect(saved.identity).toMatch(/^cms_attach_[a-f0-9]{64}$/)
      expect(await preparePageStudioContentAttachment(input, opts)).toEqual(saved)
      expect(await intentCount()).toBe(1)
      expect(await snapshot()).toEqual(before)
    })
    it('retains the original immutable anchor when the editor saves a later head', async () => {
      const input = request(), opts = await options()
      const saved = await preparePageStudioContentAttachment(input, opts)
      await observer.query('UPDATE page_studio_sites SET current_checkpoint_id=\'checkpoint_old\'')
      expect(await preparePageStudioContentAttachment(input, opts)).toEqual(saved)
      expect((await snapshot()).current_checkpoint_id).toBe('checkpoint_old')
    })
    it('denies missing native credentials', async () => {
      await expect(preparePageStudioContentAttachment({ ...request(), event: undefined }, await options())).rejects.toMatchObject({ statusCode: 401 })
      expect(await intentCount()).toBe(0)
    })
    it.each(['scope', 'actor', 'runtimeDigest', 'policyVersion', 'operationId'])('rejects client-supplied %s', async (field) => {
      const input = request()
      await expect(preparePageStudioContentAttachment({ ...input, body: { ...input.body, [field]: 'forged' } }, await options())).rejects.toMatchObject({ statusCode: 400 })
      expect(await intentCount()).toBe(0)
    })
    it('rejects a stale expected checkpoint and an unknown website', async () => {
      const input = request()
      await expect(preparePageStudioContentAttachment({ ...input, body: { ...input.body, expectedCheckpointId: 'checkpoint_old' } }, await options())).rejects.toMatchObject({ statusCode: 409 })
      await expect(preparePageStudioContentAttachment({ ...input, siteId: randomUUID() }, await options())).rejects.toMatchObject({ statusCode: 404 })
      expect(await intentCount()).toBe(0)
    })
    it('rejects reusing the request ID with a different anchor or server artifact configuration', async () => {
      const input = request(), opts = await options()
      await preparePageStudioContentAttachment(input, opts)
      await expect(preparePageStudioContentAttachment({ ...input, body: { ...input.body, expectedCheckpointId: 'checkpoint_old' } }, opts)).rejects.toMatchObject({ statusCode: 409 })
      for (const field of ['runtimeDigest', 'schemaDigest', 'policyVersion']) {
        await expect(preparePageStudioContentAttachment({ ...input, artifacts: { ...artifacts, [field]: field === 'policyVersion' ? 'next-policy' : 'e'.repeat(64) } }, opts)).rejects.toMatchObject({ statusCode: 409 })
      }
      expect(await intentCount()).toBe(1)
    })
    it('cannot transfer a retained request to a newer native login', async () => {
      const input = request(), opts = await options()
      await preparePageStudioContentAttachment(input, opts)
      if (role === 'agency') {
        loginToken = await createJwt({ userId, role: 'owner', loginInstance: randomUUID() })
      } else await seedLogin(role)
      await expect(preparePageStudioContentAttachment({ ...input, event: event() }, opts)).rejects.toMatchObject({ statusCode: 409 })
      expect(await intentCount()).toBe(1)
    })
    it.each([
      'UPDATE agency_clients SET is_active=FALSE',
      'UPDATE page_studio_sites SET status=\'suspended\'',
      'UPDATE page_studio_entitlements SET status=\'suspended\'',
      'UPDATE page_studio_entitlements SET effective_until=clock_timestamp()-INTERVAL \'1 second\'',
      'UPDATE page_studio_entitlements SET effective_from=clock_timestamp()+INTERVAL \'1 hour\'',
      'UPDATE page_studio_entitlements SET active_site_limit=0',
      'UPDATE page_studio_entitlements SET plan_metadata=\'{"allowedModules":[]}\'',
      'UPDATE page_studio_entitlements SET plan_metadata=\'{"allowedModules":false}\''
    ])('revokes a retained intent after %s', async (mutation) => {
      const input = request(), opts = await options()
      await preparePageStudioContentAttachment(input, opts)
      await observer.query(mutation)
      await expect(preparePageStudioContentAttachment(input, opts)).rejects.toMatchObject({ statusCode: 403 })
      expect(await intentCount()).toBe(1)
    })
    it('rejects absent, foreign or corrupt checkpoint blobs without recording an intent', async () => {
      const entries = [...blobs.entries()]
      blobs.clear()
      await expect(preparePageStudioContentAttachment(request(), await options())).rejects.toMatchObject({ statusCode: 422 })
      const [key, text] = entries.find(([key]) => key.endsWith('/checkpoint_base.json'))!
      const envelope = JSON.parse(text)
      blobs.set(key, JSON.stringify({ ...envelope, scope: { ...scope, siteId: randomUUID() } }))
      await expect(preparePageStudioContentAttachment(request(), await options())).rejects.toMatchObject({ statusCode: 422 })
      blobs.set(key, JSON.stringify({ ...envelope, manifest: { ...envelope.manifest, name: 'tampered' } }))
      await expect(preparePageStudioContentAttachment(request(), await options())).rejects.toMatchObject({ statusCode: 422 })
      expect(await intentCount()).toBe(0)
    })
    it('rejects a website outside the authenticated tenant or client', async () => {
      const input = request()
      const actor = role === 'agency' ? { ...input.actor, tenantId: 'foreign' } : { ...input.actor, clientId: randomUUID() }
      await expect(preparePageStudioContentAttachment({ ...input, actor }, await options())).rejects.toMatchObject({ statusCode: 404 })
      expect(await intentCount()).toBe(0)
    })
    it('rejects an actor different from the native credential owner', async () => {
      const input = request()
      await expect(preparePageStudioContentAttachment({ ...input, actor: { ...input.actor, actorId: randomUUID() } }, await options())).rejects.toMatchObject({ statusCode: 401 })
      expect(await intentCount()).toBe(0)
    })
    it('rejects page allowance loss before retaining an intent', async () => {
      // Inflate only the synthetic fixture and update its honest immutable digest.
      const key = [...blobs.keys()].find(key => key.endsWith('/checkpoint_base.json'))!
      const envelope = JSON.parse(blobs.get(key)!)
      envelope.manifest.pages = Array.from({ length: 11 }, (_, index) => ({ id: `page_${index}` }))
      const canonical = (v: unknown): string => v && typeof v === 'object' ? Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v)
      envelope.digest = createHash('sha256').update(canonical(envelope.manifest)).digest('hex')
      blobs.set(key, JSON.stringify(envelope))
      await observer.query('UPDATE page_studio_checkpoints SET digest=$1 WHERE id=\'checkpoint_base\'', [envelope.digest])
      await expect(preparePageStudioContentAttachment(request(), await options())).rejects.toMatchObject({ statusCode: 403 })
      expect(await intentCount()).toBe(0)
    })
    it('rejects invalid server configuration before retaining an intent', async () => {
      const input = request()
      for (const invalid of [undefined, { ...artifacts, runtimeDigest: 'unreviewed' }, { ...artifacts, source: 'https://foreign.example/code.js' }]) {
        await expect(preparePageStudioContentAttachment({ ...input, artifacts: invalid }, await options())).rejects.toMatchObject({ statusCode: 503 })
      }
      expect(await intentCount()).toBe(0)
    })
    it('rechecks retained login expiry during a retry checkpoint read', async () => {
      const input = request(), opts = await options()
      await preparePageStudioContentAttachment(input, opts)
      await observer.query('UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()+INTERVAL \'0.3 seconds\'')
      beforeRead = async () => {
        await observer.query('SELECT pg_sleep(0.4)')
      }
      await expect(preparePageStudioContentAttachment(input, opts)).rejects.toMatchObject({ statusCode: 403 })
      expect(await intentCount()).toBe(1)
    })
    it('recovers a lost response after PostgreSQL committed the intent', async () => {
      const input = request(), run = transactionFor(await connect())
      let loseResponse = true
      const opts = { runTransaction: async <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) => {
        const result = await run(callback)
        if (loseResponse) {
          loseResponse = false
          throw new Error('Injected lost acknowledgement after commit')
        }
        return result
      } }
      await expect(preparePageStudioContentAttachment(input, opts)).rejects.toThrow('lost acknowledgement')
      const retained = (await observer.query('SELECT metadata FROM page_studio_audit_events WHERE action=\'content.attachment.requested\'')).rows[0].metadata
      expect(await preparePageStudioContentAttachment(input, opts)).toEqual({ intent: retained.intent, identity: retained.identity })
      expect(await intentCount()).toBe(1)
    })
    it('rolls back the intent when its insert crosses package expiry', async () => {
      await observer.query(`CREATE SEQUENCE attachment_insert_visits;
        CREATE FUNCTION delay_attachment_insert() RETURNS trigger AS $$
        BEGIN IF NEW.action='content.attachment.requested' THEN PERFORM nextval('attachment_insert_visits'); PERFORM pg_sleep(0.4); END IF; RETURN NEW; END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER delay_attachment_insert BEFORE INSERT ON page_studio_audit_events
        FOR EACH ROW EXECUTE FUNCTION delay_attachment_insert();`)
      await observer.query('UPDATE page_studio_entitlements SET effective_until=clock_timestamp()+INTERVAL \'0.3 seconds\'')
      await expect(preparePageStudioContentAttachment(request(), await options())).rejects.toMatchObject({ statusCode: 403 })
      expect(await intentCount()).toBe(0)
      // Sequence increments survive rollback, proving we reached the delayed insert.
      expect((await observer.query('SELECT is_called FROM attachment_insert_visits')).rows[0].is_called).toBe(true)
    })
    it('serializes concurrent identical requests into one durable intent', async () => {
      const input = request()
      const results = await Promise.all([preparePageStudioContentAttachment(input, await options()), preparePageStudioContentAttachment(input, await options())])
      expect(results[0]).toEqual(results[1])
      expect(await intentCount()).toBe(1)
    })
    it('denies a request waiting on the site after actual native logout', async () => {
      const blocker = await connect(), writer = await connect(), revoker = await connect()
      loginTransactions.run = transactionFor(revoker)
      await blocker.query('BEGIN')
      await blocker.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE', [scope.siteId])
      const pending = capture(preparePageStudioContentAttachment(request(), { runTransaction: transactionFor(writer) }))
      try {
        await waitForBlock(writer, blocker)
        await revokePageStudioLoginSession(event(), role)
        await blocker.query('COMMIT')
        expect(await pending).toMatchObject({ ok: false, error: { statusCode: 401 } })
        expect(await intentCount()).toBe(0)
      } finally {
        await blocker.query('ROLLBACK')
        await pending
      }
    })
    it('holds the native login fence until intent commit then lets logout finish', async () => {
      const writer = await connect(), revoker = await connect(), release = deferred()
      loginTransactions.run = transactionFor(revoker)
      let ready = false
      const input = request()
      const pending = capture(preparePageStudioContentAttachment(input, { runTransaction: transactionFor(writer, async () => {
        ready = true
        await release.promise
      }) }))
      let logout: Promise<Outcome<void>> | undefined
      try {
        await expect.poll(() => ready, { timeout: 1500 }).toBe(true)
        logout = capture(revokePageStudioLoginSession(event(), role))
        await waitForBlock(revoker, writer)
        release.resolve()
        expect(await pending).toMatchObject({ ok: true })
        expect(await logout).toMatchObject({ ok: true })
        await expect(preparePageStudioContentAttachment(input, await options())).rejects.toMatchObject({ statusCode: 401 })
        expect(await intentCount()).toBe(1)
      } finally {
        release.resolve()
        await pending
        await logout
      }
    })
    it('checks wall-clock package expiry again after checkpoint I/O', async () => {
      // Short validity window set by the database; no frozen NOW() authority.
      await observer.query('UPDATE page_studio_entitlements SET effective_until=clock_timestamp()+INTERVAL \'0.3 seconds\'')
      beforeRead = async () => {
        await observer.query('SELECT pg_sleep(0.4)')
      }
      await expect(preparePageStudioContentAttachment(request(), await options())).rejects.toMatchObject({ statusCode: 403 })
      expect(await intentCount()).toBe(0)
    })
    it.each(role === 'agency'
      ? [
          'UPDATE team_members SET is_active=FALSE', 'UPDATE team_members SET user_role=\'viewer\'',
          'UPDATE team_members SET sessions_invalidated_at=clock_timestamp()', 'DELETE FROM role_permission_groups',
          'UPDATE custom_roles SET is_read_only=TRUE'
        ]
      : [
          'UPDATE client_users SET status=\'disabled\'', 'UPDATE client_users SET role=\'viewer\'',
          'UPDATE page_studio_site_memberships SET role=\'viewer\'', 'DELETE FROM page_studio_site_memberships',
          'UPDATE client_sessions SET expires_at=clock_timestamp()-INTERVAL \'1 second\'',
          'UPDATE page_studio_entitlements SET portal_creation_enabled=FALSE'
        ])('denies changed native ownership/permissions: %s', async (mutation) => {
      await observer.query(mutation)
      await expect(preparePageStudioContentAttachment(request(), await options())).rejects.toMatchObject({ statusCode: mutation.includes('client_sessions') ? 401 : 403 })
      expect(await intentCount()).toBe(0)
    })
  })
})
