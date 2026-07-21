import { z } from 'zod'
import { WorkspaceDownloadRequestSchema } from '../../../../../../../shared/types/send'
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
  const transferId = IdSchema.safeParse(getRouterParam(event, 'id'))
  const fileId = IdSchema.safeParse(getRouterParam(event, 'fileId'))
  if (!transferId.success || !fileId.success) {
    throw createError({ statusCode: 404, statusMessage: 'Transfer not found' })
  }
  const parsed = WorkspaceDownloadRequestSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Invalid download request' })
  }

  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
  try {
    return await service.createDownload({
      actor: { id: user.id, role: user.role },
      transferId: transferId.data,
      fileId: fileId.data,
      ...parsed.data
    })
  } catch (error) {
    throw toInternalSendHttpError(error)
  }
})
