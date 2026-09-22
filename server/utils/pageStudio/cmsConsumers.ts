import { z } from 'zod'
import { queryFresh } from '~~/server/utils/db'
import {
  PageStudioBusinessContentSchema,
  samePageStudioContentScope,
  type PageStudioContentScope
} from '~~/shared/pageStudio/businessContent'
import {
  CollectionDefinitionSchema,
  parseCollectionValues
} from '~~/shared/pageStudio/collectionDefinition'
import {
  CollectionDefinitionReadSchema,
  CollectionListSchema,
  CollectionRecordListSchema,
  CollectionRecordReadSchema,
  CollectionRecordSchema,
  CollectionRecordWriteSchema,
  collectionCanonical,
  collectionDigest
} from '~~/shared/pageStudio/collectionApi'
import {
  CmsNativeCommitSchema,
  CmsObjectPinSchema,
  CmsPreparationReceiptSchema,
  CmsPreparationSchema,
  CmsStorageTargetSchema,
  contentScopeKey
} from '~~/shared/pageStudio/cmsManaged'
import type { ContentAuthorityRequest } from './businessContent'
import type { PageStudioControlQueryClient } from './controlStore'
import { commitManagedCms, type CmsPreparationReader } from './cmsCommits'
import { cmsEqual, readCmsConsumerSnapshot, type AcceptedCmsObject } from './cmsVisibility'

export class CmsConsumerError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string
  ) {
    super(message)
  }
}
const unavailable = () =>
  new CmsConsumerError(
    'CMS_UNAVAILABLE',
    503,
    'Accepted content is unavailable. Reload before continuing.'
  )
const conflict = () =>
  new CmsConsumerError(
    'CONTENT_CONFLICT',
    409,
    'Content changed in another session. Reload before saving again.'
  )
export interface CmsConsumerDependencies {
  db?: PageStudioControlQueryClient
  runTransaction?: Parameters<typeof commitManagedCms>[2]['runTransaction']
}
const defaultDb: PageStudioControlQueryClient = {
  query: async (sql, params) => ({ rows: await queryFresh(sql, params) })
}
const storedItem = z
  .object({
    actorId: z.string(),
    body: z.unknown(),
    createdAt: z.string(),
    head: z.boolean(),
    pin: CmsObjectPinSchema,
    schema: CmsObjectPinSchema.nullable()
  })
  .strict()

