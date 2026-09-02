import { z } from 'zod'
import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { resolveGoogleAdsAccount } from '~~/server/utils/googleAds/accountResolution'
import { requireMeasurementClientAccess } from '~~/server/utils/measurement/access'
import { measurementReconciliationRepository } from '~~/server/utils/measurement/reconciliationRepository'

const QuerySchema = z.strictObject({
  accountQuery: z.string().trim().min(1).max(200).optional()
})

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  await requireMeasurementClientAccess(event, clientId, 'view')

  const parsed = QuerySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid reconciliation query' })
  }

  const accountResolution = parsed.data.accountQuery
    ? await resolveGoogleAdsAccount({
        query: parsed.data.accountQuery,
        aggregate: false,
        clientId
      })
    : null
  if (accountResolution?.status === 'resolved' && accountResolution.clientId !== clientId) {
    throw createError({ statusCode: 403, statusMessage: 'Account binding does not belong to this client' })
  }
  const account = accountResolution?.status === 'resolved' ? accountResolution.accounts[0] : null
  const reconciliation = await measurementReconciliationRepository.list({
    clientId,
    expectedAccountCustomerId: account?.operatingCustomerId ?? null,
    expectedAccountLabel: accountResolution?.status === 'resolved'
      ? accountResolution.matchedName
      : undefined
  })
  return { accountResolution, reconciliation }
})
