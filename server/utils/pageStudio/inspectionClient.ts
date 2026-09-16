import { createError } from 'h3'
import { PageStudioInspectionRequest, MAX_INSPECTION_BYTES } from '~~/shared/pageStudio/inspectionContract'
import type { PageStudioLaunchState } from '~~/shared/pageStudio/launchReadiness'
import type { PageStudioVersionComparison } from '~~/shared/pageStudio/versionComparison'

interface AgencyInput { tenantId: string, actorId: string, env?: Record<string, unknown> }
interface Input extends AgencyInput { siteId: string }
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Website inspection is unavailable. Try again.' })
async function inspect(input: AgencyInput & { siteId?: string, operation: 'launch' | 'comparison' | 'reviews', versionId?: string, releaseId?: string }) {
  const { env, ...scope } = input
  const request = PageStudioInspectionRequest.safeParse(Object.fromEntries(
    Object.entries({ ...scope, expectedEnvironment: env?.PAGE_STUDIO_RELEASE_ENVIRONMENT }).filter(([, value]) => value !== undefined)
  ))
  const service = env?.PAGE_STUDIO_MANAGEMENT as { inspectWebsite?: (request: unknown) => Promise<unknown> } | undefined
  if (!request.success || typeof service?.inspectWebsite !== 'function') throw unavailable()
  let response: unknown
  try {
    response = await service.inspectWebsite(request.data)
  } catch {
    throw unavailable()
  }
  if (!record(response)) throw unavailable()
  if (response.ok === false && typeof response.statusCode === 'number' && [400, 403, 404, 409, 413, 422, 503].includes(response.statusCode)) {
    throw createError({ statusCode: response.statusCode, statusMessage: response.statusCode === 409 ? 'Website changed. Refresh and review again.' : 'Website inspection could not be loaded.' })
  }
  if (response.ok !== true || !(response.payload instanceof Uint8Array) || response.payload.byteLength > MAX_INSPECTION_BYTES) throw unavailable()
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.payload))
  } catch {
    throw unavailable()
  }
  if (!record(parsed) || !record(parsed.request) || !record(parsed.value)) throw unavailable()
  const echoed = parsed.request
  if (Object.keys(echoed).length !== Object.keys(request.data).length || !Object.entries(request.data).every(([key, value]) => echoed[key] === value) || (input.operation === 'reviews' ? parsed.value.tenantId !== input.tenantId : parsed.value.siteId !== input.siteId)) throw unavailable()
  return parsed.value
}
export async function readPageStudioLaunchState(input: Input): Promise<PageStudioLaunchState> {
  const value = await inspect({ ...input, operation: 'launch' })
  if (!record(value.content) || !['ready', 'required', 'unavailable'].includes(String(value.content.status))
    || !record(value.plan) || !['ready', 'required'].includes(String(value.plan.status)) || !Array.isArray(value.activeReleases)
    || !(value.approvedVersionId === null || typeof value.approvedVersionId === 'string')) throw unavailable()
  return value as unknown as PageStudioLaunchState
}
export async function readPageStudioVersionComparison(input: Input & { versionId: string, releaseId?: string }): Promise<PageStudioVersionComparison> {
  const value = await inspect({ ...input, operation: 'comparison' })
  if (!record(value.version) || value.version.id !== input.versionId || typeof value.version.current !== 'boolean'
    || typeof value.version.digest !== 'string' || typeof value.version.checkpointId !== 'string'
    || !Array.isArray(value.releases) || !record(value.after) || value.after.id !== input.siteId
    || !(value.before === null || (record(value.before) && value.before.id === input.siteId))
    || !(value.live === null || (record(value.live) && typeof value.live.releaseId === 'string' && typeof value.live.digest === 'string'))) throw unavailable()
  return value as unknown as PageStudioVersionComparison
}

export async function listAgencyPageStudioReviews(input: AgencyInput) {
  const value = await inspect({ ...input, operation: 'reviews' })
  if (!Array.isArray(value.reviews)) throw unavailable()
  return value.reviews
}
