import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import {
  CollectionDefinitionSchema,
  parseCollectionValues
} from '~~/shared/pageStudio/collectionDefinition'
import {
  CmsFreezeReceiptSchema,
  CmsNativeCommitSchema,
  CmsPreparationSchema,
  CmsPreparationReceiptSchema,
  CmsObjectPinSchema,
  cmsItemIdentity,
  cmsPreparationActorId,
  contentScopeKey,
  type CmsNativeCommit,
  type CmsObjectPin
} from '~~/shared/pageStudio/cmsManaged'
import { withCmsCommitAuthority } from './cmsCommitAuthority'
import type { PageStudioControlQueryClient } from './controlStore'
import {
  cmsEqual,
  cmsUnavailable,
  decodeCmsObject,
  lockCmsContext,
  readAcceptedCmsObject
} from './cmsVisibility'

type Principal = Parameters<typeof withCmsCommitAuthority>[0]['principal']
type RunTransaction = NonNullable<Parameters<typeof withCmsCommitAuthority>[2]>['runTransaction']
const proofSchema = z
  .object({
    freeze: CmsFreezeReceiptSchema,
    request: CmsPreparationSchema,
    receipt: CmsPreparationReceiptSchema,
    schemas: z
      .array(z.object({ pin: CmsObjectPinSchema, definition: CollectionDefinitionSchema }).strict())
      .max(32)
  })
  .strict()
type VerifiedPreparation = z.infer<typeof proofSchema>
const verifiedPreparations = new WeakSet<VerifiedPreparation>()
const verifiedCommitInputs = new WeakMap<VerifiedPreparation, string>()
/** Trusted private D1 adapter, never a client callback or an approval oracle.
 * Implementations must call exact readOperation and readObjects on its pinned
 * physical binding. Returned bytes are independently verified before any lock. */
