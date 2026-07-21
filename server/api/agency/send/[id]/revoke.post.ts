import { z } from 'zod'
import { WorkspaceTransferActionSchema } from '../../../../../shared/types/send'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireWorkspaceSendEnabled } from '~~/server/utils/send/feature'
import {
  createInternalSendService,
  toInternalSendHttpError
} from '~~/server/utils/send/internalLifecycle'

const IdSchema = z.string().uuid()
const service = createInternalSendService()

export default defineEventHandler(async (event) => {
  requireWorkspaceSendEnabled(event)
  const user = await requireWriteAccess(event)
  const parsedId = IdSchema.safeParse(getRouterParam(event, 'id'))
  if (!parsedId.success) throw createError({ statusCode: 404, statusMessage: 'Transfer not found' })
  const parsed = WorkspaceTransferActionSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Invalid revocation request' })
  }

  try {
    return {
      transfer: await service.revoke({
        actor: { id: user.id, role: user.role },
        transferId: parsedId.data,
        ...parsed.data
      })
    }
  } catch (error) {
    throw toInternalSendHttpError(error)
  }
})