/** Private byte transport only. Pins are always derived from native metadata. */
export function createCmsConsumerService(
  request: ContentAuthorityRequest,
  scope: PageStudioContentScope,
  dependencies: CmsConsumerDependencies = {}
) {
  const db = dependencies.db ?? defaultDb
  const transport = request.env.PAGE_STUDIO_CONTENT_ROUTER as Record<
    string,
    (input: unknown) => Promise<unknown>
  >
  const call = async (method: string, input: unknown) => {
    if (typeof transport?.[method] !== 'function') throw unavailable()
    return await transport[method]!(input)
  }
  const assertScope = (value: PageStudioContentScope) => {
    if (!samePageStudioContentScope(value, scope)) throw unavailable()
  }
  const target = async (expected: unknown) => {
    if (
      !cmsEqual(
        CmsStorageTargetSchema.parse(await call('readManagedCmsTarget', { scope })),
        expected
      )
    )
      throw unavailable()
  }
  const bodies = async (
    objects: AcceptedCmsObject[],
    expectedTarget: unknown,
    references: AcceptedCmsObject[] = []
  ) => {
    await target(expectedTarget)
    const unique = [...new Map([...objects, ...references].map(item => [item.id, item])).values()]
    const result = new Map<string, z.infer<typeof storedItem>>()
    let totalBytes = 0
    // Private transport is bounded to 32 pins per call; preserve the native snapshot.
    for (let offset = 0; offset < unique.length; offset += 32) {
      const batch = unique.slice(offset, offset + 32)
      const raw = z
        .array(storedItem)
        .max(32)
        .parse(await call('readManagedCmsObjects', { scope, pins: batch.map(item => item.pin) }))
      if (raw.length !== batch.length) throw unavailable()
      for (let i = 0; i < batch.length; i++) {
        const metadata = batch[i]!,
          item = raw[i]!,
          pin = metadata.pin
        totalBytes += new TextEncoder().encode(collectionCanonical(item.body)).byteLength
        if (totalBytes > 1_500_000) throw unavailable()
        if (
          !cmsEqual(item.pin, pin)
          || item.actorId !== metadata.actorId
          || new Date(item.createdAt).toISOString() !== metadata.createdAt
          || (await collectionDigest(item.body)) !== pin.sha256
          || new TextEncoder().encode(collectionCanonical(item.body)).byteLength !== pin.bytes
        )
          throw unavailable()
        const body
          = pin.kind === 'content'
            ? PageStudioBusinessContentSchema.parse(item.body)
            : pin.kind === 'schema'
              ? CollectionDefinitionSchema.parse(item.body)
              : CollectionRecordSchema.parse(item.body)
        assertScope(body.scope)
        if (
          pin.kind === 'schema'
          && (!('version' in body)
            || body.version !== pin.version
            || !('id' in body)
            || body.id !== pin.collectionId)
        )
          throw unavailable()
        if (pin.kind === 'record') {
          const record = CollectionRecordSchema.parse(body)
          const schema = unique.find(ref => ref.id === metadata.schemaObjectId)
          if (
            !schema
            || !cmsEqual(item.schema, schema.pin)
            || record.id !== pin.recordId
            || record.collectionId !== pin.collectionId
            || record.revision !== pin.version
            || record.schemaVersion !== schema.pin.version
            || record.archived !== metadata.archived
          )
            throw unavailable()
        } else if (item.schema !== null) throw unavailable()
        result.set(metadata.id, { ...item, body })
      }
    }
    for (const object of objects)
      if (object.pin.kind === 'record') {
        const record = CollectionRecordSchema.parse(result.get(object.id)?.body)
        const definition = CollectionDefinitionSchema.parse(
          result.get(object.schemaObjectId!)?.body
        )
        parseCollectionValues(definition, record.values)
      }
    await target(expectedTarget)
    return result
  }
  const project = (object: AcceptedCmsObject, body: unknown) => {
    const metadata = { actorId: object.actorId, createdAt: object.createdAt }
    if (object.pin.kind === 'content')
      return {
        ...metadata,
        content: PageStudioBusinessContentSchema.parse(body),
        revision: object.pin.version
      }
    if (object.pin.kind === 'schema')
      return {
        ...metadata,
        definition: CollectionDefinitionSchema.parse(body),
        sha256: object.pin.sha256
      }
    return { ...metadata, record: CollectionRecordSchema.parse(body), sha256: object.pin.sha256 }
  }
  const stable = async (
    before: Awaited<ReturnType<typeof readCmsConsumerSnapshot>>,
    input: Parameters<typeof readCmsConsumerSnapshot>[2] = {}
  ) => {
    if (!cmsEqual(before, await readCmsConsumerSnapshot(db, scope, input))) throw unavailable()
  }
  const read = async (kind: 'schema' | 'record', raw: unknown) => {
    const input
      = kind === 'schema'
        ? CollectionDefinitionReadSchema.parse(raw)
        : CollectionRecordReadSchema.parse(raw)
    assertScope(input.scope)
    const selection = {
      kind,
      collectionId: 'collectionId' in input ? input.collectionId : input.id,
      recordId: kind === 'record' ? input.id : '',
      version: 'revision' in input ? input.revision : 'version' in input ? input.version : undefined
    }
    const snapshot = await readCmsConsumerSnapshot(db, scope, selection)
    const selected = snapshot.objects[0]
    if (!selected) return null
    if (snapshot.objects.length !== 1) throw unavailable()
    const values = await bodies(
      [selected.object],
      snapshot.context.state.target,
      selected.schema ? [selected.schema] : []
    )
    await stable(snapshot, selection)
    return project(selected.object, values.get(selected.object.id)!.body)
  }
  const list = async (kind: 'schema' | 'record', raw: unknown) => {
    const input = CollectionListSchema.parse(
      kind === 'schema'
        ? raw
        : (() => {
            const record = CollectionRecordListSchema.parse(raw)
            return { scope: record.scope, after: record.after, limit: record.limit }
          })()
    )
    const recordInput = kind === 'record' ? CollectionRecordListSchema.parse(raw) : null
    assertScope(input.scope)
    const selection = {
      kind: kind === 'schema' ? ('content' as const) : ('record' as const),
      ...(recordInput
        ? { collectionId: recordInput.collectionId, includeArchived: recordInput.includeArchived }
        : {}),
      after: input.after,
      limit: input.limit
    }
    const snapshot = await readCmsConsumerSnapshot(db, scope, selection)
    const candidates
      = kind === 'schema'
        ? snapshot.schemas
            .filter(item => item.pin.collectionId > (input.after ?? ''))
            .slice(0, input.limit + 1)
        : snapshot.objects.map(item => item.object)
    const selected = candidates.slice(0, input.limit)
    const values = await bodies(
      selected,
      snapshot.context.state.target,
      snapshot.objects.flatMap(item => (item.schema ? [item.schema] : []))
    )
    await stable(snapshot, selection)
    return {
      items: selected.map(item => project(item, values.get(item.id)!.body)),
      nextCursor:
        candidates.length > input.limit && selected.length
          ? kind === 'schema'
            ? selected.at(-1)!.pin.collectionId
            : selected.at(-1)!.pin.recordId
          : null
    }
  }
  const readPreparation: CmsPreparationReader = async (input) => {
    await target(input.target)
    const operation = z
      .object({ request: CmsPreparationSchema, receipt: CmsPreparationReceiptSchema })
      .strict()
      .parse(
        await call('readManagedCmsOperation', {
          scope,
          operationId: input.operationId,
          requestDigest: input.requestDigest
        })
      )
    const pins = [
      ...new Map(
        operation.request.items.flatMap(item =>
          item.kind === 'record' ? [[collectionCanonical(item.schema), item.schema] as const] : []
        )
      ).values()
    ]
    const schemas = pins.length
      ? z
          .array(storedItem)
          .max(32)
          .parse(await call('readManagedCmsObjects', { scope, pins }))
      : []
    if (schemas.length !== pins.length || schemas.some((item, i) => !cmsEqual(item.pin, pins[i])))
      throw unavailable()
    const freeze = await call('readManagedCmsFreeze', { scope })
    await target(input.target)
    return {
      ...operation,
      freeze,
      schemas: schemas.map(item => ({ pin: item.pin, definition: item.body }))
    }
  }
  const write = async (kind: 'content' | 'record', raw: unknown) => {
    const input
      = kind === 'record'
        ? CollectionRecordWriteSchema.parse(raw)
        : z
            .object({
              actorId: z.string(),
              content: PageStudioBusinessContentSchema,
              expectedRevision: z
                .number()
                .int()
                .min(0)
                .max(Number.MAX_SAFE_INTEGER - 1)
            })
            .strict()
            .parse(raw)
    assertScope('content' in input ? input.content.scope : input.scope)
    if (input.actorId !== request.actor.actorId) throw unavailable()
    const operationId = `edit_${await collectionDigest({ scope, actor: { role: request.login.role, userId: request.login.userId, loginSessionHash: request.login.tokenHash }, kind, input })}`
    // Persisted request is the replay source: never reconstruct it from newer heads.
    const prior = (
      await db.query<{ request: { input: unknown } }>(
        'SELECT request FROM page_studio_cms_commits WHERE scope_key=$1 AND operation_id=$2',
        [contentScopeKey(scope), operationId]
      )
    ).rows[0]
    let commitInput
    if (prior) commitInput = CmsNativeCommitSchema.parse(prior.request.input)
    else {
      const snapshot = await readCmsConsumerSnapshot(db, scope, {
        kind,
        ...('collectionId' in input ? { collectionId: input.collectionId, recordId: input.id } : {})
      })
      const base = kind === 'content' ? snapshot.content : (snapshot.objects[0]?.object ?? null)
      if ((base?.pin.version ?? 0) !== input.expectedRevision) throw conflict()
      const schema
        = 'collectionId' in input
          ? snapshot.schemas.find(item => item.pin.collectionId === input.collectionId)
          : null
      if ('collectionId' in input && (!schema || schema.pin.version !== input.schemaVersion))
        throw conflict()
      if (schema && 'values' in input) {
        const values = await bodies([schema], snapshot.context.state.target)
        parseCollectionValues(
          CollectionDefinitionSchema.parse(values.get(schema.id)!.body),
          input.values
        )
      }
      const item
        = 'content' in input
          ? {
              kind: 'content' as const,
              body: input.content,
              expectedBase: base?.pin ?? null,
              version: input.expectedRevision + 1
            }
          : {
              kind: 'record' as const,
              body: {
                scope,
                collectionId: input.collectionId,
                id: input.id,
                revision: input.expectedRevision + 1,
                schemaVersion: input.schemaVersion,
                archived: input.archived,
                values: input.values
              },
              schema: schema!.pin,
              expectedBase: base?.pin ?? null,
              version: input.expectedRevision + 1
            }
      const preparation = CmsPreparationSchema.parse({
        formatVersion: 1,
        scope,
        actor: {
          kind: request.login.role === 'agency' ? 'agency-user' : 'client-user',
          userId: request.login.userId,
          loginSessionHash: request.login.tokenHash
        },
        action: null,
        candidateDigest: null,
        operationId,
        freezeDigest: snapshot.context.state.freeze_digest,
        items: [item]
      })
      await target(snapshot.context.state.target)
      const receipt = CmsPreparationReceiptSchema.parse(
        await call('prepareManagedCmsOperation', preparation)
      )
      if (receipt.requestDigest !== (await collectionDigest(preparation))) throw unavailable()
      commitInput = CmsNativeCommitSchema.parse({
        formatVersion: 1,
        scope,
        operationId,
        generation: snapshot.context.state.active_generation,
        target: snapshot.context.state.target,
        freezeDigest: snapshot.context.state.freeze_digest,
        preparedDigest: receipt.digest,
        preparedRequestDigest: receipt.requestDigest,
        expectedApplication: {
          id: snapshot.context.application.id,
          digest: snapshot.context.application.digest
        },
        expectedCheckpoint: snapshot.context.application.manifest.checkpoint,
        expectedContent: snapshot.content?.pin ?? null,
        expectedSchemas: schema ? [schema.pin] : [],
        expectedRecords:
          'collectionId' in input
            ? [{ collectionId: input.collectionId, recordId: input.id, base: base?.pin ?? null }]
            : []
      })
    }
    await commitManagedCms(
      commitInput,
      { source: 'native-login', request },
      { readPreparation, runTransaction: dependencies.runTransaction }
    )
    if (kind === 'record' && 'collectionId' in input)
      return await read('record', {
        scope,
        collectionId: input.collectionId,
        id: input.id,
        revision: input.expectedRevision + 1
      })
    const snapshot = await readCmsConsumerSnapshot(db, scope, {
      kind: 'content',
      version: input.expectedRevision + 1
    })
    const object = snapshot.objects[0]?.object
    if (!object) throw unavailable()
    const values = await bodies([object], snapshot.context.state.target)
    return project(object, values.get(object.id)!.body)
  }
  return {
    readContent: async (value: PageStudioContentScope) => {
      assertScope(value)
      const snapshot = await readCmsConsumerSnapshot(db, scope)
      const values = await bodies(
        snapshot.content ? [snapshot.content] : [],
        snapshot.context.state.target
      )
      await stable(snapshot)
      return snapshot.content
        ? project(snapshot.content, values.get(snapshot.content.id)!.body)
        : null
    },
    writeContent: (input: unknown) => write('content', input),
    readCollectionDefinition: (input: unknown) => read('schema', input),
    readCollectionRecord: (input: unknown) => read('record', input),
    listCollectionDefinitions: (input: unknown) => list('schema', input),
    listCollectionRecords: (input: unknown) => list('record', input),
    writeCollectionRecord: (input: unknown) => write('record', input),
    writeCollectionDefinition: async (_input: unknown) => {
      throw new CmsConsumerError(
        'CMS_SCHEMA_ACCEPTANCE_PENDING',
        409,
        'Managed schema editing requires graph acceptance'
      )
    }
  }
}
