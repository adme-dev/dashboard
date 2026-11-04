import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { applyDesignBrand, applyDesignLock, DesignBrandRequestSchema, designLockTargets } from '../../../shared/emailRendering/designBrand'
import { emailBrandDefaults } from '../../../shared/emailRendering/designBrandDefaults'
import { validateEmailDesign } from '../../../shared/emailRendering/designContract'
import { designDigest } from '../../../shared/emailRendering/designModules'
import { DesignRevisionError, saveDerivedTemplateDesignDraft, type DesignDb, type DesignTransaction } from './designRevisions'
import { getTemplateDesignDraft } from './designReads'
import type { ModuleAuthority } from './designModules'
import type { EmailRendererClient } from '../../../shared/emailRendering/contract'

type Kit = { id: string, client_id: string | null, name: string, colors: unknown, fonts: unknown, logos: unknown, guidelines: string | null, is_default: boolean }
const kitContent = (kit: Kit) => ({ name: kit.name, colors: kit.colors, fonts: kit.fonts, logos: kit.logos, guidelines: kit.guidelines })
function assertKitScope(kit: Kit | undefined, scope: string | null): asserts kit is Kit {
  if (!kit || (kit.client_id !== null && kit.client_id !== scope)) throw new DesignRevisionError('NOT_FOUND')
}
async function kitChoice(kit: Kit) {
  return { id: kit.id, name: kit.name, shared: kit.client_id === null, isDefault: kit.is_default, digest: await designDigest(kitContent(kit)), defaults: emailBrandDefaults(kit) }
}

/** Read only; opening a panel neither applies defaults nor creates a version. */
export async function readDesignBrandOptions(draftId: string, authority: ModuleAuthority, db: DesignDb) {
  const draft = await getTemplateDesignDraft(draftId, authority.read, db)
  if (draft.state !== 'structured' || draft.projection.state !== 'current') throw new DesignRevisionError('STRUCTURED_REVISION_REQUIRED')
  const scope = draft.source.scope.clientId
  await authority.designer(scope)
  const kits = (await db.query('SELECT id,client_id,name,colors,fonts,logos,guidelines,is_default FROM brand_kits WHERE client_id=$1::uuid OR client_id IS NULL ORDER BY (client_id IS NOT NULL) DESC,is_default DESC,name,id', [scope])).rows as Kit[]
  let canManageLocks = false
  try {
    await authority.publisher(scope)
    canManageLocks = true
  } catch (error) {
    if (!(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 403)) throw error
  }
  // The existing is_default/client-first rule is the sole selection owner.
  const defaultKit = kits.find(kit => kit.is_default)
  return { draftId, revisionId: draft.headRevisionId, brand: draft.source.source.brand ?? null, kits: await Promise.all(kits.map(kitChoice)), defaultKitId: defaultKit?.id ?? null, canManageLocks, lockTargets: canManageLocks ? designLockTargets(draft.source) : [] }
}

/** Reuses the canonical immutable writer and receipt. Requests are separately
 * bound to the same receipt digest before deriving source from the NAMED base,
 * including replay after a newer head/kit exists. No automatic write retries. */
