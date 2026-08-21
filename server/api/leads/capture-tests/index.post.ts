import { requireRole, requireWriteAccess } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { leadCaptureTestService } from '~~/server/utils/leads/captureTestService'

export default defineEventHandler(async (event) => {
  const actor = await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  await requireWriteAccess(event)
  const created = await leadCaptureTestService.create(await readBody(event), actor.id)
  setResponseStatus(event, 201)
  return {
    run: created.run,
    bootstrapToken: created.bootstrapToken,
    expiresAt: created.run.expiresAt
  }
})
