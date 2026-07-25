import { queryOne, queryRows } from '~~/server/utils/db'
import { resolveClientEntitlement } from '~~/server/utils/billing/entitlements'

interface RouteRow {
  channel: 'sms' | 'voice' | 'email'
  status: string
  emergency_stop: boolean
  provider_status: string | null
  provider_emergency_stop: boolean | null
}

interface ReceptionistRow {
  status: string
  industry_template_key: string | null
  industry_template_version: string | null
  knowledge_release_ref: string | null
  evaluation_status: string
  business_hours_ready: boolean
  handoff_ready: boolean
  emergency_stop: boolean
  route_status: string | null
  route_emergency_stop: boolean | null
  provider_status: string | null
  provider_emergency_stop: boolean | null
}

export async function getClientPlatformRolloutReadiness(clientId: string) {
  const [smsEntitlement, voiceEntitlement, receptionistEntitlement, mcpEntitlement, routes, receptionist, mcp] =
    await Promise.all([
      resolveClientEntitlement(clientId, 'communications.sms'),
      resolveClientEntitlement(clientId, 'communications.voice'),
      resolveClientEntitlement(clientId, 'ai.receptionist'),
      resolveClientEntitlement(clientId, 'mcp.crm'),
      queryRows<RouteRow>(
        `SELECT route.channel, route.status, route.emergency_stop,
                account.status AS provider_status,
                account.emergency_stop AS provider_emergency_stop
           FROM crm_communication_routes route
           LEFT JOIN crm_communication_provider_accounts account
             ON account.client_id = route.client_id
            AND account.id = route.provider_account_id
          WHERE route.client_id = $1`,
        [clientId]
      ),
      queryOne<ReceptionistRow>(
        `SELECT profile.status, profile.industry_template_key,
                profile.industry_template_version, profile.knowledge_release_ref,
                profile.evaluation_status,
                profile.business_hours <> '{}'::jsonb AS business_hours_ready,
                profile.handoff_policy <> '{}'::jsonb AS handoff_ready,
                profile.emergency_stop,
                route.status AS route_status,
                route.emergency_stop AS route_emergency_stop,
                account.status AS provider_status,
                account.emergency_stop AS provider_emergency_stop
           FROM crm_receptionist_profiles profile
           LEFT JOIN crm_communication_routes route
             ON route.client_id = profile.client_id
            AND route.id = profile.voice_route_id
           LEFT JOIN crm_communication_provider_accounts account
             ON account.client_id = route.client_id
            AND account.id = route.provider_account_id
          WHERE profile.client_id = $1
          ORDER BY profile.location_key
          LIMIT 1`,
        [clientId]
      ),
      queryOne<{ active_clients: string }>(
        `SELECT COUNT(*) AS active_clients
           FROM crm_external_mcp_clients
          WHERE client_id = $1
            AND status = 'active'
            AND (expires_at IS NULL OR expires_at > NOW())`,
        [clientId]
      )
    ])

  const routeFor = (channel: RouteRow['channel']) => routes.find(route => route.channel === channel)
  const routeReady = (route: RouteRow | undefined) => Boolean(
    route
    && route.status === 'active'
    && !route.emergency_stop
    && route.provider_status === 'active'
    && route.provider_emergency_stop === false
  )
  const smsRoute = routeFor('sms')
  const voiceRoute = routeFor('voice')
  const receptionistGlobalEnabled = process.env.AI_PHONE_RECEPTIONIST_ENABLED === 'true'
  const mcpGlobalEnabled = process.env.EXTERNAL_CLIENT_MCP_ENABLED === 'true'
  const receptionistReady = Boolean(
    receptionistGlobalEnabled
    && receptionistEntitlement.enabled
    && receptionist
    && ['pilot', 'live'].includes(receptionist.status)
    && receptionist.industry_template_key
    && receptionist.industry_template_version
    && receptionist.knowledge_release_ref
    && receptionist.evaluation_status === 'passed'
    && receptionist.business_hours_ready
    && receptionist.handoff_ready
    && !receptionist.emergency_stop
    && receptionist.route_status === 'active'
    && receptionist.route_emergency_stop === false
    && receptionist.provider_status === 'active'
    && receptionist.provider_emergency_stop === false
  )
  const activeMcpClients = Number(mcp?.active_clients ?? 0)

  return {
    generatedAt: new Date().toISOString(),
    communications: {
      sms: {
        entitled: smsEntitlement.enabled,
        ready: smsEntitlement.enabled && routeReady(smsRoute),
        emergencyStopped: smsRoute?.emergency_stop ?? true
      },
      voice: {
        entitled: voiceEntitlement.enabled,
        ready: voiceEntitlement.enabled && routeReady(voiceRoute),
        emergencyStopped: voiceRoute?.emergency_stop ?? true
      }
    },
    receptionist: {
      globallyEnabled: receptionistGlobalEnabled,
      entitled: receptionistEntitlement.enabled,
      ready: receptionistReady,
      status: receptionist?.status ?? 'not_configured',
      evaluationStatus: receptionist?.evaluation_status ?? 'not_started',
      emergencyStopped: receptionist?.emergency_stop ?? true
    },
    externalMcp: {
      globallyEnabled: mcpGlobalEnabled,
      entitled: mcpEntitlement.enabled,
      ready: mcpGlobalEnabled && mcpEntitlement.enabled && activeMcpClients > 0,
      activeClients: activeMcpClients
    }
  }
}