export async function executeDesignBrand(input: unknown, authority: ModuleAuthority, renderer: EmailRendererClient, transaction: DesignTransaction = cb => transactionWithoutRetry(db => cb(db))) {
  const request = DesignBrandRequestSchema.parse(input)
  z.string().uuid().parse(authority.actorId)
  const digest = await designDigest({ boundary: 'email-brand-lock-v1', request })
  return transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${authority.actorId}:${request.operationId}`])
    const identity = (await db.query('SELECT template_id,client_id FROM email_design_documents WHERE id=$1', [request.draftId])).rows[0] as { template_id: string | null, client_id: string | null } | undefined
    if (!identity?.template_id) throw new DesignRevisionError('NOT_FOUND')
    const owner = (await db.query('SELECT client_id,template_kind FROM edm_templates WHERE id=$1 FOR UPDATE', [identity.template_id])).rows[0] as { client_id: string | null, template_kind: string } | undefined
    const head = (await db.query('SELECT head_revision_id FROM email_design_documents WHERE id=$1 FOR UPDATE', [request.draftId])).rows[0] as { head_revision_id: string } | undefined
    if (!owner || !head || owner.client_id !== identity.client_id) throw new DesignRevisionError('NOT_FOUND')
    const authorize = request.command === 'set-design-lock' ? authority.publisher : authority.designer
    await authorize(identity.client_id)
    await authority.read(identity.client_id)
    // Scope is checked even on replays. Shared kits are readable to an already
    // authorised scoped creative, as in existing brandKitReadAccess.
    let kit: Kit | undefined
    if (request.command === 'apply-brand') {
      kit = (await db.query('SELECT id,client_id,name,colors,fonts,logos,guidelines,is_default FROM brand_kits WHERE id=$1 FOR UPDATE', [request.kitId])).rows[0] as Kit | undefined
      assertKitScope(kit, identity.client_id)
    }
    const receipt = (await db.query('SELECT document_id,revision_id,payload_sha256 FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2', [authority.actorId, request.operationId])).rows[0] as { document_id: string, revision_id: string, payload_sha256: string } | undefined
    if (receipt) {
      if (receipt.document_id !== request.draftId || receipt.payload_sha256 !== digest) throw new DesignRevisionError('IDEMPOTENCY_CONFLICT')
      return { documentId: receipt.document_id, revisionId: receipt.revision_id, published: false as const }
    }
    if (owner.template_kind !== 'draft') throw new DesignRevisionError('TEMPLATE_DRAFT_REQUIRED')
    if (head.head_revision_id !== request.expectedRevisionId) throw new DesignRevisionError('REVISION_CONFLICT')
    // Never derive a retry from a mutable/new head. This exact expected revision
    // must still be current for a new write; settled replay uses the receipt.
    const expected = (await db.query('SELECT schema_version,payload FROM email_design_revisions WHERE document_id=$1 AND id=$2', [request.draftId, request.expectedRevisionId])).rows[0] as { schema_version: number, payload: unknown } | undefined
    if (expected?.schema_version !== 1) throw new DesignRevisionError('STRUCTURED_REVISION_REQUIRED')
    const source = validateEmailDesign(expected.payload)
    if (source.scope.clientId !== identity.client_id || source.kind !== 'template') throw new DesignRevisionError('SCOPE_MISMATCH')
    const draft = await getTemplateDesignDraft(request.draftId, authority.read, db)
    if (draft.state !== 'structured' || draft.projection.state !== 'current') throw new DesignRevisionError('STRUCTURED_REVISION_REQUIRED')
    if (source.source.nativeArtifact !== null) throw new DesignRevisionError('STRUCTURED_REVISION_REQUIRED')
    let next
    if (request.command === 'apply-brand') {
      assertKitScope(kit, identity.client_id)
      const content = kitContent(kit)
      if (await designDigest(content) !== request.kitDigest) throw new DesignRevisionError('REVISION_CONFLICT')
      // Existing brand versions are snapshots BEFORE edit. Pin the exact chosen
      // content in that same store, under the kit row lock used by kit writers.
      let version = (await db.query('SELECT id,version FROM brand_kit_versions WHERE brand_kit_id=$1 AND snapshot=$2::jsonb ORDER BY version DESC LIMIT 1', [kit.id, JSON.stringify(content)])).rows[0] as { id: string, version: number } | undefined
      if (!version) version = (await db.query(`INSERT INTO brand_kit_versions(brand_kit_id,version,snapshot,note,created_by)
        VALUES ($1,COALESCE((SELECT MAX(version) FROM brand_kit_versions WHERE brand_kit_id=$1),0)+1,$2::jsonb,'Email defaults snapshot',$3) RETURNING id,version`, [kit.id, JSON.stringify(content), authority.actorId])).rows[0] as { id: string, version: number }
      next = applyDesignBrand(source, { kitId: kit.id, versionId: version.id, version: version.version, name: kit.name, defaults: emailBrandDefaults(content) })
    } else next = applyDesignLock(source, request.lock)
    const saved = await saveDerivedTemplateDesignDraft({ documentId: request.draftId, actorId: authority.actorId, operationId: request.operationId, expectedRevisionId: request.expectedRevisionId, design: next }, authorize, renderer, digest, cb => cb(db), { authorizeModuleRead: (_id, scope) => authority.read(scope) })
    return { ...saved, published: false as const }
  })
}