export interface CmsPreparationReader {
  (input: {
    scope: CmsNativeCommit['scope']
    operationId: string
    requestDigest: string
    receiptDigest: string
    target: CmsNativeCommit['target']
  }): Promise<unknown>
}
export async function verifyCmsPreparation(input: CmsNativeCommit, reader: CmsPreparationReader) {
  const proof = proofSchema.parse(
    await reader({
      scope: input.scope,
      operationId: input.operationId,
      requestDigest: input.preparedRequestDigest,
      receiptDigest: input.preparedDigest,
      target: input.target
    })
  )
  const { digest: freezeDigest, ...freezeBody } = proof.freeze
  const { digest: receiptDigest, ...receiptBody } = proof.receipt
  const request = proof.request
  if (
    contentScopeKey(request.scope) !== contentScopeKey(input.scope)
    || contentScopeKey(proof.freeze.request.scope) !== contentScopeKey(input.scope)
    || contentScopeKey(proof.receipt.scope) !== contentScopeKey(input.scope)
    || !cmsEqual(proof.freeze.request.target, input.target)
    || freezeDigest !== input.freezeDigest
    || (await collectionDigest(freezeBody)) !== freezeDigest
    || request.freezeDigest !== freezeDigest
    || proof.receipt.freezeDigest !== freezeDigest
    || request.operationId !== input.operationId
    || proof.receipt.operationId !== input.operationId
    || proof.receipt.requestDigest !== input.preparedRequestDigest
    || (await collectionDigest(request)) !== input.preparedRequestDigest
    || receiptDigest !== input.preparedDigest
    || (await collectionDigest(receiptBody)) !== receiptDigest
  )
    throw cmsUnavailable()
  const pins = await Promise.all(
    request.items.map(async item =>
      CmsObjectPinSchema.parse({
        ...cmsItemIdentity(item),
        origin: 'prepared',
        operationId: request.operationId,
        freezeDigest,
        sha256: await collectionDigest(item.body),
        bytes: new TextEncoder().encode(collectionCanonical(item.body)).byteLength
      })
    )
  )
  if (!cmsEqual(pins, proof.receipt.items)) throw cmsUnavailable()
  const schemas = new Map<string, unknown>()
  for (const schema of proof.schemas) {
    const pin = schema.pin
    if (
      pin.kind !== 'schema'
      || pin.freezeDigest !== freezeDigest
      || pin.collectionId !== schema.definition.id
      || pin.version !== schema.definition.version
      || contentScopeKey(schema.definition.scope) !== contentScopeKey(input.scope)
      || pin.sha256 !== (await collectionDigest(schema.definition))
      || pin.bytes !== new TextEncoder().encode(collectionCanonical(schema.definition)).byteLength
      || schemas.has(collectionCanonical(pin))
    )
      throw cmsUnavailable()
    schemas.set(collectionCanonical(pin), schema.definition)
  }
  for (const item of request.items)
    if (item.kind === 'record') {
      const definition = schemas.get(collectionCanonical(item.schema))
      if (!definition) throw cmsUnavailable()
      parseCollectionValues(definition, item.body.values)
    }
  const freezeValue = (value: unknown): void => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freezeValue(child)
      Object.freeze(value)
    }
  }
  freezeValue(proof)
  verifiedPreparations.add(proof)
  verifiedCommitInputs.set(proof, collectionCanonical(input))
  return proof
}
function principalIdentity(principal: Principal, actor: VerifiedPreparation['request']['actor']) {
  if (actor.kind === 'published-form') throw cmsUnavailable()
  if (principal.source === 'native-login') {
    const login = principal.request.login
    if (
      actor.userId !== login.userId
      || actor.loginSessionHash !== login.tokenHash
      || actor.kind !== (login.role === 'agency' ? 'agency-user' : 'client-user')
    )
      throw cmsUnavailable()
    return { source: principal.source, actor }
  }
  if (
    actor.userId !== principal.claims.userId
    || actor.kind !== (principal.claims.role === 'agency' ? 'agency-user' : 'client-user')
  )
    throw cmsUnavailable()
  return { source: principal.source, actor, nonce: principal.claims.nonce }
}
async function checkChild(
  db: PageStudioControlQueryClient,
  principal: Principal,
  proof: VerifiedPreparation
) {
  if (proof.request.actor.kind === 'published-form') throw cmsUnavailable()
  if (principal.source !== 'studio-session') return
  const rows = (
    await db.query(
      `SELECT nonce FROM page_studio_sessions WHERE nonce=$1 AND login_session_hash=$2`,
      [principal.claims.nonce, proof.request.actor.loginSessionHash]
    )
  ).rows
  if (rows.length !== 1) throw cmsUnavailable()
}
async function checkpoint(db: PageStudioControlQueryClient, input: CmsNativeCommit) {
  const rows = (
    await db.query<{ id: string, digest: string }>(
      `SELECT c.id,c.digest FROM page_studio_sites s JOIN page_studio_checkpoints c ON c.id=s.current_checkpoint_id AND c.tenant_id=s.tenant_id AND c.client_id=s.client_id AND c.site_id=s.id WHERE s.tenant_id=$1 AND s.client_id=$2 AND s.id=$3`,
      [input.scope.tenantId, input.scope.clientId, input.scope.siteId]
    )
  ).rows
  return rows[0] ?? null
}
async function currentObject(
  db: PageStudioControlQueryClient,
  context: Awaited<ReturnType<typeof lockCmsContext>>,
  kind: 'record' | 'content',
  collectionId = '',
  recordId = ''
) {
  const rows = (
    await db.query<Record<string, unknown>>(
      `SELECT o.* FROM page_studio_cms_objects o WHERE o.scope_key=$1 AND o.generation=$2 AND o.kind=$3 AND o.collection_id=$4 AND o.record_id=$5 AND (${kind === 'content' ? 'o.id=$6::uuid' : `EXISTS(SELECT 1 FROM page_studio_cms_record_heads h WHERE h.scope_key=o.scope_key AND h.generation=o.generation AND h.collection_id=o.collection_id AND h.record_id=o.record_id AND h.object_id=o.id) AND $6::uuid IS NULL`})`,
      [
        context.state.scope_key,
        context.state.active_generation,
        kind,
        collectionId,
        recordId,
        kind === 'content' ? context.state.current_content_id : null
      ]
    )
  ).rows
  if (rows.length > 1) throw cmsUnavailable()
  return rows[0] ? decodeCmsObject(rows[0], context) : null
}
/** Pure native-SQL primitive for the later graph coordinator. Caller must hold
 * withCmsCommitAuthority + namespace lock, verify complete graph approval and
 * expected bases, and persist its final commit in this SAME transaction. This
 * inserts metadata only; it does not grant graph approval or update any pointer. */
