import { z } from 'zod'
import { WorkspaceUploadMultipartResumeSchema } from '../../../../../../../../../../shared/types/send'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireWorkspaceSendEnabled } from '~~/server/utils/send/feature'
import {
  createWorkspaceSendUploadService,
  toWorkspaceSendUploadHttpError
} from '~~/server/utils/send/uploads'

const service = createWorkspaceSendUploadService()
const IdSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  requireWorkspaceSendEnabled(event)
  const user = await requireWriteAccess(event)
  const transferId = IdSchema.safeParse(getRouterParam(event, 'id'))
  const fileId = IdSchema.safeParse(getRouterParam(event, 'fileId'))
  const intentId = IdSchema.safeParse(getRouterParam(event, 'intentId'))
  const body = WorkspaceUploadMultipartResumeSchema.safeParse(await readBody(event))
  if (!transferId.success || !fileId.success || !intentId.success || !body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid multipart resume request' })
  }

  try {
    const response = await service.resumeMultipartIntent({
      actor: { id: user.id, role: user.role },
      transferId: transferId.data,
      fileId: fileId.data,
      intentId: intentId.data,
      capability: body.data.capability
    })
    setResponseHeader(event, 'Cache-Control', 'no-store')
    setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
    return response
  } catch (error) {
    return toWorkspaceSendUploadHttpError(error)
  }
})
