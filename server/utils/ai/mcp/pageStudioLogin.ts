import type { H3Event } from 'h3'
import { transaction } from '~~/server/utils/db'
import { bindPageStudioLoginSession, resolvePageStudioLoginSession } from '~~/server/utils/pageStudio/loginSessions'
import { parseMcpPageStudioLogin, type McpPageStudioLoginProof } from '~~/shared/utils/mcpPageStudioLogin'

/** Optional Studio transport proof, derived only from the genuine app JWT at consent. */
export async function captureMcpPageStudioLogin(event: H3Event, userId: string): Promise<McpPageStudioLoginProof | undefined> {
  try {
    return await transaction(async (db) => {
      const login = await resolvePageStudioLoginSession(db, event, 'agency', userId)
      const proof = parseMcpPageStudioLogin({ ...login, issuedAt: login.issuedAt.getTime(), expiresAt: login.expiresAt.getTime() }, userId)
      if (!proof || proof.issuedAt > Date.now() || proof.expiresAt <= Date.now()) return undefined
      // Existing tombstones cannot be revived. Native authority rechecks this exact row at use.
      await bindPageStudioLoginSession(db, login)
      return proof
    })
  } catch {
    // Ordinary MCP grants remain available; Studio requires reconnect instead of fabricated login.
    return undefined
  }
}
