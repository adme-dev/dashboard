import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { requireWorkspaceSendEnabled } from '~~/server/utils/send/feature'
import {
  createInternalSendService,
  toInternalSendHttpError
} from '~~/server/utils/send/internalLifecycle'

const IdSchema = z.string().uuid()
const service = createInternalSendService()

export default defineEventHandler(async (event) => {
  requireWorkspaceSendEnabled(event)
  const user = await requireAuth(event)
  const parsedId = IdSchema.safeParse(getRouterParam(event, 'id'))
  if (!parsedId.success) throw createError({ statusCode: 404, statusMessage: 'Transfer not found' })

  try {
    return {
      transfer: await service.getDetail({
        actor: { id: user.id, role: user.role },
        transferId: parsedId.data
      })
    }
  } catch (error) {
    throw toInternalSendHttpError(error)
  }
})
