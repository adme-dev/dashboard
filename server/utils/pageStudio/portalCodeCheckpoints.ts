/** Invited-portal code-only transport. Source imports remain agency-only. */
import { createError } from 'h3'
import { z } from 'zod'
import { CodeContentBindingSchema, sameCodeContent, verifyCodePageImport } from '~~/shared/pageStudio/codeContent'
import type { PageStudioCheckpointBucket } from '~~/shared/pageStudio/checkpointReader'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import type { PageStudioSessionClaims } from '~~/shared/pageStudio/sessionClaims'
import { transaction } from '~~/server/utils/db'
import { readAcceptedCodeCheckpointHistory } from './codeCheckpointHistory'
import { PageStudioCheckpointCommitSchema } from './controlSchemas'
import { commitPageStudioCheckpoint } from './controlStore'
import { assertPageStudioSessionAuthority } from './sessionAuthority'
import { authorizePageStudioSession } from './sessions'

const denied = () => createError({ statusCode: 403, statusMessage: 'Saved template copy editing is unavailable.' })
const Pointer = z.object({ checkpointId: z.string().min(1).max(128), digest: z.string().regex(/^[a-f0-9]{64}$/),
  objectKey: z.string().min(1).max(1024), codeContent: CodeContentBindingSchema }).strict()

/** No catalogue/source grant is consulted after a destination copy is ready.
 * Caller owns the transaction; the site lock precedes all authority row locks. */
export async function readyPortalTemplateCopy(db: PageStudioQueryClient, claims: PageStudioSessionClaims) {
  await db.query('SELECT id FROM page_studio_sites WHERE tenant_id=$1 AND client_id=$2 AND id=$3 FOR NO KEY UPDATE', [claims.tenantId, claims.clientId, claims.siteId])
  const authorize = async () => {
    await assertPageStudioSessionAuthority(claims, 'workspace:checkpoint', { transaction: db })
    await assertPageStudioSessionAuthority(claims, claims.role === 'agency' ? 'source:edit' : 'workspace:reconnect', { transaction: db })
  }
  await authorize()
  const row = (await db.query<{ checkpointId: string, digest: string, objectKey: string, codeContent: unknown }>(`SELECT checkpoint.id AS "checkpointId", checkpoint.digest,
    checkpoint.object_key AS "objectKey", audit.metadata->'codeContent' AS "codeContent"
    FROM page_studio_template_copies copy
    JOIN page_studio_sites site ON site.tenant_id=copy.tenant_id AND site.client_id=copy.client_id AND site.id=copy.site_id
    JOIN page_studio_checkpoints checkpoint ON checkpoint.tenant_id=site.tenant_id AND checkpoint.client_id=site.client_id
      AND checkpoint.site_id=site.id AND checkpoint.id=site.current_checkpoint_id
    JOIN page_studio_audit_events audit ON audit.tenant_id=checkpoint.tenant_id AND audit.client_id=checkpoint.client_id
      AND audit.site_id=checkpoint.site_id AND audit.resource_id=checkpoint.id AND audit.resource_type='checkpoint'
      AND audit.action='workspace.checkpointed' AND audit.idempotency_key='control:checkpoint:'||checkpoint.id
      AND audit.metadata->>'commitProtocol'='cas-v1' AND audit.metadata->>'digest'=checkpoint.digest
      AND audit.metadata->>'authorId'=checkpoint.author_id::text
      AND jsonb_typeof(audit.metadata->'expectedCheckpointId')='string' AND audit.metadata->>'expectedCheckpointId'<>''
    WHERE copy.tenant_id=$1 AND copy.client_id=$2 AND copy.site_id=$3 AND copy.state='ready'
      AND site.status IN ('draft','active') AND site.delivery_mode='static'
    FOR SHARE OF copy,checkpoint,audit`, [claims.tenantId, claims.clientId, claims.siteId])).rows[0]
  const parsed = Pointer.safeParse(row)
  const pointer = parsed.success && parsed.data.objectKey === `tenants/${claims.tenantId}/clients/${claims.clientId}/sites/${claims.siteId}/checkpoints/${parsed.data.checkpointId}.json` ? parsed.data : null
  await authorize()
  return pointer
}

