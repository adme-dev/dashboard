import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { readAcceptedCodeCheckpointHistory } from '~~/server/utils/pageStudio/codeCheckpointHistory'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { assertPageStudioSessionAuthority } from '~~/server/utils/pageStudio/sessionAuthority'
import { resolvePageStudioSessionEnvironment, resolvePageStudioSessionPublicKey, verifyPageStudioSessionToken } from '~~/server/utils/pageStudio/sessions'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    requirePageStudioMachineAuth(event)
    if (!z.object({}).strict().safeParse(await readBody(event)).success) throw createError({ statusCode: 400 })
    const token = getHeader(event, 'x-page-studio-session')
    if (!token) throw createError({ statusCode: 401 })
    const claims = await verifyPageStudioSessionToken(token, resolvePageStudioSessionPublicKey(event), resolvePageStudioSessionEnvironment(event).issuer)
    if (claims.role !== 'agency') throw createError({ statusCode: 403 })
    return await transaction(async (db) => {
      await db.query('SELECT id FROM page_studio_sites WHERE tenant_id=$1 AND client_id=$2 AND id=$3 FOR NO KEY UPDATE', [claims.tenantId, claims.clientId, claims.siteId])
      await assertPageStudioSessionAuthority(claims, 'workspace:preview', { transaction: db })
      const result = await readAcceptedCodeCheckpointHistory(db, claims)
      await assertPageStudioSessionAuthority(claims, 'workspace:preview', { transaction: db })
      return result
    })
  } catch (error) { return pageStudioInternalHttpError(event, error) }
})
