import { WorkspaceTransferDraftSchema } from '../../../../shared/types/send'
import { requireWriteAccess } from '~~/server/utils/auth'
import {
  requireWorkspaceSendEnabled,
  resolveWorkspaceSendPolicyConfig
} from '~~/server/utils/send/feature'
import {
  createWorkspaceSendService,
  toWorkspaceSendHttpError
} from '~~/server/utils/send/workspace'

const service = createWorkspaceSendService()

export default defineEventHandler(async (event) => {
  requireWorkspaceSendEnabled(event)
  const user = await requireWriteAccess(event)
  const parsed = WorkspaceTransferDraftSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Invalid Send draft'
    })
  }

  try {
    const transfer = await service.createDraft({
      actor: { id: user.id, role: user.role },
      draft: parsed.data,
      policy: resolveWorkspaceSendPolicyConfig(event)
    })
    return { transfer }
  } catch (error) {
    throw toWorkspaceSendHttpError(error)
  }
})