async function requireCopy(db: PageStudioQueryClient, claims: PageStudioSessionClaims) {
  if (claims.role !== 'client') throw denied()
  const pointer = await readyPortalTemplateCopy(db, claims)
  if (!pointer) throw denied()
  return pointer
}

export async function readPortalCodeCheckpoint(claims: PageStudioSessionClaims, run: RunPageStudioTransaction = transaction) {
  return run(async db => ({ checkpoint: await requireCopy(db, claims) }))
}
export async function readPortalCodeHistory(claims: PageStudioSessionClaims, run: RunPageStudioTransaction = transaction) {
  return run(async db => {
    await requireCopy(db, claims)
    const result = await readAcceptedCodeCheckpointHistory(db, claims)
    await requireCopy(db, claims)
    return result
  })
}

/** Trusted Sandbox submits only its prepared immutable manual-operation package.
 * Generic client commits/imports remain closed; this action cannot upgrade typed sites. */
export async function commitPortalCodeCheckpoint(raw: unknown, claims: PageStudioSessionClaims,
  dependencies: { runTransaction?: RunPageStudioTransaction, env?: Record<string, unknown> } = {}) {
  const parsed = PageStudioCheckpointCommitSchema.safeParse(raw)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid saved code checkpoint.' })
  const input = parsed.data
  const { checkpoint, expectedCheckpointId } = input
  if (claims.role !== 'client' || !checkpoint.codeContent || !expectedCheckpointId || checkpoint.checkpointId === expectedCheckpointId) throw denied()
  authorizePageStudioSession(claims, { checkpoint, authorRole: 'client', requiredCapabilities: ['workspace:checkpoint'] })
  const bucket = dependencies.env?.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket | undefined
  if (!bucket || typeof bucket.get !== 'function') throw denied()
  const run = dependencies.runTransaction ?? transaction
  const authorityAndBase = async (db: PageStudioQueryClient) => {
    await requireCopy(db, claims)
    const base = (await db.query<{ digest: string, code_content: unknown }>(`SELECT checkpoint.digest, audit.metadata->'codeContent' AS code_content
      FROM page_studio_checkpoints checkpoint JOIN page_studio_audit_events audit
        ON audit.tenant_id=checkpoint.tenant_id AND audit.client_id=checkpoint.client_id AND audit.site_id=checkpoint.site_id
        AND audit.resource_id=checkpoint.id AND audit.resource_type='checkpoint' AND audit.action='workspace.checkpointed'
        AND audit.idempotency_key='control:checkpoint:'||checkpoint.id
        AND audit.metadata->>'commitProtocol'='cas-v1' AND audit.metadata->>'digest'=checkpoint.digest
        AND audit.metadata->>'authorId'=checkpoint.author_id::text
        AND jsonb_typeof(audit.metadata->'expectedCheckpointId')='string' AND audit.metadata->>'expectedCheckpointId'<>''
      WHERE checkpoint.id=$1 AND checkpoint.tenant_id=$2 AND checkpoint.client_id=$3 AND checkpoint.site_id=$4
      FOR SHARE OF checkpoint,audit`, [expectedCheckpointId, claims.tenantId, claims.clientId, claims.siteId])).rows[0]
    const binding = CodeContentBindingSchema.safeParse(base?.code_content)
    if (!base || base.digest !== checkpoint.digest || !binding.success) throw denied()
    return binding.data
  }
  const before = await run(authorityAndBase)
  // Bounded storage verification runs outside SQL locks, then authority is refreshed.
  const verifiedCodeContent = await verifyCodePageImport(input, bucket)
  return run(async db => {
    const authorize = async (client: PageStudioQueryClient) => {
      if (!sameCodeContent(before, await authorityAndBase(client))) throw denied()
    }
    await authorize(db)
    const receipt = await commitPageStudioCheckpoint(input, { runTransaction: work => work(db), verifiedCodeContent, authorize })
    await requireCopy(db, claims)
    return receipt
  })
}
