import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  PageStudioBusinessContentSchema,
  type PageStudioContentScope
} from '~~/shared/pageStudio/businessContent'
import {
  CollectionRecordSchema,
  collectionCanonical,
  collectionDigest
} from '~~/shared/pageStudio/collectionApi'
import {
  CollectionDefinitionSchema,
  parseCollectionValues
} from '~~/shared/pageStudio/collectionDefinition'
import {
  CmsAdoptionIntentSchema,
  CmsAdoptionRecoverySchema,
  CmsApplicationManifestSchema,
  CmsFreezeReceiptSchema,
  CmsInventoryCursorSchema,
  CmsObjectPinSchema,
  BuilderArtifactPinSchema,
  contentScopeKey
} from '~~/shared/pageStudio/cmsManaged'
import type {
  CmsInventoryReadSchema,
  CmsAdoptionIntent,
  CmsObjectPin
} from '~~/shared/pageStudio/cmsManaged'
import { withCmsCommitAuthority } from './cmsCommitAuthority'
import type { PageStudioControlQueryClient } from './controlStore'
import { cmsEqual, cmsUnavailable } from './cmsVisibility'
import { PageStudioBusinessContentError } from './businessContent'

type Principal = Parameters<typeof withCmsCommitAuthority>[0]['principal']
type Transaction = NonNullable<Parameters<typeof withCmsCommitAuthority>[2]>['runTransaction']
type Dependencies = { runTransaction?: Transaction }
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const countsSchema = z.object({ content: count, record: count, schema: count }).strict()
const objectSchema = z
  .object({
    pin: CmsObjectPinSchema,
    body: z.unknown(),
    schema: CmsObjectPinSchema.nullable(),
    actorId: z.string().min(1).max(128),
    createdAt: z.iso.datetime(),
    head: z.boolean()
  })
  .strict()
