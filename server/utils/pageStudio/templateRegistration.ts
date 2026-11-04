import { z } from 'zod'
import { sameCodeContent } from '~~/shared/pageStudio/codeContent'
import type { PageStudioCheckpointBucket } from '~~/shared/pageStudio/checkpointReader'
import type { PageStudioControlScope, PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import { TemplateActorSchema, type TemplateActor } from './templateCatalogue'
import { readTemplateRegistrationSource, verifyTemplateRegistrationSource, TemplateRegistrationError } from './templateRegistrationSource'

const Input = z.object({
  sourceSiteId: z.string().uuid(),
  sourceCheckpointId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  name: z.string().trim().min(1).max(160),
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()
const Scope = z.object({ tenantId: z.string().min(1).max(200), clientId: z.string().uuid(), siteId: z.string().uuid() }).strict()
export type AgencyTemplateActor = Extract<TemplateActor, { kind: 'agency' }>
export type RegisterTemplateVersionInput = z.infer<typeof Input>
export interface TemplateRegistrationDependencies {
  bucket: PageStudioCheckpointBucket
  runTransaction: RunPageStudioTransaction
  /** Trusted host code only. Must freshly establish mutation permission, original
   * session and server-bound tenant, and explicit approval of this exact source
   * for this catalogue slug. Lock mutable authority rows in this transaction.
   * Return source scope from native records, never browser-supplied identity.
   * Agency kind / PAGE_STUDIO_VIEW alone does not authorize registration.
   * No default implementation or HTTP adapter is provided in this increment. */
  authorize: (input: {
    actor: AgencyTemplateActor
    request: RegisterTemplateVersionInput
    db: PageStudioQueryClient
  }) => Promise<PageStudioControlScope>
}
export interface RegisteredTemplateVersion {
  templateId: string
  versionId: string
  format: 'code-pages'
  replayed: boolean
}
interface Entry { id: string, name: string, category: string, withdrawn_at: string | null }
interface Version {
  id: string
  format: string
  source_tenant_id: string
  source_client_id: string
  source_site_id: string
  source_checkpoint_id: string
  source_digest: string
  inventory_digest: string
  code_content: unknown
  provenance: unknown
}

/** Internal registration only: immutable private metadata, no grant, source
 * mutation, preview, public activation or editing capability. All dependencies
 * are supplied by trusted host code; this is not an authenticated transport. */
export async function registerTemplateVersion(
  rawActor: AgencyTemplateActor,
  rawInput: RegisterTemplateVersionInput,
  deps: TemplateRegistrationDependencies
): Promise<RegisteredTemplateVersion> {
  const parsedActor = TemplateActorSchema.safeParse(rawActor)
  const parsedInput = Input.safeParse(rawInput)
  if (!parsedActor.success || parsedActor.data.kind !== 'agency' || typeof deps.authorize !== 'function') {
    throw new TemplateRegistrationError('TEMPLATE_REGISTRATION_DENIED', 403)
  }
  if (!parsedInput.success) throw new TemplateRegistrationError('TEMPLATE_REGISTRATION_INVALID', 400)
  // Never retain caller-owned mutable objects across storage/authority awaits.
  const actor = parsedActor.data
  const request = parsedInput.data
  async function authorize(db: PageStudioQueryClient) {
    const result = Scope.safeParse(await deps.authorize({ actor: { ...actor }, request: { ...request }, db }))
    if (!result.success || result.data.tenantId !== actor.tenantId || result.data.siteId !== request.sourceSiteId) {
      throw new TemplateRegistrationError('TEMPLATE_REGISTRATION_DENIED', 403)
    }
    return result.data
  }
  const source = await deps.runTransaction(async (db) => {
    const scope = await authorize(db)
    return readTemplateRegistrationSource(db, scope, request.sourceCheckpointId, request.expectedDigest)
  })
  const verified = await verifyTemplateRegistrationSource(source, deps.bucket)
  const provenance = { schemaVersion: 1, kind: 'accepted-code-page-import', ...verified.provenance }
  return deps.runTransaction(async (db) => {
    const scope = await authorize(db)
    const current = await readTemplateRegistrationSource(db, scope, request.sourceCheckpointId, request.expectedDigest)
    if (!sameCodeContent(current, source)) throw new TemplateRegistrationError('TEMPLATE_SOURCE_CONFLICT', 409)
    // A unique owner/slug serializes both first registration and concurrent retry.
    await db.query(`INSERT INTO page_studio_template_entries(owner_tenant_id,slug,name)
      VALUES($1,$2,$3) ON CONFLICT(owner_tenant_id,slug) DO NOTHING`, [actor.tenantId, request.slug, request.name])
    const entry = (await db.query<Entry>(`SELECT id,name,category,withdrawn_at FROM page_studio_template_entries
      WHERE owner_tenant_id=$1 AND slug=$2 FOR UPDATE`, [actor.tenantId, request.slug])).rows[0]
    if (!entry || entry.withdrawn_at || entry.name !== request.name || entry.category !== 'automotive') {
      throw new TemplateRegistrationError('TEMPLATE_REGISTRATION_CONFLICT', 409)
    }
    const existing = (await db.query<Version>(`SELECT id,format,source_tenant_id,source_client_id,source_site_id,
        source_checkpoint_id,source_digest,inventory_digest,code_content,provenance
      FROM page_studio_template_versions WHERE template_id=$1 AND source_checkpoint_id=$2 AND source_digest=$3
      FOR SHARE`, [entry.id, request.sourceCheckpointId, request.expectedDigest])).rows[0]
    if (existing) {
      if (existing.format !== 'code-pages' || existing.source_tenant_id !== scope.tenantId
        || existing.source_client_id !== scope.clientId || existing.source_site_id !== scope.siteId
        || existing.inventory_digest !== verified.inventoryDigest
        || !sameCodeContent(existing.code_content, verified.codeContent) || !sameCodeContent(existing.provenance, provenance)) {
        throw new TemplateRegistrationError('TEMPLATE_REGISTRATION_CONFLICT', 409)
      }
      // Never restore withdrawn status, refresh visibility or rewind source state.
      if (!sameCodeContent(await authorize(db), scope)) throw new TemplateRegistrationError('TEMPLATE_REGISTRATION_DENIED', 403)
      return { templateId: entry.id, versionId: existing.id, format: 'code-pages', replayed: true }
    }
    const version = (await db.query<{ id: string }>(`INSERT INTO page_studio_template_versions
      (template_id,format,source_tenant_id,source_client_id,source_site_id,source_checkpoint_id,
        source_digest,inventory_digest,code_content,provenance)
      VALUES($1,'code-pages',$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) RETURNING id`,
    [entry.id, scope.tenantId, scope.clientId, scope.siteId, request.sourceCheckpointId,
      request.expectedDigest, verified.inventoryDigest, JSON.stringify(verified.codeContent), JSON.stringify(provenance)])).rows[0]
    if (!version) throw new TemplateRegistrationError('TEMPLATE_REGISTRATION_UNAVAILABLE', 503)
    await db.query('INSERT INTO page_studio_template_version_status(version_id) VALUES($1)', [version.id])
    if (!sameCodeContent(await authorize(db), scope)) throw new TemplateRegistrationError('TEMPLATE_REGISTRATION_DENIED', 403)
    return { templateId: entry.id, versionId: version.id, format: 'code-pages', replayed: false }
  })
}
