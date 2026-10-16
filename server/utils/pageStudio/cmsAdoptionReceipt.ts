import { z } from 'zod'
import type { PageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { CmsAdoptionIntentSchema, CmsApplicationManifestSchema, contentScopeKey, type CmsAdoptionIntent } from '~~/shared/pageStudio/cmsManaged'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { cmsEqual, cmsUnavailable } from './cmsVisibility'
import type { PageStudioControlQueryClient } from '~~/shared/pageStudio/controlTypes'

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const countsSchema = z.object({ content: count, record: count, schema: count }).strict()
export interface AdoptionRow {
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
const principalSchema = z
  .object({
    source: z.enum(['native-login', 'studio-session', 'customer-session']),
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
/** Read-only activation proof under existing native/site/CMS locks. The original
 * application stays immutable even after ordinary saves advance the latest head. */
export async function readManagedCmsAdoptionReceipt(db: PageStudioControlQueryClient, scope: PageStudioContentScope) {
  const raw = (await db.query<AdoptionRow>('SELECT * FROM page_studio_cms_scopes WHERE scope_key=$1', [contentScopeKey(scope)])).rows[0]
  const intent = CmsAdoptionIntentSchema.parse(raw?.adoption_request)
  if (!cmsEqual(intent.scope, scope)) throw cmsUnavailable()
  const row = await lock(db, intent)
  const receipt = adoptionReceiptSchema.parse(row.adoption_receipt)
  const { digest, ...body } = receipt
  if (row.state !== 'managed' || row.active_generation !== intent.generation
    || await collectionDigest(body) !== digest || receipt.adoptionId !== intent.adoptionId
    || receipt.generation !== intent.generation || receipt.freezeDigest !== row.freeze_digest
    || !cmsEqual(receipt.scope, scope) || !cmsEqual(receipt.checkpoint, intent.expectedCheckpoint)) throw cmsUnavailable()
  const initial = (await db.query<{ manifest: unknown, digest: string }>(
    'SELECT manifest,digest FROM page_studio_application_versions WHERE scope_key=$1 AND generation=$2 AND id=$3 AND adoption_id=$4 AND previous_application_id IS NULL',
    [row.scope_key, intent.generation, receipt.application.id, intent.adoptionId]
  )).rows[0]
  const manifest = CmsApplicationManifestSchema.parse(initial?.manifest)
  if (initial?.digest !== receipt.application.digest || await collectionDigest(manifest) !== receipt.application.digest
    || manifest.applicationId !== receipt.application.id || manifest.generation !== intent.generation
    || manifest.previousApplicationId !== null || !cmsEqual(manifest.scope, scope)
    || !cmsEqual(manifest.checkpoint, intent.expectedCheckpoint)) throw cmsUnavailable()
  return receipt
}

export { countsSchema as cmsAdoptionCountsSchema, principalSchema as cmsAdoptionPrincipalSchema, adoptionReceiptSchema as cmsAdoptionReceiptSchema, lock as lockCmsAdoption }