type LegacyObject = z.infer<typeof objectSchema>
const pageSchema = z
  .object({
    counts: countsSchema,
    inventoryIdentity: z.string().regex(/^[a-f0-9]{64}$/),
    items: z.array(objectSchema).max(20),
    nextCursor: CmsInventoryCursorSchema.nullable(),
    pageDigest: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict()
const importSchema = z
  .object({
    intent: CmsAdoptionIntentSchema,
    freezeDigest: z.string().regex(/^[a-f0-9]{64}$/),
    cursor: CmsInventoryCursorSchema.nullable(),
    limit: z.number().int().min(1).max(20).default(20)
  })
  .strict()
const progressSchema = z
  .object({
    cursor: CmsInventoryCursorSchema.nullable(),
    consumed: countsSchema,
    done: z.boolean(),
    lastInput: CmsInventoryCursorSchema.nullable(),
    lastLimit: z.number().int(),
    lastDigest: z.string().nullable()
  })
  .strict()
type Progress = z.infer<typeof progressSchema>
const initialProgress: Progress = {
  cursor: null,
  consumed: { content: 0, record: 0, schema: 0 },
  done: false,
  lastInput: null,
  lastLimit: 0,
  lastDigest: null
}
interface AdoptionRow {
  adoption_recovery_id: string | null
  scope_key: string
  state: string
  adoption_id: string
  pending_generation: string
  active_generation: string | null
  target: unknown
  freeze_digest: string | null
  adoption_request: unknown
  adoption_digest: string
  inventory: unknown
  import_progress: unknown
  adoption_receipt: unknown
}
const frozenProofs = new WeakSet<object>()
function seal<T extends object>(value: T): T {
  const visit = (entry: unknown): void => {
    if (entry && typeof entry === 'object') {
      for (const child of Object.values(entry)) visit(child)
      Object.freeze(entry)
    }
  }
  visit(value)
  frozenProofs.add(value)
  return value
}
async function currentPrincipal(db: PageStudioControlQueryClient, principal: Principal) {
  if (principal.source === 'native-login') {
    const login = principal.request.login
    return {
      source: principal.source,
      nonce: null,
      actor: {
        kind: login.role === 'agency' ? 'agency-user' : 'client-user',
        userId: login.userId,
        loginSessionHash: login.tokenHash
      }
    }
  }
  const row = (
    await db.query<{ login_session_hash: string }>(
      'SELECT login_session_hash FROM page_studio_sessions WHERE nonce=$1',
      [principal.claims.nonce]
    )
  ).rows[0]
  if (!row) throw cmsUnavailable()
  return {
    source: principal.source,
    nonce: principal.claims.nonce,
    actor: {
      kind: principal.claims.role === 'agency' ? 'agency-user' : 'client-user',
      userId: principal.claims.userId,
      loginSessionHash: row.login_session_hash
    }
  }
}
async function actorCheck(
  db: PageStudioControlQueryClient,
  intent: CmsAdoptionIntent,
  principal: Principal
) {
  const current = await currentPrincipal(db, principal)
  const row = (
    await db.query<{ adoption_recovery_id: string | null }>(
      'SELECT adoption_recovery_id FROM page_studio_cms_scopes WHERE scope_key=$1',
      [contentScopeKey(intent.scope)]
    )
  ).rows[0]
  if (!row?.adoption_recovery_id) {
    if (!cmsEqual(current.actor, intent.actor))
      throw new Error('CMS adoption requires explicit recovery')
    return
  }
  const recovery = (
    await db.query<{ principal: unknown, adoption_digest: string }>(
      'SELECT principal,adoption_digest FROM page_studio_cms_adoption_recoveries WHERE scope_key=$1 AND recovery_id=$2 AND generation=$3',
      [contentScopeKey(intent.scope), row.adoption_recovery_id, intent.generation]
    )
  ).rows[0]
  if (
    !recovery
    || recovery.adoption_digest !== (await collectionDigest(intent))
    || !cmsEqual(recovery.principal, current)
  )
    throw new Error('CMS adoption recovery authority mismatch')
}
async function authorized<T>(
  intent: CmsAdoptionIntent,
  principal: Principal,
  deps: Dependencies,
  work: (db: PageStudioControlQueryClient) => Promise<T>
) {
  return await withCmsCommitAuthority(
    { scope: intent.scope, principal, mutation: 'collection-schema' },
    async (db) => {
      await actorCheck(db, intent, principal)
      return await work(db)
    },
    { runTransaction: deps.runTransaction }
  )
}
async function lock(db: PageStudioControlQueryClient, intent: CmsAdoptionIntent) {
  const row = (
    await db.query<AdoptionRow>(
      'SELECT * FROM page_studio_cms_scopes WHERE scope_key=$1 FOR UPDATE',
      [contentScopeKey(intent.scope)]
    )
  ).rows[0]
  if (
    !row
    || row.adoption_digest !== (await collectionDigest(intent))
    || !cmsEqual(row.adoption_request, intent)
    || !cmsEqual(row.target, intent.target)
    || row.pending_generation !== intent.generation
    || row.adoption_id !== intent.adoptionId
  )
    throw new Error('CMS adoption identity conflict')
  return row
}
function status(row: AdoptionRow) {
  return {
    state: row.state,
    adoptionId: row.adoption_id,
    generation: row.pending_generation,
    freezeDigest: row.freeze_digest,
    progress: row.import_progress,
    receipt: row.adoption_receipt,
    recoveryId: row.adoption_recovery_id
  }
}
async function currentCheckpoint(db: PageStudioControlQueryClient, intent: CmsAdoptionIntent) {
  const rows = (
    await db.query<{ id: string, digest: string }>(
      `SELECT c.id,c.digest FROM page_studio_sites s JOIN page_studio_checkpoints c ON c.id=s.current_checkpoint_id AND c.tenant_id=s.tenant_id AND c.client_id=s.client_id AND c.site_id=s.id WHERE s.tenant_id=$1 AND s.client_id=$2 AND s.id=$3`,
      [intent.scope.tenantId, intent.scope.clientId, intent.scope.siteId]
    )
  ).rows
  if (rows.length !== 1 || !cmsEqual(rows[0], intent.expectedCheckpoint))
    throw new Error('CMS adoption checkpoint is stale')
}
/** Record this intent BEFORE any remote freeze maintenance. Exact replay is authorized. */
export async function beginCmsAdoption(
  raw: unknown,
  principal: Principal,
  deps: Dependencies = {}
) {
  const intent = CmsAdoptionIntentSchema.parse(raw),
    digest = await collectionDigest(intent)
  return await authorized(intent, principal, deps, async (db) => {
    const found = (
      await db.query('SELECT scope_key FROM page_studio_cms_scopes WHERE scope_key=$1', [
        contentScopeKey(intent.scope)
      ])
    ).rows
    if (found.length) return status(await lock(db, intent))
    await currentCheckpoint(db, intent)
    const scope = intent.scope
    await db.query(
      `INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,adoption_id,pending_generation,target,adoption_request,adoption_digest) VALUES($1,$2,$3,$4,$5,$6,'freezing',$7,$8,$9,$10,$11)`,
      [
        contentScopeKey(scope),
        scope.tenantId,
        scope.clientId,
        scope.businessId,
        scope.siteId,
        scope.environment,
        intent.adoptionId,
        intent.generation,
        intent.target,
        intent,
        digest
      ]
    )
    return status(await lock(db, intent))
  }).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505'
      && 'constraint' in error && error.constraint === 'page_studio_cms_one_authoring_scope')
      throw new PageStudioBusinessContentError('CMS_AUTHORING_SCOPE_CONFLICT', 409,
        'This website already has an authoring environment. Continue there; published delivery does not require another authoring setup.')
    throw error
  })
}
/** Reader returns actual persisted freeze bytes from the verified private binding. */
export async function registerCmsFreeze(
  raw: unknown,
  principal: Principal,
  deps: Dependencies & { readFreeze: (intent: CmsAdoptionIntent) => Promise<unknown> }
) {
  const intent = CmsAdoptionIntentSchema.parse(raw)
  const freeze = CmsFreezeReceiptSchema.parse(await deps.readFreeze(intent))
  const { digest, ...body } = freeze
  if (
    (await collectionDigest(body)) !== digest
    || !cmsEqual(freeze.request, {
      formatVersion: 1,
      scope: intent.scope,
      actor: intent.actor,
      target: intent.target,
      adoptionId: intent.adoptionId
    })
  )
    throw new Error('CMS freeze proof mismatch')
  seal(freeze)
  return await authorized(intent, principal, deps, async (db) => {
    const row = await lock(db, intent)
    if (row.freeze_digest) {
      if (row.freeze_digest !== digest) throw new Error('CMS freeze replay conflict')
      return status(row)
    }
    if (row.state !== 'freezing') throw cmsUnavailable()
    await db.query(
      `UPDATE page_studio_cms_scopes SET state='importing',freeze_digest=$2,import_progress=$3 WHERE scope_key=$1`,
      [row.scope_key, digest, initialProgress]
    )
    return status(await lock(db, intent))
  })
}
function compare(
  a: { kind: string, collectionId?: string, recordId?: string, version: number },
  b: { kind: string, collectionId?: string, recordId?: string, version: number }
) {
  for (const key of ['kind', 'collectionId', 'recordId'] as const) {
    if (a[key] !== b[key]) return (a[key] ?? '') < (b[key] ?? '') ? -1 : 1
  }
  return a.version - b.version
}
async function verifyObject(input: LegacyObject, intent: CmsAdoptionIntent, freezeDigest: string) {
  const pin = input.pin
  if (
    pin.origin !== 'legacy'
    || pin.operationId !== intent.adoptionId
    || pin.freezeDigest !== freezeDigest
  )
    throw new Error('CMS inventory storage identity mismatch')
  const body
    = pin.kind === 'content'
      ? PageStudioBusinessContentSchema.parse(input.body)
      : pin.kind === 'schema'
        ? CollectionDefinitionSchema.parse(input.body)
        : CollectionRecordSchema.parse(input.body)
  if (
    contentScopeKey(body.scope) !== contentScopeKey(intent.scope)
    || (await collectionDigest(body)) !== pin.sha256
    || new TextEncoder().encode(collectionCanonical(body)).byteLength !== pin.bytes
  )
    throw new Error('CMS inventory body digest mismatch')
  if (pin.kind === 'schema') {
    const schema = CollectionDefinitionSchema.parse(body)
    if (schema.id !== pin.collectionId || schema.version !== pin.version) throw cmsUnavailable()
  } else if (pin.kind === 'record') {
    const record = CollectionRecordSchema.parse(body),
      schema = input.schema
    if (
      record.id !== pin.recordId
      || record.collectionId !== pin.collectionId
      || record.revision !== pin.version
      || !schema
      || schema.kind !== 'schema'
      || schema.collectionId !== record.collectionId
      || schema.version !== record.schemaVersion
      || schema.freezeDigest !== freezeDigest
      || schema.origin !== 'legacy'
      || schema.operationId !== intent.adoptionId
    )
      throw cmsUnavailable()
  }
  if (pin.kind !== 'record' && input.schema !== null) throw cmsUnavailable()
  return { ...input, body }
}
export interface CmsInventoryReaders {
  readPage: (
    request: z.infer<typeof CmsInventoryReadSchema> & { target: CmsAdoptionIntent['target'] }
  ) => Promise<unknown>
  readSchemas: (request: {
    scope: PageStudioContentScope
    target: CmsAdoptionIntent['target']
    pins: CmsObjectPin[]
  }) => Promise<unknown>
}
async function verifyPage(input: z.infer<typeof importSchema>, readers: CmsInventoryReaders) {
  const { intent, freezeDigest, cursor, limit } = input
  if (cursor && cursor.freezeDigest !== freezeDigest) throw cmsUnavailable()
  const page = pageSchema.parse(
    await readers.readPage({
      scope: intent.scope,
      adoptionId: intent.adoptionId,
      freezeDigest,
      cursor,
      limit,
      target: intent.target
    })
  )
  if (
    page.items.length > limit
    || new TextEncoder().encode(collectionCanonical(page.items)).byteLength > 1_048_576
    || page.inventoryIdentity
    !== (await collectionDigest({ counts: page.counts, formatVersion: 1, freezeDigest }))
  )
    throw new Error('CMS inventory identity or bound mismatch')
  let previous = cursor
  for (const item of page.items) {
    await verifyObject(item, intent, freezeDigest)
    if (previous && compare(item.pin, previous) <= 0)
      throw new Error('CMS inventory order mismatch')
    previous = {
      formatVersion: 1,
      freezeDigest,
      kind: item.pin.kind,
      collectionId: item.pin.collectionId,
      recordId: item.pin.recordId,
      version: item.pin.version
    }
  }
  if (page.nextCursor && (!previous || !page.items.length || !cmsEqual(previous, page.nextCursor)))
    throw new Error('CMS inventory continuation mismatch')
  if (
    page.pageDigest
    !== (await collectionDigest({
      cursor,
      formatVersion: 1,
      inventoryIdentity: page.inventoryIdentity,
      items: page.items.map(({ body: _body, ...metadata }) => metadata),
      limit,
      nextCursor: page.nextCursor
    }))
  )
    throw new Error('CMS inventory page digest mismatch')
  const pins = [
    ...new Map(
      page.items
        .filter(item => item.schema)
        .map(item => [collectionCanonical(item.schema), item.schema!])
    ).values()
  ]
  const schemas = pins.length
    ? z
        .array(objectSchema)
        .max(20)
        .parse(await readers.readSchemas({ scope: intent.scope, target: intent.target, pins }))
    : []
  if (
    schemas.length !== pins.length
    || new Set(schemas.map(item => collectionCanonical(item.pin))).size !== schemas.length
  )
    throw new Error('CMS schema dependency mismatch')
  for (const item of schemas) {
    await verifyObject(item, intent, freezeDigest)
    if (item.pin.kind !== 'schema' || !pins.some(pin => cmsEqual(pin, item.pin)))
      throw new Error('CMS schema dependency mismatch')
  }
  for (const item of page.items)
    if (item.schema) {
      const schema = schemas.find(value => cmsEqual(value.pin, item.schema))
      if (!schema) throw cmsUnavailable()
      parseCollectionValues(schema.body, CollectionRecordSchema.parse(item.body).values)
    }
  return seal({ page, schemas })
}
async function insertBaseline(
  db: PageStudioControlQueryClient,
  intent: CmsAdoptionIntent,
  item: LegacyObject
) {
  const pin = item.pin
  let schemaId: string | null = null
  if (item.schema) {
    const rows = (
      await db.query<{ id: string }>(
        'SELECT id FROM page_studio_cms_objects WHERE scope_key=$1 AND generation=$2 AND kind=\'schema\' AND storage_pin=$3::jsonb',
        [contentScopeKey(intent.scope), intent.generation, item.schema]
      )
    ).rows
    if (rows.length !== 1) throw cmsUnavailable()
    schemaId = rows[0]!.id
  }
  const archived = pin.kind === 'record' ? CollectionRecordSchema.parse(item.body).archived : null
  const params = [
    contentScopeKey(intent.scope),
    intent.generation,
    pin.kind,
    pin.collectionId,
    pin.recordId,
    pin.version
  ]
  const existing = (
    await db.query<{
      id: string
      storage_pin: unknown
      schema_object_id: string | null
      archived: boolean | null
      actor_id: string
      created_at: Date
      baseline_head: boolean
      adoption_id: string
    }>(
      `SELECT * FROM page_studio_cms_objects WHERE scope_key=$1 AND generation=$2 AND kind=$3 AND collection_id=$4 AND record_id=$5 AND logical_version=$6`,
      params
    )
  ).rows
  if (existing.length) {
    const row = existing[0]!
    if (
      !cmsEqual(row.storage_pin, pin)
      || row.schema_object_id !== schemaId
      || row.archived !== archived
      || row.actor_id !== item.actorId
      || new Date(row.created_at).toISOString() !== item.createdAt
      || row.baseline_head !== item.head
      || row.adoption_id !== intent.adoptionId
    )
      throw new Error('CMS imported identity conflict')
    return row.id
  }
  const id = randomUUID()
  await db.query(
    `INSERT INTO page_studio_cms_objects(scope_key,generation,kind,collection_id,record_id,logical_version,id,storage_pin,schema_object_id,archived,actor_id,created_at,baseline_head,adoption_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      ...params,
      id,
      pin,
      schemaId,
      archived,
      item.actorId,
      item.createdAt,
      item.head,
      intent.adoptionId
    ]
  )
  return id
}
export async function importFrozenCmsPage(
  raw: unknown,
  principal: Principal,
  deps: Dependencies & CmsInventoryReaders
) {
  const input = importSchema.parse(raw),
    { intent } = input
  const proof = await verifyPage(input, deps)
  return await authorized(intent, principal, deps, async (db) => {
    const row = await lock(db, intent)
    if (row.freeze_digest !== input.freezeDigest) throw new Error('CMS import freeze conflict')
    const progress = progressSchema.parse(row.import_progress)
    const inventory = { counts: proof.page.counts, inventoryIdentity: proof.page.inventoryIdentity }
    if (row.inventory && !cmsEqual(row.inventory, inventory))
      throw new Error('CMS inventory count conflict')
    if (
      progress.lastDigest === proof.page.pageDigest
      && cmsEqual(progress.lastInput, input.cursor)
      && progress.lastLimit === input.limit
    )
      return progress
    if (row.state !== 'importing' || progress.done || !cmsEqual(progress.cursor, input.cursor))
      throw new Error('CMS import cursor conflict')
    if (!frozenProofs.has(proof)) throw cmsUnavailable()
    for (const schema of proof.schemas) await insertBaseline(db, intent, schema)
    for (const item of proof.page.items) await insertBaseline(db, intent, item)
    const consumed = { ...progress.consumed }
    for (const item of proof.page.items) consumed[item.pin.kind] += 1
    if (
      Object.keys(consumed).some(
        kind =>
          consumed[kind as keyof typeof consumed] > proof.page.counts[kind as keyof typeof consumed]
      )
    )
      throw new Error('CMS inventory count exceeded')
    const next: Progress = {
      cursor: proof.page.nextCursor,
      consumed,
      done: proof.page.nextCursor === null,
      lastInput: input.cursor,
      lastLimit: input.limit,
      lastDigest: proof.page.pageDigest
    }
    if (next.done && !cmsEqual(consumed, proof.page.counts))
      throw new Error('CMS inventory incomplete')
    await db.query(
      'UPDATE page_studio_cms_scopes SET inventory=$2,import_progress=$3 WHERE scope_key=$1',
      [row.scope_key, inventory, next]
    )
    return next
  })
}

const legacyLibrary = z
  .object({
    scope: CmsAdoptionIntentSchema.shape.scope,
    components: z.array(BuilderArtifactPinSchema.extend({ kind: z.literal('component') })).max(128)
  })
  .strict()
const legacyManifest = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    id: z.string(),
    name: z.string(),
    defaultLocale: z.string(),
    pages: z.array(z.unknown()).min(1).max(200),
    theme: z.unknown(),
    integrations: z.unknown().optional(),
    builderLibrary: legacyLibrary.optional(),
    contentBinding: z.unknown().optional(),
    redirects: z.array(z.unknown()).max(500).optional(),
    seo: z.unknown().optional(),
    shell: z.unknown().optional()
  })
  .strict()
const legacyComponent = z
  .object({
    formatVersion: z.literal(1),
    id: z.string(),
    version: z.number().int().positive(),
    kind: z.literal('component'),
    scope: CmsAdoptionIntentSchema.shape.scope,
    label: z.string(),
    actions: z.array(z.unknown()).max(0),
    dataBindings: z.array(z.unknown()).max(0),
    recordBindings: z.array(z.unknown()).max(0).optional(),
    defaults: z.record(z.string(), z.unknown()),
    properties: z.array(z.unknown()).max(30),
    propertyBindings: z.array(z.unknown()).max(100),
    root: z.unknown()
  })
  .strict()
export interface CmsAdoptionGraphReaders {
  /** Use loadPageStudioCheckpoint against its authorized native object pointer. */
  readCheckpoint: (intent: CmsAdoptionIntent) => Promise<unknown>
  /** Fetch exact canonical immutable artifacts from the owned scoped R2 binding. */
  readComponent: (
    scope: PageStudioContentScope,
    pin: z.infer<typeof BuilderArtifactPinSchema>
  ) => Promise<unknown>
}
async function verifyLegacyGraph(intent: CmsAdoptionIntent, readers: CmsAdoptionGraphReaders) {
  const checkpoint = z
    .object({ checkpointId: z.string(), digest: z.string(), manifest: z.unknown() })
    .strict()
    .parse(await readers.readCheckpoint(intent))
  if (new TextEncoder().encode(collectionCanonical(checkpoint)).byteLength > 8 * 1024 * 1024)
    throw new Error('CMS checkpoint exceeds bound')
  const manifest = legacyManifest.parse(checkpoint.manifest)
  if (
    checkpoint.checkpointId !== intent.expectedCheckpoint.id
    || checkpoint.digest !== intent.expectedCheckpoint.digest
    || (await collectionDigest(checkpoint.manifest)) !== checkpoint.digest
    || manifest.id !== intent.scope.siteId
  )
    throw new Error('CMS checkpoint graph identity mismatch')
  if (
    manifest.schemaVersion === 1
    && (manifest.builderLibrary
      || manifest.contentBinding
      || manifest.redirects
      || manifest.seo
      || manifest.shell)
  )
    throw new Error('Unsupported legacy checkpoint graph')
  if (manifest.schemaVersion === 2 && (!manifest.redirects || !manifest.seo || !manifest.shell))
    throw new Error('Incomplete legacy checkpoint graph')
  if (
    manifest.builderLibrary
    && contentScopeKey(manifest.builderLibrary.scope) !== contentScopeKey(intent.scope)
  )
    throw cmsUnavailable()
  const components = manifest.builderLibrary?.components ?? []
  if (new Set(components.map(pin => pin.id)).size !== components.length)
    throw new Error('Duplicate checkpoint component identity')
  let total = 0
  for (const pin of components) {
    const artifact = legacyComponent.parse(await readers.readComponent(intent.scope, pin))
    total += new TextEncoder().encode(collectionCanonical(artifact)).byteLength
    if (
      total > 2_000_000
      || artifact.id !== pin.id
      || artifact.version !== pin.version
      || contentScopeKey(artifact.scope) !== contentScopeKey(intent.scope)
      || (await collectionDigest(artifact)) !== pin.sha256
    )
      throw new Error('CMS legacy component graph proof mismatch')
  }
  // Empty actions are proven by the supported legacy manifest and each complete
  // immutable artifact, not supplied by a caller or inferred from a partial list.
  return seal({ checkpoint: intent.expectedCheckpoint, components, actions: [] })
}
const principalSchema = z
  .object({
    source: z.enum(['native-login', 'studio-session']),
    nonce: z.string().nullable(),
    actor: CmsAdoptionIntentSchema.shape.actor
  })
  .strict()
const adoptionReceiptSchema = z
  .object({
    formatVersion: z.literal(1),
    state: z.literal('managed'),
    activatedBy: principalSchema,
    scope: CmsAdoptionIntentSchema.shape.scope,
    adoptionId: z.string(),
    generation: z.uuid(),
    freezeDigest: z.string(),
    inventoryIdentity: z.string(),
    counts: countsSchema,
    application: z.object({ id: z.uuid(), digest: z.string() }).strict(),
    checkpoint: CmsAdoptionIntentSchema.shape.expectedCheckpoint,
    createdAt: z.iso.datetime(),
    digest: z.string()
  })
  .strict()
/** Existing independent-component legacy graphs only; full feature approval is
 * deliberately separate. Graph/body storage I/O completes before native locks. */
export async function activateCmsAdoption(
  raw: unknown,
  principal: Principal,
  deps: Dependencies & CmsAdoptionGraphReaders
) {
  const intent = CmsAdoptionIntentSchema.parse(raw),
    graph = await verifyLegacyGraph(intent, deps)
  return await authorized(intent, principal, deps, async (db) => {
    const row = await lock(db, intent)
    if (row.adoption_receipt) {
      const receipt = adoptionReceiptSchema.parse(row.adoption_receipt),
        { digest, ...body } = receipt
      if (
        (await collectionDigest(body)) !== digest
        || receipt.adoptionId !== intent.adoptionId
        || receipt.generation !== intent.generation
        || receipt.freezeDigest !== row.freeze_digest
        || !cmsEqual(receipt.scope, intent.scope)
        || !cmsEqual(receipt.checkpoint, intent.expectedCheckpoint)
      )
        throw cmsUnavailable()
      return receipt
    }
    if (row.state !== 'importing' || !row.freeze_digest || !frozenProofs.has(graph))
      throw cmsUnavailable()
    const progress = progressSchema.parse(row.import_progress)
    const inventory = z
      .object({ counts: countsSchema, inventoryIdentity: z.string() })
      .strict()
      .parse(row.inventory)
    if (
      !progress.done
      || progress.cursor !== null
      || !cmsEqual(progress.consumed, inventory.counts)
      || inventory.inventoryIdentity
      !== (await collectionDigest({
        counts: inventory.counts,
        formatVersion: 1,
        freezeDigest: row.freeze_digest
      }))
    )
      throw new Error('CMS frozen inventory incomplete')
    await currentCheckpoint(db, intent)
    const actual = (
      await db.query<{ content: number, record: number, schema: number }>(
        `SELECT COUNT(*) FILTER(WHERE kind='content')::int AS content,COUNT(*) FILTER(WHERE kind='record')::int AS record,COUNT(*) FILTER(WHERE kind='schema')::int AS schema FROM page_studio_cms_objects WHERE scope_key=$1 AND generation=$2`,
        [row.scope_key, intent.generation]
      )
    ).rows[0]
    if (!cmsEqual(actual, inventory.counts)) throw new Error('CMS imported count mismatch')
    const invalid = (
      await db.query(
        `SELECT 1 FROM page_studio_cms_objects WHERE scope_key=$1 AND generation=$2 GROUP BY kind,collection_id,record_id HAVING COUNT(*) FILTER(WHERE baseline_head)=0 OR COUNT(*) FILTER(WHERE baseline_head)>1 OR COUNT(*) FILTER(WHERE baseline_head IS NULL)>0
 UNION ALL SELECT 1 FROM page_studio_cms_objects h WHERE h.scope_key=$1 AND h.generation=$2 AND h.baseline_head AND EXISTS(SELECT 1 FROM page_studio_cms_objects later WHERE later.scope_key=h.scope_key AND later.generation=h.generation AND later.kind=h.kind AND later.collection_id=h.collection_id AND later.record_id=h.record_id AND later.logical_version>h.logical_version) LIMIT 1`,
        [row.scope_key, intent.generation]
      )
    ).rows
    if (invalid.length) throw new Error('CMS frozen head proof incomplete')
    const heads = (
      await db.query<{ id: string, kind: string, collection_id: string, record_id: string }>(
        `SELECT id,kind,collection_id,record_id FROM page_studio_cms_objects WHERE scope_key=$1 AND generation=$2 AND baseline_head AND kind IN ('content','schema') ORDER BY kind,collection_id,record_id LIMIT 130`,
        [row.scope_key, intent.generation]
      )
    ).rows
    const applicationId = randomUUID()
    const manifest = CmsApplicationManifestSchema.parse({
      formatVersion: 1,
      scope: intent.scope,
      generation: intent.generation,
      applicationId,
      checkpoint: graph.checkpoint,
      schemas: heads
        .filter(head => head.kind === 'schema')
        .map(head => ({ collectionId: head.collection_id, objectId: head.id })),
      components: graph.components,
      actions: graph.actions,
      previousApplicationId: null
    })
    const applicationDigest = await collectionDigest(manifest)
    await db.query(
      `INSERT INTO page_studio_application_versions(scope_key,generation,id,digest,manifest,adoption_id) VALUES($1,$2,$3,$4,$5,$6)`,
      [
        row.scope_key,
        intent.generation,
        applicationId,
        applicationDigest,
        manifest,
        intent.adoptionId
      ]
    )
    // Bulk SQL copies verified designated heads; bounded JSON contains schemas only.
    await db.query(
      `INSERT INTO page_studio_cms_record_heads(scope_key,generation,collection_id,record_id,object_id) SELECT scope_key,generation,collection_id,record_id,id FROM page_studio_cms_objects WHERE scope_key=$1 AND generation=$2 AND kind='record' AND baseline_head`,
      [row.scope_key, intent.generation]
    )
    await db.query(
      `INSERT INTO page_studio_cms_application_schemas(scope_key,generation,application_id,collection_id,object_id) SELECT scope_key,generation,$3,collection_id,id FROM page_studio_cms_objects WHERE scope_key=$1 AND generation=$2 AND kind='schema' AND baseline_head`,
      [row.scope_key, intent.generation, applicationId]
    )
    const activatedBy = await currentPrincipal(db, principal)
    const body = {
      activatedBy,
      formatVersion: 1,
      state: 'managed',
      scope: intent.scope,
      adoptionId: intent.adoptionId,
      generation: intent.generation,
      freezeDigest: row.freeze_digest,
      inventoryIdentity: inventory.inventoryIdentity,
      counts: inventory.counts,
      application: { id: applicationId, digest: applicationDigest },
      checkpoint: intent.expectedCheckpoint,
      createdAt: new Date().toISOString()
    }
    const receipt = adoptionReceiptSchema.parse({ ...body, digest: await collectionDigest(body) })
    await db.query(
      `INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,'cms.adopt','cms-adoption',$6,$7,$8)`,
      [
        intent.scope.tenantId,
        intent.scope.clientId,
        intent.scope.siteId,
        activatedBy.actor.userId,
        activatedBy.actor.kind === 'agency-user' ? 'agency' : 'client',
        intent.adoptionId,
        `cms-adopt:${intent.scope.environment}:${intent.adoptionId}`,
        receipt
      ]
    )
    await db.query(
      `UPDATE page_studio_cms_scopes SET state='managed',active_generation=$2,current_application_id=$3,current_content_id=$4,adoption_receipt=$5 WHERE scope_key=$1`,
      [
        row.scope_key,
        intent.generation,
        applicationId,
        heads.find(head => head.kind === 'content')?.id ?? null,
        receipt
      ]
    )
    return receipt
  })
}

const recoveryReceiptSchema = z
  .object({
    formatVersion: z.literal(1),
    scope: CmsAdoptionIntentSchema.shape.scope,
    adoptionId: z.string(),
    generation: z.uuid(),
    recoveryId: z.string(),
    adoptionDigest: z.string(),
    requestDigest: z.string(),
    principal: principalSchema,
    previousRecoveryId: z.string().nullable(),
    createdAt: z.iso.datetime()
  })
  .strict()
/** Explicit fresh-authority takeover. Original actor/freeze/target/generation are
 * retained, never impersonated. Old recovery replay does not rewind this fence. */
export async function recoverCmsAdoption(
  raw: unknown,
  principal: Principal,
  deps: Dependencies = {}
) {
  const input = CmsAdoptionRecoverySchema.parse(raw),
    intent = input.intent
  if (input.expectedAdoptionDigest !== (await collectionDigest(intent)))
    throw new Error('CMS recovery adoption digest mismatch')
  return await withCmsCommitAuthority(
    { scope: intent.scope, principal, mutation: 'collection-schema' },
    async (db) => {
      const current = await currentPrincipal(db, principal)
      if (!cmsEqual(input.actor, current.actor)) throw new Error('CMS recovery actor mismatch')
      const row = await lock(db, intent)
      const bound = { input, principal: current },
        requestDigest = await collectionDigest(bound)
      const prior = (
        await db.query<{ request_digest: string, request: unknown, receipt: unknown }>(
          'SELECT request_digest,request,receipt FROM page_studio_cms_adoption_recoveries WHERE scope_key=$1 AND recovery_id=$2',
          [row.scope_key, input.recoveryId]
        )
      ).rows[0]
      if (prior) {
        if (prior.request_digest !== requestDigest || !cmsEqual(prior.request, bound))
          throw new Error('CMS recovery replay conflict')
        const receipt = recoveryReceiptSchema.parse(prior.receipt)
        if (
          receipt.requestDigest !== requestDigest
          || receipt.adoptionDigest !== input.expectedAdoptionDigest
          || receipt.recoveryId !== input.recoveryId
          || receipt.adoptionId !== intent.adoptionId
          || receipt.generation !== intent.generation
          || !cmsEqual(receipt.scope, intent.scope)
          || !cmsEqual(receipt.principal, current)
          || receipt.previousRecoveryId !== input.expectedRecoveryId
        )
          throw new Error('CMS recovery receipt conflict')
        return { receipt, current: row.adoption_recovery_id === input.recoveryId }
      }
      if (
        row.adoption_recovery_id !== input.expectedRecoveryId
        || !['freezing', 'importing', 'managed'].includes(row.state)
      )
        throw new Error('CMS recovery predecessor conflict')
      const auditId = randomUUID()
      const receipt = recoveryReceiptSchema.parse({
        formatVersion: 1,
        scope: intent.scope,
        adoptionId: intent.adoptionId,
        generation: intent.generation,
        recoveryId: input.recoveryId,
        adoptionDigest: input.expectedAdoptionDigest,
        requestDigest,
        principal: current,
        previousRecoveryId: input.expectedRecoveryId,
        createdAt: new Date().toISOString()
      })
      await db.query(
        `INSERT INTO page_studio_audit_events(id,tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,$6,'cms.adoption.recover','cms-adoption',$7,$8,$9)`,
        [
          auditId,
          intent.scope.tenantId,
          intent.scope.clientId,
          intent.scope.siteId,
          current.actor.userId,
          current.actor.kind === 'agency-user' ? 'agency' : 'client',
          intent.adoptionId,
          `cms-recover:${intent.scope.environment}:${input.recoveryId}`,
          receipt
        ]
      )
      await db.query(
        `INSERT INTO page_studio_cms_adoption_recoveries(scope_key,generation,recovery_id,tenant_id,client_id,site_id,adoption_digest,request_digest,request,principal,receipt,audit_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          row.scope_key,
          intent.generation,
          input.recoveryId,
          intent.scope.tenantId,
          intent.scope.clientId,
          intent.scope.siteId,
          input.expectedAdoptionDigest,
          requestDigest,
          bound,
          current,
          receipt,
          auditId
        ]
      )
      await db.query(
        'UPDATE page_studio_cms_scopes SET adoption_recovery_id=$2 WHERE scope_key=$1',
        [row.scope_key, input.recoveryId]
      )
      return { receipt, current: true }
    },
    { runTransaction: deps.runTransaction }
  )
}

