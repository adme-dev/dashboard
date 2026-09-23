import { z } from 'zod'
import type { PageStudioControlQueryClient } from './controlStore'
import type { PageStudioSessionClaims } from './sessions'

import { CheckpointStagingOriginSchema, type CheckpointStagingOrigin } from '~~/shared/pageStudio/checkpointStagingOrigin'

export { CheckpointStagingOriginSchema, type CheckpointStagingOrigin } from '~~/shared/pageStudio/checkpointStagingOrigin'

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
  if (!z.enum(['staging', 'production']).safeParse(environment).success) return null
  const rows = (await db.query<{ login_session_hash: string }>(`SELECT login_session_hash FROM page_studio_sessions
    WHERE nonce=$1 AND user_id=$2 AND role=$3 AND tenant_id=$4 AND client_id=$5 AND site_id=$6`,
  [claims.nonce, claims.userId, claims.role, claims.tenantId, claims.clientId, claims.siteId])).rows
  if (rows.length !== 1) return null
  return checkpointStagingOrigin({ formatVersion: 1, environment, source: 'studio-session', userId: claims.userId,
    role: claims.role, nonce: claims.nonce, loginSessionHash: rows[0]!.login_session_hash })
}
