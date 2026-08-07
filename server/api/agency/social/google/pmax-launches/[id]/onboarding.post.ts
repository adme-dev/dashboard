import { z } from 'zod'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '~~/server/utils/auth'
import { parseGooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfigRuntime'
import { getGooglePmaxLaunch } from '~~/server/utils/googlePmaxLaunchStore'
import {
  createGooglePmaxOnboardingAttestation,
  GooglePmaxOnboardingAttestationError
} from '~~/server/utils/googlePmaxOnboardingAttestation'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

const BodySchema = z.strictObject({
  evidence: z.record(z.string(), z.unknown()),
  reason: z.string().trim().min(20).max(2000)
})

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'ADMIN')
  const tenantId = await getSelectedTenant(event)
  const launchId = getRouterParam(event, 'id')
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  if (!launchId) throw createError({ statusCode: 400, statusMessage: 'Launch ID is required' })
  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid onboarding attestation' })
  const launch = await getGooglePmaxLaunch({ launchId, tenantId })
  if (!launch) throw createError({ statusCode: 404, statusMessage: 'Launch plan not found' })
  await requireSocialClientAccess(event, launch.clientId)

  let config
  try {
    config = parseGooglePmaxInventoryLaunchConfig(launch.normalizedConfig)
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Stored launch configuration is invalid' })
  }
  try {
    return await createGooglePmaxOnboardingAttestation({
      launchId,
      tenantId,
      actorId: user.id,
      configVersion: launch.configVersion,
      configHash: launch.configHash,
      config,
      evidence: parsed.data.evidence,
      reason: parsed.data.reason
    })
  } catch (error: unknown) {
    if (error instanceof GooglePmaxOnboardingAttestationError) {
      const statusCode = error.code === 'PMAX_ONBOARDING_ATTESTATION_INVALID' ? 400 : 409
      throw createError({ statusCode, statusMessage: error.message })
    }
    throw error
  }
})
