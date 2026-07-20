import { WorkspaceTransferListQuerySchema } from '../../../../shared/types/send'
import { requireAuth } from '~~/server/utils/auth'
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
  const user = await requireAuth(event)
  const parsed = WorkspaceTransferListQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Invalid Send filters'
    })
  }

  try {
    const policy = resolveWorkspaceSendPolicyConfig(event)
    const result = await service.list({
      actor: { id: user.id, role: user.role },
      ...parsed.data
    })
    return {
      ...result,
      policy: {
        defaultRetentionDays: policy.defaultRetentionDays,
        maxRetentionDays: policy.maxRetentionDays,
        maxRecipients: policy.maxRecipients,
        maxDownloads: policy.maxDownloads,
        maxTransferBytes: policy.maxTransferBytes,
        maxFileBytes: policy.maxFileBytes,
        maxFiles: policy.maxFiles
      }
    }
  } catch (error) {
    throw toWorkspaceSendHttpError(error)
  }
})
