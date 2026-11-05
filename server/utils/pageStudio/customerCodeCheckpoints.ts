import { createError } from 'h3'
import { CodeContentBindingSchema, sameCodeContent, verifyCodePageImport } from '~~/shared/pageStudio/codeContent'
import type { PageStudioCheckpointBucket } from '~~/shared/pageStudio/checkpointReader'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import { transaction } from '~~/server/utils/db'
import { PageStudioCheckpointCommitSchema } from './controlSchemas'
import { commitPageStudioCheckpoint } from './controlStore'
import { readNativeCustomerEditorCheckpoint } from './customerEditorCheckpointRead'
import { assertCustomerEditorSessionAuthority, parseCustomerEditorClaims } from './customerEditorSessionAuthority'

const denied = () => createError({ statusCode: 403, statusMessage: 'Customer code-page editing is unavailable.' })
interface Dependencies {
  runTransaction?: RunPageStudioTransaction
  assertWorkspace?: (workspaceId: string) => void
  env?: Record<string, unknown>
}

/** Separate metadata read; ordinary typed readers are not widened. */
export async function readCustomerCodeCheckpoint(rawClaims: unknown, dependencies: Dependencies = {}) {
  const claims = parseCustomerEditorClaims(rawClaims)
  dependencies.assertWorkspace?.(claims.workspaceId)
  const pointer = await readNativeCustomerEditorCheckpoint(claims, dependencies.runTransaction ?? transaction)
  dependencies.assertWorkspace?.(claims.workspaceId)
  return pointer?.codeContent ? pointer : null
}

/** Only the trusted service's immutable prepared package may enter this action.
 * The browser never supplies raw code, a review, or a verified-content assertion. */
export async function commitCustomerCodeCheckpoint(raw: unknown, rawClaims: unknown, dependencies: Dependencies = {}) {
  const parsed = PageStudioCheckpointCommitSchema.safeParse(raw)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid customer code-page checkpoint.' })
  const input = parsed.data
  const claims = parseCustomerEditorClaims(rawClaims)
  const { checkpoint, expectedCheckpointId } = input
  if (!checkpoint.codeContent || !expectedCheckpointId || checkpoint.checkpointId === expectedCheckpointId
    || checkpoint.userId !== claims.userId || checkpoint.scope.tenantId !== claims.tenantId
    || checkpoint.scope.clientId !== claims.clientId || checkpoint.scope.siteId !== claims.siteId
    || dependencies.env?.PAGE_STUDIO_CONTENT_ENVIRONMENT !== claims.environment) throw denied()
  const bucket = dependencies.env?.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket | undefined
  if (!bucket || typeof bucket.get !== 'function') throw denied()
  const run = dependencies.runTransaction ?? transaction
  const authorityAndBase = async (db: PageStudioQueryClient) => {
    const authority = await assertCustomerEditorSessionAuthority(claims, 'workspace:checkpoint', db)
    dependencies.assertWorkspace?.(claims.workspaceId)
    const base = (await db.query<{ digest: string, code_content: unknown }>(`SELECT checkpoint.digest, audit.metadata->'codeContent' AS code_content
      FROM page_studio_checkpoints checkpoint
      JOIN page_studio_audit_events audit ON audit.tenant_id=checkpoint.tenant_id AND audit.client_id=checkpoint.client_id
        AND audit.site_id=checkpoint.site_id AND audit.resource_id=checkpoint.id
        AND audit.action='workspace.checkpointed' AND audit.resource_type='checkpoint'
        AND audit.idempotency_key='control:checkpoint:' || checkpoint.id
      WHERE checkpoint.id=$1 AND checkpoint.tenant_id=$2 AND checkpoint.client_id=$3 AND checkpoint.site_id=$4
      FOR SHARE OF checkpoint`, [expectedCheckpointId, claims.tenantId, claims.clientId, claims.siteId])).rows[0]
    // Manual code edits preserve the compatibility manifest; converting typed
    // sites or replacing the compatibility document belongs to another action.
    if (!base || base.digest !== checkpoint.digest) throw denied()
    const binding = CodeContentBindingSchema.safeParse(base.code_content)
    if (!binding.success) throw denied()
    return { handoffId: authority.handoffId, digest: base.digest, codeContent: binding.data }
  }
  const before = await run(authorityAndBase)
  // No SQL locks are held during bounded private storage verification. The
  // native verifier checks envelope, operation, review, package, index and bytes.
  const verifiedCodeContent = await verifyCodePageImport(input, bucket)
  return run(async (db) => {
    const after = await authorityAndBase(db)
    if (after.handoffId !== before.handoffId || after.digest !== before.digest || !sameCodeContent(after.codeContent, before.codeContent)) throw denied()
    const receipt = await commitPageStudioCheckpoint(input, {
      runTransaction: work => work(db),
      verifiedCodeContent,
      customerEditor: { sessionId: claims.nonce, userId: claims.userId, workspaceId: claims.workspaceId, handoffId: after.handoffId },
      authorize: async (client) => {
        const current = await authorityAndBase(client)
        if (current.handoffId !== before.handoffId || !sameCodeContent(current.codeContent, before.codeContent)) throw denied()
      }
    })
    await assertCustomerEditorSessionAuthority(claims, 'workspace:checkpoint', db)
    dependencies.assertWorkspace?.(claims.workspaceId)
    return receipt
  })
}
