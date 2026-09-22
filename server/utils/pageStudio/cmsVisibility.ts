import { z } from 'zod'
import {
  PageStudioContentScopeSchema,
  type PageStudioContentScope
} from '~~/shared/pageStudio/businessContent'
import { CollectionIdentitySchema } from '~~/shared/pageStudio/collectionDefinition'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import {
  CmsApplicationManifestSchema,
  CmsObjectPinSchema,
  CmsStorageTargetSchema,
  contentScopeKey
} from '~~/shared/pageStudio/cmsManaged'
import type { PageStudioControlQueryClient } from './controlStore'

export const cmsUnavailable = () => new Error('Accepted CMS state unavailable or stale')
export const cmsEqual = (a: unknown, b: unknown) =>
  collectionCanonical(a) === collectionCanonical(b)
const scopeRow = z.object({
  scope_key: z.string(),
  tenant_id: z.string(),
  client_id: z.uuid(),
  business_id: z.uuid(),
  site_id: z.uuid(),
  environment: z.string(),
  state: z.literal('managed'),
  active_generation: z.uuid(),
  target: CmsStorageTargetSchema,
  freeze_digest: z.string().regex(/^[a-f0-9]{64}$/),
  current_application_id: z.uuid(),
  current_content_id: z.uuid().nullable()
})
const applicationRow = z.object({
  id: z.uuid(),
  generation: z.uuid(),
  scope_key: z.string(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  manifest: CmsApplicationManifestSchema,
  previous_application_id: z.uuid().nullable()
})
const selectionRow = z.object({ collection_id: CollectionIdentitySchema, object_id: z.uuid() })
const objectRow = z.object({
  scope_key: z.string(),
  generation: z.uuid(),
  id: z.uuid(),
  kind: z.enum(['content', 'schema', 'record']),
  collection_id: z.string(),
  record_id: z.string(),
  logical_version: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  storage_pin: CmsObjectPinSchema,
  schema_object_id: z.uuid().nullable(),
  archived: z.boolean().nullable(),
  actor_id: z.string().min(1),
  created_at: z.coerce.date()
})
export type AcceptedCmsObject = {
  id: string
  pin: z.infer<typeof CmsObjectPinSchema>
  schemaObjectId: string | null
  archived: boolean | null
  actorId: string
  createdAt: string
}
/** Internal snapshot validation. Callers still enforce native read authorization. */
export async function decodeCmsContext(
  row: Record<string, unknown>,
  scope: PageStudioContentScope
) {
  const state = scopeRow.parse(row.state),
    application = applicationRow.parse(row.application),
    selections = z.array(selectionRow).max(128).parse(row.selections)
  const key = contentScopeKey(scope)
  const manifest = application.manifest
  if (
    state.scope_key !== key
    || state.tenant_id !== scope.tenantId
    || state.client_id !== scope.clientId
    || state.business_id !== scope.businessId
    || state.site_id !== scope.siteId
    || state.environment !== scope.environment
    || application.scope_key !== key
    || application.generation !== state.active_generation
    || application.id !== state.current_application_id
    || manifest.applicationId !== application.id
    || manifest.generation !== application.generation
    || contentScopeKey(manifest.scope) !== key
    || manifest.previousApplicationId !== application.previous_application_id
    || (await collectionDigest(manifest)) !== application.digest
  )
    throw cmsUnavailable()
  const sorted = (items: { collectionId: string, objectId: string }[]) =>
    items.toSorted((a, b) => a.collectionId.localeCompare(b.collectionId))
  if (
    !cmsEqual(
      sorted(manifest.schemas),
      sorted(
        selections.map(item => ({ collectionId: item.collection_id, objectId: item.object_id }))
      )
    )
  )
    throw cmsUnavailable()
  return { state, application, selections }
}
export function decodeCmsObject(
  value: unknown,
  context: Awaited<ReturnType<typeof decodeCmsContext>>
): AcceptedCmsObject {
  const row = objectRow.parse(value),
    pin = row.storage_pin
  if (
    row.scope_key !== context.state.scope_key
    || row.generation !== context.state.active_generation
    || pin.freezeDigest !== context.state.freeze_digest
    || pin.kind !== row.kind
    || pin.collectionId !== row.collection_id
    || pin.recordId !== row.record_id
    || pin.version !== row.logical_version
    || (pin.kind === 'record'
      ? row.schema_object_id === null || row.archived === null
      : row.schema_object_id !== null || row.archived !== null)
  )
    throw cmsUnavailable()
  return {
    id: row.id,
    pin,
    schemaObjectId: row.schema_object_id,
    archived: row.archived,
    actorId: row.actor_id,
    createdAt: row.created_at.toISOString()
  }
}
export const cmsContextColumns = `to_jsonb(s) AS state,to_jsonb(a) AS application,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('collection_id',x.collection_id,'object_id',x.object_id)) FROM page_studio_cms_application_schemas x WHERE x.scope_key=s.scope_key AND x.generation=s.active_generation AND x.application_id=a.id),'[]'::jsonb) AS selections`
export const cmsContextFrom = `FROM page_studio_cms_scopes s JOIN page_studio_application_versions a ON a.scope_key=s.scope_key AND a.generation=s.active_generation AND a.id=s.current_application_id`
/** Used only under the already acquired site authority lock. */
export async function lockCmsContext(
  db: PageStudioControlQueryClient,
  scope: PageStudioContentScope
) {
  const rows = (
    await db.query<Record<string, unknown>>(
      `SELECT ${cmsContextColumns} ${cmsContextFrom} WHERE s.scope_key=$1 AND s.state='managed' FOR UPDATE OF s`,
      [contentScopeKey(scope)]
    )
  ).rows
  if (rows.length !== 1) throw cmsUnavailable()
  return await decodeCmsContext(rows[0]!, scope)
}
const identity = {
  kind: z.enum(['content', 'schema', 'record']),
  collectionId: z.string().default(''),
  recordId: z.string().default('')
}
const exactRead = z
  .object({
    scope: PageStudioContentScopeSchema,
    ...identity,
    version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional()
  })
  .strict()
  .refine(value =>
    value.kind === 'content'
      ? value.collectionId === '' && value.recordId === ''
      : CollectionIdentitySchema.safeParse(value.collectionId).success
        && (value.kind === 'schema'
          ? value.recordId === ''
          : CollectionIdentitySchema.safeParse(value.recordId).success)
  )
/** One SQL snapshot; no unaccepted D1 body is discovered through this resolver. */
export async function readAcceptedCmsObject(db: PageStudioControlQueryClient, input: unknown) {
  const read = exactRead.parse(input)
  const rows = (
    await db.query<Record<string, unknown>>(
      `SELECT ${cmsContextColumns},to_jsonb(o) AS object ${cmsContextFrom}
 JOIN page_studio_cms_objects o ON o.scope_key=s.scope_key AND o.generation=s.active_generation
 WHERE s.scope_key=$1 AND s.state='managed' AND o.kind=$2 AND o.collection_id=$3 AND o.record_id=$4
 AND (($5::bigint IS NOT NULL AND o.logical_version=$5) OR ($5::bigint IS NULL AND (
 (o.kind='content' AND o.id=s.current_content_id) OR
 (o.kind='schema' AND EXISTS(SELECT 1 FROM page_studio_cms_application_schemas x WHERE x.scope_key=s.scope_key AND x.generation=s.active_generation AND x.application_id=a.id AND x.object_id=o.id)) OR
 (o.kind='record' AND EXISTS(SELECT 1 FROM page_studio_cms_record_heads h WHERE h.scope_key=s.scope_key AND h.generation=s.active_generation AND h.collection_id=o.collection_id AND h.record_id=o.record_id AND h.object_id=o.id)))))`,
      [
        contentScopeKey(read.scope),
        read.kind,
        read.collectionId,
        read.recordId,
        read.version ?? null
      ]
    )
  ).rows
  if (rows.length !== 1) throw cmsUnavailable()
  const context = await decodeCmsContext(rows[0]!, read.scope)
  return {
    ...decodeCmsObject(rows[0]!.object, context),
    target: context.state.target,
    generation: context.state.active_generation,
    application: { id: context.application.id, digest: context.application.digest }
  }
}
const cursor = z
  .object({
    scopeKey: z.string(),
    generation: z.uuid(),
    kind: z.enum(['content', 'schema', 'record']),
    collectionId: z.string(),
    recordId: z.string(),
    after: z.union([z.string(), z.number().int().min(1)])
  })
  .strict()
const list = z
  .object({
    scope: PageStudioContentScopeSchema,
    collectionId: CollectionIdentitySchema,
    limit: z.number().int().min(1).max(100).default(50),
    includeArchived: z.boolean().default(false),
    cursor: cursor.nullable().default(null)
  })
  .strict()
const history = z
  .object({
    scope: PageStudioContentScopeSchema,
    ...identity,
    limit: z.number().int().min(1).max(100).default(50),
    cursor: cursor.nullable().default(null)
  })
  .strict()
async function page(
  db: PageStudioControlQueryClient,
  scope: PageStudioContentScope,
  identityValue: { kind: string, collectionId: string, recordId: string },
  limit: number,
  after: z.infer<typeof cursor> | null,
  historyMode: boolean,
  includeArchived: boolean
) {
  const key = contentScopeKey(scope)
  if (
    after
    && (after.scopeKey !== key
      || after.kind !== identityValue.kind
      || after.collectionId !== identityValue.collectionId
      || after.recordId !== identityValue.recordId
      || (historyMode ? typeof after.after !== 'number' : typeof after.after !== 'string'))
  )
    throw cmsUnavailable()
  const filter = historyMode
    ? `o.record_id=$4 AND o.logical_version>$5::bigint`
    : `o.record_id>$5::text AND ($6::boolean OR o.archived=FALSE) AND EXISTS(SELECT 1 FROM page_studio_cms_record_heads h WHERE h.scope_key=o.scope_key AND h.generation=o.generation AND h.collection_id=o.collection_id AND h.record_id=o.record_id AND h.object_id=o.id)`
  const order = historyMode ? 'o.logical_version' : 'o.record_id'
  const rows = (
    await db.query<Record<string, unknown>>(
      `SELECT ${cmsContextColumns},COALESCE((SELECT jsonb_agg(to_jsonb(items) ORDER BY ${historyMode ? 'items.logical_version' : 'items.record_id'}) FROM (SELECT o.* FROM page_studio_cms_objects o WHERE o.scope_key=s.scope_key AND o.generation=s.active_generation AND o.kind=$2 AND o.collection_id=$3 AND ${filter} ORDER BY ${order} LIMIT $7) items),'[]'::jsonb) AS objects ${cmsContextFrom} WHERE s.scope_key=$1 AND s.state='managed' AND ($8::uuid IS NULL OR s.active_generation=$8::uuid) AND $4::text IS NOT NULL AND $6::boolean IS NOT NULL`,
      [
        key,
        identityValue.kind,
        identityValue.collectionId,
        identityValue.recordId,
        after?.after ?? (historyMode ? 0 : ''),
        includeArchived,
        limit + 1,
        after?.generation ?? null
      ]
    )
  ).rows
  if (rows.length !== 1) throw cmsUnavailable()
  const context = await decodeCmsContext(rows[0]!, scope)
  const objects = z
    .array(z.unknown())
    .max(101)
    .parse(rows[0]!.objects)
    .map(item => decodeCmsObject(item, context))
  const items = objects.slice(0, limit),
    last = items.at(-1)
  return {
    items,
    target: context.state.target,
    generation: context.state.active_generation,
    application: { id: context.application.id, digest: context.application.digest },
    nextCursor:
      objects.length > limit && last
        ? {
            scopeKey: key,
            generation: context.state.active_generation,
            kind: identityValue.kind,
            collectionId: identityValue.collectionId,
            recordId: identityValue.recordId,
            after: historyMode ? last.pin.version : last.pin.recordId
          }
        : null
  }
}
export async function listAcceptedCmsRecords(db: PageStudioControlQueryClient, input: unknown) {
  const read = list.parse(input)
  return await page(
    db,
    read.scope,
    { kind: 'record', collectionId: read.collectionId, recordId: '' },
    read.limit,
    read.cursor,
    false,
    read.includeArchived
  )
}
export async function listAcceptedCmsHistory(db: PageStudioControlQueryClient, input: unknown) {
  const read = history.parse(input)
  exactRead.parse({
    scope: read.scope,
    kind: read.kind,
    collectionId: read.collectionId,
    recordId: read.recordId
  })
  return await page(db, read.scope, read, read.limit, read.cursor, true, true)
}
