import { transaction } from '~~/server/utils/db'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import { assertCustomerEditorSessionAuthority, parseCustomerEditorClaims } from './customerEditorSessionAuthority'
import { readAcceptedCodeCheckpointHistory } from './codeCheckpointHistory'

export function readCustomerCodeCheckpointHistory(rawClaims: unknown, run: RunPageStudioTransaction = transaction) {
  const claims = parseCustomerEditorClaims(rawClaims)
  return run(async (db) => {
    await assertCustomerEditorSessionAuthority(claims, 'workspace:preview', db)
    const result = await readAcceptedCodeCheckpointHistory(db, claims)
    await assertCustomerEditorSessionAuthority(claims, 'workspace:preview', db)
    return result
  })
}
