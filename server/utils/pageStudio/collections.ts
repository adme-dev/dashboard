import { CmsConsumerError } from './cmsConsumers'
import { z } from 'zod'
import {
  authorizePageStudioBusinessContent,
  PageStudioBusinessContentError as ContentError,
  type ContentAuthorityRequest,
  type ContentAuthorityDependencies
} from './businessContent'
import { samePageStudioContentScope, type PageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import {
  CollectionDefinitionSchema,
  CollectionIdentitySchema,
  parseCollectionValues
} from '~~/shared/pageStudio/collectionDefinition'
import {
  CollectionDefinitionEditSchema,
  CollectionRecordEditSchema,
  CollectionDefinitionPageSchema,
  CollectionDefinitionRevisionSchema,
  CollectionRecordPageSchema,
  CollectionRecordRevisionSchema,
  collectionCanonical,
  collectionDigest
} from '~~/shared/pageStudio/collectionApi'

export type CollectionOperation
  = 'listDefinitions' | 'readDefinition' | 'writeDefinition' | 'listRecords' | 'readRecord' | 'writeRecord'
const methods = {
  listDefinitions: 'listCollectionDefinitions',
  readDefinition: 'readCollectionDefinition',
  writeDefinition: 'writeCollectionDefinition',
  listRecords: 'listCollectionRecords',
  readRecord: 'readCollectionRecord',
  writeRecord: 'writeCollectionRecord'
} as const
const denied = () => new ContentError('COLLECTION_ACCESS_DENIED', 403, 'Collection access denied')
const invalid = () => new ContentError('COLLECTION_INVALID', 400, 'Check the collection fields and try again')
const unverified = () =>
  new ContentError('COLLECTION_RESPONSE_INVALID', 502, 'Collection response could not be verified')
const pending = () => new ContentError('COLLECTION_SETUP_PENDING', 503, 'Custom collection setup is pending')
const Policy = z.object({
  builder: z.object({ collectionSchemas: z.literal(true) }),
  allowedModules: z.array(z.string()).optional()
})
const Inputs = z
  .object({
    collectionId: CollectionIdentitySchema.optional(),
    recordId: CollectionIdentitySchema.optional(),
    version: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
    revision: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
    after: CollectionIdentitySchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    includeArchived: z.enum(['true', 'false']).optional(),
    body: z.unknown().optional()
  })
  .strict()

export async function authorizePageStudioCollections(
  request: ContentAuthorityRequest,
  writing: boolean,
  schemaWrite: boolean,
  deps: ContentAuthorityDependencies
) {
  const admitted = await authorizePageStudioBusinessContent(
    { ...request, collectionAccess: true },
    writing,
    deps
  )
  const row = admitted.collectionPolicy,
    policy = Policy.safeParse(row.plan_metadata)
  if (
    !policy.success
    || (policy.data.allowedModules && !policy.data.allowedModules.includes('business-content'))
    || row.collection_capacity !== true
    || (request.actor.role === 'client' && row.portal_creation_enabled !== true)
  )
    throw denied()
  const canManageSchema
    = admitted.canEdit
      && (request.actor.role === 'agency' || ['admin', 'manager'].includes(row.native_user_role ?? ''))
  if (schemaWrite && !canManageSchema) throw denied()
  return { ...admitted, canManageSchema }
}
async function remote(call: () => Promise<unknown>) {
  try {
    return await call()
  } catch (error) {
    if (error instanceof ContentError) throw error
    if (error instanceof CmsConsumerError) throw new ContentError(error.code, error.statusCode, error.message)
    const message = error instanceof Error ? error.message : ''
    if (
      /(?:upgrade required|schema unavailable|route is inactive|not installed|no such table)/i.test(message)
    )
      throw pending()
    if (/conflict|change (?:migration|required|review)/i.test(message))
      throw new ContentError(
        'COLLECTION_CONFLICT',
        409,
        'A newer version or schema change needs review. Your edits are preserved.'
      )
    throw new ContentError('COLLECTION_UNAVAILABLE', 502, 'Custom collections are temporarily unavailable')
  }
}
async function decode(value: unknown, kind: 'definition' | 'record', scope: PageStudioContentScope) {
  const parsed
    = kind === 'definition'
      ? CollectionDefinitionRevisionSchema.safeParse(value)
      : CollectionRecordRevisionSchema.safeParse(value)
  if (!parsed.success) throw unverified()
  const resource = 'definition' in parsed.data ? parsed.data.definition : parsed.data.record
  if (
    !samePageStudioContentScope(resource.scope, scope)
    || (await collectionDigest(resource)) !== parsed.data.sha256
  )
    throw unverified()
  return parsed.data
}
export async function executePageStudioCollection(
  request: ContentAuthorityRequest,
  operation: CollectionOperation,
  input: unknown,
  dependencies: ContentAuthorityDependencies = {}
) {
  const writing = operation.startsWith('write'),
    schemaWrite = operation === 'writeDefinition'
  const admissionBefore = await authorizePageStudioCollections(request, writing, schemaWrite, dependencies)
  const parsed = Inputs.safeParse(input)
  if (!parsed.success) throw invalid()
  const args = parsed.data,
    { scope } = admissionBefore
  if (!operation.endsWith('Definitions') && !args.collectionId) throw invalid()
  if ((operation === 'readRecord' || operation === 'writeRecord') && !args.recordId) throw invalid()
  const service = admissionBefore.service as unknown as Record<
    string,
    (body: unknown) => Promise<unknown>
  >
  const method = methods[operation]
  if (typeof service?.[method] !== 'function') throw pending()
  let payload: unknown
  if (operation === 'writeDefinition') {
    const body = CollectionDefinitionEditSchema.safeParse(args.body)
    if (!body.success || body.data.definition.id !== args.collectionId) throw invalid()
    const parsedDefinition = CollectionDefinitionSchema.safeParse({ ...body.data.definition, scope })
    if (!parsedDefinition.success) throw invalid()
    const definition = parsedDefinition.data
    payload = {
      actorId: request.actor.actorId,
      definition,
      expectedVersion: body.data.expectedVersion,
      sha256: await collectionDigest(definition)
    }
  } else if (operation === 'writeRecord') {
    const body = CollectionRecordEditSchema.safeParse(args.body)
    if (!body.success) throw invalid()
    if (typeof service.readCollectionDefinition !== 'function') throw pending()
    const schema = await remote(() =>
      service.readCollectionDefinition!({ scope, id: args.collectionId, version: body.data.schemaVersion })
    )
    const definition = CollectionDefinitionRevisionSchema.parse(
      await decode(schema, 'definition', scope)
    ).definition
    if (definition.id !== args.collectionId || definition.version !== body.data.schemaVersion)
      throw unverified()
    try {
      parseCollectionValues(definition, body.data.values)
    } catch {
      throw invalid()
    }
    payload = {
      ...body.data,
      scope,
      actorId: request.actor.actorId,
      collectionId: args.collectionId,
      id: args.recordId
    }
  } else if (operation === 'listDefinitions')
    payload = { scope, limit: args.limit, ...(args.after ? { after: args.after } : {}) }
  else if (operation === 'listRecords')
    payload = {
      scope,
      collectionId: args.collectionId,
      limit: args.limit,
      includeArchived: args.includeArchived === 'true',
      ...(args.after ? { after: args.after } : {})
    }
  else if (operation === 'readDefinition')
    payload = { scope, id: args.collectionId, ...(args.version ? { version: args.version } : {}) }
  else
    payload = {
      scope,
      collectionId: args.collectionId,
      id: args.recordId,
      ...(args.revision ? { revision: args.revision } : {})
    }
  // Hashing/schema reads cannot extend a revoked native login's authority.
  const current = await authorizePageStudioCollections(request, writing, schemaWrite, dependencies)
  if (!samePageStudioContentScope(scope, current.scope) || (admissionBefore.collectionPolicy.cms_state ?? null) !== (current.collectionPolicy.cms_state ?? null)) throw denied()
  const result = await remote(() => service[method]!(payload))
  const after = await authorizePageStudioCollections(request, writing, schemaWrite, dependencies)
  if (!samePageStudioContentScope(scope, after.scope) || (admissionBefore.collectionPolicy.cms_state ?? null) !== (after.collectionPolicy.cms_state ?? null)) throw denied()
  const kind = operation.endsWith('Definition') || operation.endsWith('Definitions') ? 'definition' : 'record'
  if (operation.startsWith('list')) {
    const page
      = kind === 'definition'
        ? CollectionDefinitionPageSchema.safeParse(result)
        : CollectionRecordPageSchema.safeParse(result)
    if (!page.success) throw unverified()
    const items = await Promise.all(page.data.items.map(item => decode(item, kind, scope)))
    const ids = items.map(item => ('definition' in item ? item.definition.id : item.record.id))
    if (
      ids.length > args.limit
      || ids.some((id, index) => id <= (index === 0 ? (args.after ?? '') : ids[index - 1]!))
      || (page.data.nextCursor !== null && (items.length !== args.limit || page.data.nextCursor !== ids.at(-1)))
    )
      throw unverified()
    if (
      items.some(
        item =>
          'record' in item
          && (item.record.collectionId !== args.collectionId
            || (args.includeArchived !== 'true' && item.record.archived))
      )
    )
      throw unverified()
    return {
      items,
      nextCursor: page.data.nextCursor,
      canEdit: after.canEdit,
      canManageSchema: after.canManageSchema
    }
  }
  if (result === null && !writing) return null
  const saved = await decode(result, kind, scope)
  if ('definition' in saved) {
    if (
      saved.definition.id !== args.collectionId
      || (args.version && saved.definition.version !== args.version)
    )
      throw unverified()
    if (
      writing
      && (saved.actorId !== request.actor.actorId
        || collectionCanonical(saved.definition)
        !== collectionCanonical((payload as { definition: unknown }).definition))
    )
      throw unverified()
  } else {
    if (
      saved.record.collectionId !== args.collectionId
      || saved.record.id !== args.recordId
      || (args.revision && saved.record.revision !== args.revision)
    )
      throw unverified()
    if (writing) {
      const { actorId, expectedRevision, ...record } = payload as {
        actorId: string
        expectedRevision: number
        [key: string]: unknown
      }
      if (
        saved.actorId !== actorId
        || collectionCanonical(saved.record)
        !== collectionCanonical({ ...record, revision: expectedRevision + 1 })
      )
        throw unverified()
    }
  }
  return saved
}
