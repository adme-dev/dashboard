import { z } from 'zod'
import { WorkspaceUploadIntentRequestSchema } from '../../../../../../shared/types/send'
import { requireWriteAccess } from '~~/server/utils/auth'
import {
  requireWorkspaceSendEnabled,
  resolveWorkspaceSendMultipartConfig,
  resolveWorkspaceSendUploadIntentTtlSeconds
} from '~~/server/utils/send/feature'
import {
  createWorkspaceSendUploadService,
  toWorkspaceSendUploadHttpError
} from '~~/server/utils/send/uploads'

const service = createWorkspaceSendUploadService()
const TransferIdSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  requireWorkspaceSendEnabled(event)
  const user = await requireWriteAccess(event)
  const transferId = TransferIdSchema.safeParse(getRouterParam(event, 'id'))
  const body = WorkspaceUploadIntentRequestSchema.safeParse(await readBody(event))
  if (!transferId.success || !body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid upload intent request' })
  }

  try {
    const response = await service.createIntent({
      actor: { id: user.id, role: user.role },
      transferId: transferId.data,
      declaration: body.data,
      ttlSeconds: resolveWorkspaceSendUploadIntentTtlSeconds(event),
      multipart: resolveWorkspaceSendMultipartConfig(event)
    })
    setResponseHeader(event, 'Cache-Control', 'no-store')
    setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
    return response
  } catch (error) {
    return toWorkspaceSendUploadHttpError(error)
  }
})
