import { getLatestPageStudioCheckpoint } from './checkpointRead'
import { assertCustomerEditorSessionAuthority } from './customerEditorSessionAuthority'
import type { CustomerEditorClaims } from './customerEditorToken'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

/** Same native read transaction for local and placed callers. No storage I/O. */
export function readNativeCustomerEditorCheckpoint(claims: CustomerEditorClaims, run: RunPageStudioTransaction) {
  return run(async (db) => {
    await assertCustomerEditorSessionAuthority(claims, 'workspace:reconnect', db)
    const checkpoint = await getLatestPageStudioCheckpoint(claims, { queryOne: async <T>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows[0] ?? null })
    await assertCustomerEditorSessionAuthority(claims, 'workspace:reconnect', db)
    return checkpoint
  })
}
