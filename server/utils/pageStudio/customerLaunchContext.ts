import { transaction } from '~~/server/utils/db'
import { readCustomerSession } from './customerSignup'
import { requireCustomerInspectionAuthority } from '~~/shared/pageStudio/customerInspectionAuthority'
import type { RunPageStudioTransaction } from './sites'

/** Resolve from a genuine current native login, never from portal cookies or
 * client-supplied ownership. Repeat after every remote launch-status read. */
export function readCustomerLaunchContext(token: string, siteId: string, run: RunPageStudioTransaction = transaction) {
  return run(async (db) => {
    const user = await readCustomerSession(token, callback => callback(db))
    const input = { actorId: user.identityId, accountId: user.accountId, siteId }
    const scope = await requireCustomerInspectionAuthority(db, input)
    return { actor: { ...input, workspaceId: scope.workspaceId }, scope }
  })
}
