import { queryOne as dbQueryOne } from '~~/server/utils/db'
import { getSocialDashboardClient } from './config'

type QueryOne = typeof dbQueryOne

export interface ResolveDealerFeedOrganizationInput {
  clientId: string
  actingUserEmail: string
  sellerRefs?: string[]
  platforms?: string[]
  externalOrgId?: string
}

function nonEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map(nonEmpty).filter(Boolean)))
}

export async function resolveDealerFeedOrganization(
  input: ResolveDealerFeedOrganizationInput,
  deps: {
    queryOne?: QueryOne
    socialDashboardClient?: Awaited<ReturnType<typeof getSocialDashboardClient>>
    runtimeEnv?: Record<string, string | undefined>
    env?: Record<string, string | undefined>
    fetchImpl?: typeof fetch
  } = {}
): Promise<string> {
  const explicitOrgId = nonEmpty(input.externalOrgId)
  if (explicitOrgId) return explicitOrgId

  const clientId = nonEmpty(input.clientId)
  if (!clientId) throw new Error('clientId is required')

  const queryOne = deps.queryOne ?? dbQueryOne
  const client = await queryOne<{ id: string, name: string }>(
    `SELECT id, name FROM agency_clients WHERE id = $1 AND is_active = true`,
    [clientId]
  )
  if (!client) throw new Error('agency client not found')

  const socialDashboardClient = deps.socialDashboardClient ?? await getSocialDashboardClient({
    env: deps.env,
    runtimeEnv: deps.runtimeEnv,
    queryOne,
    fetchImpl: deps.fetchImpl
  })
  if (!socialDashboardClient) {
    throw new Error('social-dashboard integration is not configured')
  }

  const resolved = await socialDashboardClient.resolveOrganization({
    actingUserEmail: input.actingUserEmail,
    name: client.name,
    externalClientId: client.id,
    sellerRefs: stringList(input.sellerRefs),
    platforms: stringList(input.platforms)
  })

  const organizationId = nonEmpty(resolved.organization_id || resolved.organization?.id)
  if (!organizationId) throw new Error('social-dashboard organization resolver returned no organization id')
  return organizationId
}
