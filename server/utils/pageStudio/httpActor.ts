import type { H3Event } from 'h3'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { requireAgencyPageStudioAccess } from './access'
import type { PageStudioContentActor } from './businessContent'

/** Preserve native audience and VIEW/EDIT admission for the shared HTTP flows. */
export async function resolvePageStudioHttpActor(event: H3Event, audience: 'agency' | 'portal', writing: boolean): Promise<PageStudioContentActor> {
  let actor: PageStudioContentActor
  if (audience === 'agency') {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, writing ? 'PAGE_STUDIO_EDIT' : 'PAGE_STUDIO_VIEW')
    let canEdit = writing
    if (!canEdit) {
      try {
        await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
        canEdit = true
      } catch (error) {
        if ((error as { statusCode?: number })?.statusCode !== 403) throw error
      }
    }
    actor = { role: 'agency', actorId: user.id, tenantId, canEdit }
  } else {
    const user = await requireClientAuth(event)
    actor = { role: 'client', actorId: user.id, clientId: user.clientId }
  }
  return actor
}