/** Internal orchestration discovery under CURRENT schema authority. This permits
 * a fresh login to see redacted progress and request explicit recovery; it never
 * grants that principal permission to advance the original actor's operation. */
export async function readCmsAdoptionControl(
  scope: PageStudioContentScope,
  principal: Principal,
  deps: Dependencies = {}
) {
  return await withCmsCommitAuthority(
    { scope, principal, mutation: 'collection-schema' },
    async (db) => {
      const current = await currentPrincipal(db, principal)
      const row = (
        await db.query<AdoptionRow>(
          'SELECT * FROM page_studio_cms_scopes WHERE scope_key=$1 FOR UPDATE',
          [contentScopeKey(scope)]
        )
      ).rows[0]
      const checkpoint
        = (
          await db.query<{ id: string, digest: string, object_key: string }>(
            `SELECT c.id,c.digest,c.object_key FROM page_studio_sites s JOIN page_studio_checkpoints c ON c.tenant_id=s.tenant_id AND c.client_id=s.client_id AND c.site_id=s.id AND c.id=s.current_checkpoint_id WHERE s.tenant_id=$1 AND s.client_id=$2 AND s.id=$3`,
            [scope.tenantId, scope.clientId, scope.siteId]
          )
        ).rows[0] ?? null
      if (!row) return { current, checkpoint, adoption: null }
      const intent = CmsAdoptionIntentSchema.parse(row.adoption_request)
      if (contentScopeKey(intent.scope) !== contentScopeKey(scope)) throw cmsUnavailable()
      await lock(db, intent)
      let canAdvance = true
      try {
        await actorCheck(db, intent, principal)
      } catch (error) {
        if (
          !(error instanceof Error)
          || ![
            'CMS adoption requires explicit recovery',
            'CMS adoption recovery authority mismatch'
          ].includes(error.message)
        )
          throw error
        canAdvance = false
      }
      const receipt
        = row.adoption_receipt === null ? null : adoptionReceiptSchema.parse(row.adoption_receipt)
      if (receipt) {
        const { digest, ...body } = receipt
        if (
          (await collectionDigest(body)) !== digest
          || receipt.adoptionId !== intent.adoptionId
          || receipt.generation !== intent.generation
          || receipt.freezeDigest !== row.freeze_digest
          || contentScopeKey(receipt.scope) !== contentScopeKey(scope)
          || !cmsEqual(receipt.checkpoint, intent.expectedCheckpoint)
        )
          throw cmsUnavailable()
      }
      return {
        current,
        checkpoint,
        adoption: {
          intent,
          digest: row.adoption_digest,
          state: row.state,
          freezeDigest: row.freeze_digest,
          progress: row.import_progress === null ? null : progressSchema.parse(row.import_progress),
          recoveryId: row.adoption_recovery_id,
          receipt,
          canAdvance
        }
      }
    },
    { runTransaction: deps.runTransaction }
  )
}
