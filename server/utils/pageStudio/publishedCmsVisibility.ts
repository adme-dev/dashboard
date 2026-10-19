import { z } from 'zod'
import { CollectionIdentitySchema } from '~~/shared/pageStudio/collectionDefinition'
import type { PageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import type { PageStudioControlQueryClient } from '~~/shared/pageStudio/controlTypes'
import { contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import { assertPublishedCmsContext, type PublishedCmsContext } from './publishedCmsContext'
import { cmsEqual, cmsUnavailable, cmsConsumerSnapshotSql, decodeCmsContext, decodeRetainedCmsContext, decodeCmsConsumerObjects } from './cmsVisibility'

const readSchema = z.object({ kind: z.enum(['content', 'record', 'schema']).default('content'), collectionId: CollectionIdentitySchema.optional(),
  limit: z.number().int().min(1).max(100).default(50), includeArchived: z.boolean().default(false) }).strict()
/** Published-only current heads. The retained source uses its own immutable
 * application's checkpoint, never the now-production authoring checkpoint. */
export async function readPublishedCmsConsumerSnapshot(db: PageStudioControlQueryClient, scope: PageStudioContentScope, admitted: PublishedCmsContext, input: unknown = {}) {
  assertPublishedCmsContext(admitted)
  const read = readSchema.parse(input)
  if (contentScopeKey(scope) !== admitted.state.scope_key || (read.kind !== 'content' && !read.collectionId)) throw cmsUnavailable()
  const rows = (await db.query<Record<string, unknown>>(cmsConsumerSnapshotSql, [contentScopeKey(scope), read.kind, read.collectionId ?? '', '', null, '', read.includeArchived, read.limit + 1,
    admitted.state.state, admitted.state.state === 'retained' ? admitted.application.manifest.checkpoint.id : null])).rows
  if (rows.length !== 1) throw cmsUnavailable()
  const row = rows[0]!, context = await (admitted.state.state === 'retained' ? decodeRetainedCmsContext : decodeCmsContext)(row, scope)
  if (!cmsEqual(context, admitted) || row.current_checkpoint_id !== context.application.manifest.checkpoint.id || row.checkpoint_digest !== context.application.manifest.checkpoint.digest) throw cmsUnavailable()
  return decodeCmsConsumerObjects(row, context)
}
/** Forms retain only their existing create-only schema contract. */
export async function readPublishedCmsSchema(db: PageStudioControlQueryClient, scope: PageStudioContentScope, context: PublishedCmsContext, collectionId: string) {
  const snapshot = await readPublishedCmsConsumerSnapshot(db, scope, context, { kind: 'schema', collectionId, limit: 1 })
  if (snapshot.objects.length !== 1 || snapshot.objects[0]!.object.pin.kind !== 'schema') throw cmsUnavailable()
  return snapshot.objects[0]!.object
}
