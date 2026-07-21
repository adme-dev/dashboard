import { z } from 'zod'
import { WorkspaceUploadCompleteSchema } from '../../../../../../../../../shared/types/send'
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
  const body = WorkspaceUploadCompleteSchema.safeParse(await readBody(event))
  if (!params.success || !body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid upload completion request' })
  }

  try {
    const file = await service.completeIntent({
      actor: { id: user.id, role: user.role },
      ...params.data,
      capability: body.data.capability
    })
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return { file }
  } catch (error) {
    return toWorkspaceSendUploadHttpError(error)
  }
})
