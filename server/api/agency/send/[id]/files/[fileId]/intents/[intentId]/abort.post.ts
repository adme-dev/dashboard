import { z } from 'zod'
import { WorkspaceUploadAbortSchema } from '../../../../../../../../../shared/types/send'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireWorkspaceSendEnabled } from '~~/server/utils/send/feature'
import {
  createWorkspaceSendUploadService,
  toWorkspaceSendUploadHttpError
} from '~~/server/utils/send/uploads'

const service = createWorkspaceSendUploadService()
const RouteParamsSchema = z.object({
  transferId: z.string().uuid(),
  fileId: z.string().uuid(),
  intentId: z.string().uuid()
}).strict()

export default defineEventHandler(async (event) => {
  requireWorkspaceSendEnabled(event)
  const user = await requireWriteAccess(event)
  const params = RouteParamsSchema.safeParse({
    transferId: getRouterParam(event, 'id'),
    fileId: getRouterParam(event, 'fileId'),
    intentId: getRouterParam(event, 'intentId')
  })
  const body = WorkspaceUploadAbortSchema.safeParse(await readBody(event))
  if (!params.success || !body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid upload abort request' })
  }

  try {
    const result = await service.abortIntent({
      actor: { id: user.id, role: user.role },
      ...params.data,
      capability: body.data.capability
    })
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return result
  } catch (error) {
    return toWorkspaceSendUploadHttpError(error)
  }
})
