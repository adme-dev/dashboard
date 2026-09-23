import { z } from 'zod'
import type { PageStudioControlQueryClient } from './controlStore'
import type { PageStudioSessionClaims } from './sessions'

const common = {
  formatVersion: z.literal(1),
  environment: z.enum(['staging', 'production']),
  userId: z.string().uuid(), role: z.enum(['agency', 'client']),
  loginSessionHash: z.string().regex(/^[a-f0-9]{64}$/)
}
export const CheckpointStagingOriginSchema = z.discriminatedUnion('source', [
  z.object({ ...common, source: z.literal('native-login') }).strict(),
  z.object({ ...common, source: z.literal('studio-session'), nonce: z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/) }).strict(),
  z.object({ ...common, source: z.literal('provisioning'), requestKey: z.string().min(1).max(200), proposalRevision: z.number().int().positive() }).strict()
])
export type CheckpointStagingOrigin = z.infer<typeof CheckpointStagingOriginSchema>

/** Internal audit provenance, NOT a grant. Only a freshly authorized checkpoint
 * transaction may retain this. Consumers must recheck the original login, child
 * session/proposal, checkpoint, scope and package before any staging effect.
 * Missing rollout configuration omits provenance; it must not fail a page save. */
export function checkpointStagingOrigin(input: unknown): CheckpointStagingOrigin | null {
  const result = CheckpointStagingOriginSchema.safeParse(input)
  return result.success ? result.data : null
}

/** Called inside the checkpoint transaction after its session authority check.
 * The parent hash comes from the retained child, never from an editor payload. */
export async function editorCheckpointStagingOrigin(db: PageStudioControlQueryClient, claims: PageStudioSessionClaims, environment: unknown) {
  if (!common.environment.safeParse(environment).success) return null
  const rows = (await db.query<{ login_session_hash: string }>(`SELECT login_session_hash FROM page_studio_sessions
    WHERE nonce=$1 AND user_id=$2 AND role=$3 AND tenant_id=$4 AND client_id=$5 AND site_id=$6`,
  [claims.nonce, claims.userId, claims.role, claims.tenantId, claims.clientId, claims.siteId])).rows
  if (rows.length !== 1) return null
  return checkpointStagingOrigin({ formatVersion: 1, environment, source: 'studio-session', userId: claims.userId,
    role: claims.role, nonce: claims.nonce, loginSessionHash: rows[0]!.login_session_hash })
}
