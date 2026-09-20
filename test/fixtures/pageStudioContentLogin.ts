import type { PageStudioContentActor } from '~~/server/utils/pageStudio/businessContent'

export function contentLogin(actor: Pick<PageStudioContentActor, 'role' | 'actorId'>) {
  return { role: actor.role, userId: actor.actorId, tokenHash: (actor.role === 'agency' ? 'a' : 'b').repeat(64),
    issuedAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() + 3_600_000) }
}
