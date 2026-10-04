import { readBody } from 'h3'
import { transaction } from '~~/server/utils/db'
import { appendGodModeAuditEvent } from '~~/server/utils/godMode/audit'
import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'
import { defineGodModeTransactionOperation, prepareGodModeTransactionMutation } from '~~/server/utils/godMode/transactionCoordinator'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

export const BANNER_SOCIAL_DRAFT = defineGodModeTransactionOperation({
  routeOrTool: 'POST /api/agency/banner-studio/social-draft',
  mutationName: 'banner social draft',
  missingResultMessage: 'Banner social draft did not produce a durable result'
})

export function registerGodModeBannerSocialDraftFamily() {
  return registerGodModeMutationFamily({
    family: 'banner-social-draft', method: 'POST',
    matchesPath: path => path === '/api/agency/banner-studio/social-draft',
    prepare: event => prepareGodModeTransactionMutation(event, BANNER_SOCIAL_DRAFT, {
      transaction, appendAudit: appendGodModeAuditEvent,
      digestRequest: async request => digestMcpRequestBody(await readBody(request))
    })
  })
}