export async function insertVerifiedCmsObjects(
  db: PageStudioControlQueryClient,
  context: Awaited<ReturnType<typeof lockCmsContext>>,
  proof: VerifiedPreparation,
  commitId: string
) {
  if (
    !verifiedPreparations.has(proof)
    || !cmsEqual(context.state.target, proof.freeze.request.target)
    || context.state.freeze_digest !== proof.freeze.digest
    || context.state.scope_key !== contentScopeKey(proof.request.scope)
  )
    throw cmsUnavailable()
  const ids = proof.request.items.map(() => randomUUID())
  const objects: Array<{ id: string, pin: CmsObjectPin }> = []
  // Schema metadata first so record references can resolve local schema effects.
  const indices = proof.request.items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => Number(b.item.kind === 'schema') - Number(a.item.kind === 'schema'))
  for (const { item, index } of indices) {
    const pin = proof.receipt.items[index]!,
      id = ids[index]!
    let schemaId: string | null = null
    if (item.kind === 'record') {
      const local = proof.receipt.items.findIndex(candidate => cmsEqual(candidate, item.schema))
      if (local >= 0) schemaId = ids[local]!
      else {
        const rows = (
          await db.query<{ id: string }>(
            `SELECT id FROM page_studio_cms_objects WHERE scope_key=$1 AND generation=$2 AND kind='schema' AND storage_pin=$3::jsonb`,
            [context.state.scope_key, context.state.active_generation, item.schema]
          )
        ).rows
        if (rows.length !== 1) throw cmsUnavailable()
        schemaId = rows[0]!.id
      }
    }
    await db.query(
      `INSERT INTO page_studio_cms_objects(scope_key,generation,id,kind,collection_id,record_id,logical_version,storage_pin,schema_object_id,archived,actor_id,created_at,commit_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        context.state.scope_key,
        context.state.active_generation,
        id,
        pin.kind,
        pin.collectionId,
        pin.recordId,
        pin.version,
        pin,
        schemaId,
        item.kind === 'record' ? item.body.archived : null,
        cmsPreparationActorId(proof.request.actor),
        proof.receipt.createdAt,
        commitId
      ]
    )
    objects.push({ id, pin })
  }
  return proof.receipt.items.map(pin => objects.find(object => cmsEqual(object.pin, pin))!)
}
export const CmsManagedCommitReceiptSchema = z
  .object({
    formatVersion: z.literal(1),
    commitId: z.uuid(),
    operationId: z.string(),
    requestDigest: z.string(),
    preparedDigest: z.string(),
    generation: z.uuid(),
    application: z.object({ id: z.uuid(), digest: z.string() }).strict(),
    objects: z.array(z.object({ id: z.uuid(), pin: CmsObjectPinSchema }).strict()).max(32),
    createdAt: z.iso.datetime()
  })
  .strict()
/** Ordinary content/record commit. No schema/application replacement is admitted.
 * No D1/R2/network calls run inside native authority locks, no automatic retry. */
export async function commitManagedCms(
  raw: unknown,
  principal: Principal,
  dependencies: { readPreparation: CmsPreparationReader, runTransaction?: RunTransaction }
) {
  const input = CmsNativeCommitSchema.parse(raw)
  const proof = await verifyCmsPreparation(input, dependencies.readPreparation)
  if (proof.request.formatVersion !== 1) throw cmsUnavailable()
  if (proof.request.items.some(item => item.kind === 'schema'))
    throw new Error('Schema effects require verified application acceptance')
  const mutation = proof.request.items.some(item => item.kind === 'record')
    ? 'collection-record'
    : 'business-content'
  return await withCmsCommitAuthority(
    { scope: input.scope, principal, mutation },
    async (db) => {
      return commitVerifiedManagedCmsInTransaction(db, input, principal, proof)
    },
    { runTransaction: dependencies.runTransaction }
  )
}

/** SQL-only composition for the native action coordinator. The caller must hold
 * native authority locks and commit its invocation receipt in the same transaction.
 * Proofs can only originate from verifyCmsPreparation. */
export async function commitVerifiedManagedCmsInTransaction(
  db: PageStudioControlQueryClient, input: CmsNativeCommit, principal: Principal, proof: VerifiedPreparation
) {
  if (!verifiedPreparations.has(proof) || verifiedCommitInputs.get(proof) !== collectionCanonical(input) || proof.request.items.some(item => item.kind === 'schema')) throw cmsUnavailable()
  if (proof.request.formatVersion !== 1) throw cmsUnavailable()
  const identity = principalIdentity(principal, proof.request.actor)
  const bound = {
    input,
    principal: identity,
    candidateDigest: proof.request.candidateDigest,
    action: proof.request.action,
    items: proof.receipt.items
  }
  const requestDigest = await collectionDigest(bound)
  await checkChild(db, principal, proof)
  const context = await lockCmsContext(db, input.scope)
  if (
    context.state.active_generation !== input.generation
    || context.state.freeze_digest !== input.freezeDigest
    || !cmsEqual(context.state.target, input.target)
  )
    throw cmsUnavailable()
  const currentCheckpoint = await checkpoint(db, input)
  const rows = (
    await db.query<{
      request_digest: string
      prepared_digest: string
      request: unknown
      result: unknown
      id: string
      generation: string
    }>(
      `SELECT request_digest,prepared_digest,request,result,id,generation FROM page_studio_cms_commits WHERE scope_key=$1 AND operation_id=$2`,
      [context.state.scope_key, input.operationId]
    )
  ).rows
  if (rows.length) {
    const prior = rows[0]!
    if (
      prior.request_digest !== requestDigest
      || prior.prepared_digest !== input.preparedDigest
      || !cmsEqual(prior.request, bound)
    )
      throw new Error('CMS exact replay conflict')
    const receipt = CmsManagedCommitReceiptSchema.parse(prior.result)
    if (
      receipt.commitId !== prior.id
      || receipt.generation !== prior.generation
      || receipt.requestDigest !== requestDigest
      || receipt.preparedDigest !== input.preparedDigest
      || receipt.operationId !== input.operationId
      || receipt.generation !== input.generation
      || !cmsEqual(receipt.application, input.expectedApplication)
      || !cmsEqual(
        receipt.objects.map(item => item.pin),
        proof.receipt.items
      )
    )
      throw cmsUnavailable()
    let current
      = context.application.id === receipt.application.id
        && context.application.digest === receipt.application.digest
        && cmsEqual(currentCheckpoint, input.expectedCheckpoint)
    for (const object of receipt.objects) {
      if (object.pin.kind === 'schema') throw cmsUnavailable()
      const stored = (
        await db.query<Record<string, unknown>>(
          'SELECT * FROM page_studio_cms_objects WHERE scope_key=$1 AND generation=$2 AND id=$3',
          [context.state.scope_key, input.generation, object.id]
        )
      ).rows
      if (stored.length !== 1 || !cmsEqual(decodeCmsObject(stored[0], context).pin, object.pin))
        throw cmsUnavailable()
      const head = await currentObject(
        db,
        context,
        object.pin.kind,
        object.pin.collectionId,
        object.pin.recordId
      )
      current = current && head?.id === object.id && cmsEqual(head.pin, object.pin)
    }
    if (!proof.request.items.some(item => item.kind === 'content')) {
      const content = await currentObject(db, context, 'content')
      current = current && cmsEqual(content?.pin ?? null, input.expectedContent)
    }
    return { receipt, current, replayed: true }
  }
  if (
    context.application.id !== input.expectedApplication.id
    || context.application.digest !== input.expectedApplication.digest
    || !cmsEqual(currentCheckpoint, input.expectedCheckpoint)
  )
    throw cmsUnavailable()
  if (
    proof.request.action
    && !context.application.manifest.actions.some(action =>
      cmsEqual(action, proof.request.action)
    )
  )
    throw cmsUnavailable()
  const content = await currentObject(db, context, 'content')
  if (!cmsEqual(content?.pin ?? null, input.expectedContent)) throw cmsUnavailable()
  const schemaPins = new Map<string, CmsObjectPin>()
  for (const expected of input.expectedSchemas) {
    const accepted = await readAcceptedCmsObject(db, {
      scope: input.scope,
      kind: 'schema',
      collectionId: expected.collectionId
    })
    if (!cmsEqual(accepted.pin, expected)) throw cmsUnavailable()
    schemaPins.set(expected.collectionId, expected)
  }
  const records = proof.request.items.filter(item => item.kind === 'record')
  if (records.length !== input.expectedRecords.length) throw cmsUnavailable()
  for (const item of proof.request.items) {
    if (item.kind === 'record') {
      const expected = input.expectedRecords.find(
        record =>
          record.collectionId === item.body.collectionId && record.recordId === item.body.id
      )
      if (
        !expected
        || !cmsEqual(expected.base, item.expectedBase)
        || !cmsEqual(schemaPins.get(item.body.collectionId) ?? null, item.schema)
      )
        throw cmsUnavailable()
      const head = await currentObject(
        db,
        context,
        'record',
        item.body.collectionId,
        item.body.id
      )
      if (!cmsEqual(head?.pin ?? null, expected.base)) throw cmsUnavailable()
    } else if (!cmsEqual(item.expectedBase, input.expectedContent)) throw cmsUnavailable()
  }
  const commitId = randomUUID(),
    auditId = randomUUID()
  const objects = await insertVerifiedCmsObjects(db, context, proof, commitId)
  for (const object of objects) {
    if (object.pin.kind === 'content')
      await db.query(
        `UPDATE page_studio_cms_scopes SET current_content_id=$2 WHERE scope_key=$1`,
        [context.state.scope_key, object.id]
      )
    else
      await db.query(
        `INSERT INTO page_studio_cms_record_heads(scope_key,generation,collection_id,record_id,object_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(scope_key,generation,collection_id,record_id) DO UPDATE SET object_id=EXCLUDED.object_id`,
        [
          context.state.scope_key,
          input.generation,
          object.pin.collectionId,
          object.pin.recordId,
          object.id
        ]
      )
  }
  const receipt = CmsManagedCommitReceiptSchema.parse({
    formatVersion: 1,
    commitId,
    operationId: input.operationId,
    requestDigest,
    preparedDigest: input.preparedDigest,
    generation: input.generation,
    application: input.expectedApplication,
    objects,
    createdAt: new Date().toISOString()
  })
  await db.query(
    `INSERT INTO page_studio_audit_events(id,tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,$6,'cms.commit','cms-operation',$7,$8,$9)`,
    [
      auditId,
      input.scope.tenantId,
      input.scope.clientId,
      input.scope.siteId,
      proof.request.actor.userId,
      proof.request.actor.kind === 'agency-user' ? 'agency' : 'client',
      input.operationId,
      `cms:${input.scope.environment}:${input.operationId}`,
      {
        commitId,
        requestDigest,
        preparedDigest: input.preparedDigest,
        generation: input.generation
      }
    ]
  )
  await db.query(
    `INSERT INTO page_studio_cms_commits(scope_key,generation,id,operation_id,request_digest,prepared_digest,request,result,actor_id,audit_id,tenant_id,client_id,site_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      context.state.scope_key,
      input.generation,
      commitId,
      input.operationId,
      requestDigest,
      input.preparedDigest,
      bound,
      receipt,
      proof.request.actor.userId,
      auditId,
      input.scope.tenantId,
      input.scope.clientId,
      input.scope.siteId
    ]
  )
  return { receipt, current: true, replayed: false }
}
