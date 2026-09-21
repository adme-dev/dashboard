import type { H3Event } from 'h3'
import { transactionWithoutRetry } from '~~/server/utils/db'
import type { PageStudioContentActor } from './businessContent'
import { bindPageStudioLoginSession, resolvePageStudioLoginSession } from './loginSessions'

/** Bind the authenticated browser login, preserving logout tombstones. Content
 * admission separately checks current owner, role and native-session state. */
export function preparePageStudioContentLogin(event: H3Event, actor: PageStudioContentActor) {
  return transactionWithoutRetry(async (db) => {
    const login = await resolvePageStudioLoginSession(db, event, actor.role, actor.actorId)
    await bindPageStudioLoginSession(db, login)
    return login
  })
}
