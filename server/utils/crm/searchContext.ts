import { createError, type H3Event } from 'h3'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { PERMISSION_GROUPS, SYSTEM_ROLE_PERMISSIONS } from '~~/server/utils/permissions'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export interface CrmSearchContext {
  organisationScopeId: string
  clientId: string
  correlationId: string
  actorType: 'staff' | 'portal'
  actorId: string
  surface: 'agency_global' | 'portal_global' | 'agency_ai'
  permissionSet: readonly string[]
  visibility: { ownerScoped: boolean }
  assistantScope?: { clientIds: readonly string[]; sourceRevision: string }
}

export type TrustedCrmSystemPurpose
  = | 'crm_task_reminders'
    | 'crm_followup_review'
    | 'crm_meeting_action'
    | 'crm_health_compute'
    | 'crm_score_compute'
    | 'crm_lifecycle'
    | 'crm_activation'
    | 'crm_email_projection'
    | 'lead_crm_promotion'
    | 'crm_email_inbound'

/**
 * Narrow authority for a non-user CRM job. Construct this only through
 * resolveTrustedCrmSystemContext so each unit of work reloads its active
 * client boundary before any record lookup or side effect.
 */
export interface TrustedCrmSystemContext {
  organisationScopeId: string
  clientId: string
  correlationId: string
  actorType: 'system'
  actorId: string
  surface: 'trusted_system'
  permissionSet: readonly []
  visibility: { ownerScoped: false }
  trustedSystem: { purpose: TrustedCrmSystemPurpose }
}

export type CrmRecordAccessContext = CrmSearchContext | TrustedCrmSystemContext

export type AgencyAiContextResolution =
  | { status: 'resolved'; context: CrmSearchContext; clientName: string }
  | { status: 'not_found' | 'ambiguous' | 'scope_unavailable' }

type FreshAgencyActor = { id: string; role: string; customRoleId: string | null }
type FreshClient = { id: string; name: string; recordVisibility: 'team' | 'owner' }
type FreshPortalSession = {
  id: string
  clientId: string
  clientName: string
  leadCaptureMode: string
  isPrimaryContact: boolean
  canViewCrm: boolean
  canEditCrm: boolean
  canAdminCrm: boolean
  recordVisibility: 'team' | 'owner'
}

export interface CrmSearchContextDependencies {
  resolveAgencyActorId: (event: H3Event) => Promise<string>
  loadAgencyActor: (actorId: string) => Promise<FreshAgencyActor | null>
  loadPermissionSet: (actor: FreshAgencyActor) => Promise<string[]>
  loadClient: (clientId: string) => Promise<FreshClient | null>
  loadAgencyAssignment: (actorId: string, clientId: string) => Promise<boolean>
  loadAssistantAssignments: (actorId: string, permissionSet: readonly string[]) => Promise<{ clientIds: string[]; sourceRevision: string }>
  loadOrganisationScope: () => Promise<string | null>
  loadPortalSession: (event: H3Event) => Promise<FreshPortalSession | null>
  loadPortalEntitlement: (clientId: string) => Promise<boolean>
  loadAuthorizedActiveClients: (clientIds: readonly string[]) => Promise<Array<Pick<FreshClient, 'id' | 'name'>>>
  createCorrelationId: () => string
  /** Reserved for downstream retrieval. Context resolution must never invoke it. */
  runKeyword?: () => unknown
}

const permissionGroupSet = new Set<string>(PERMISSION_GROUPS)
const enabledEntitlementStatuses = new Set(['trial', 'active', 'grace'])
const internalCrmModes = new Set(['lightweight_crm', 'full_crm'])

function notFound(): never {
  throw createError({ statusCode: 404, statusMessage: 'Client not found' })
}

function scopeUnavailable(): never {
  throw createError({ statusCode: 503, statusMessage: 'CRM search scope is unavailable' })
}

function isManagement(permissionSet: readonly string[]) {
  return permissionSet.includes('ADMIN') || permissionSet.includes('MANAGEMENT')
}

function correlationId() {
  if (!globalThis.crypto?.randomUUID) {
    throw createError({ statusCode: 503, statusMessage: 'Secure request identity is unavailable' })
  }
  return globalThis.crypto.randomUUID()
}

/**
 * Preserve a server-generated request identity for internal denial logging
 * without placing it on the uniform public 404 response.
 */
function createRequestCorrelationId(event: H3Event, deps: CrmSearchContextDependencies) {
  const requestCorrelationId = deps.createCorrelationId()
  ;(event.context as Record<string, unknown>).crmSearchCorrelationId = requestCorrelationId
  return requestCorrelationId
}

const defaultDependencies: CrmSearchContextDependencies = {
  async resolveAgencyActorId(event) {
    // requireAuth establishes an authenticated identity; its role/groups are
    // deliberately discarded and refreshed below before authority is granted.
    return (await requireAuth(event)).id
  },
  async loadAgencyActor(actorId) {
    const row = await queryOneFresh<{ id: string; role: string; custom_role_id: string | null }>(
      `SELECT id::text AS id, user_role::text AS role, custom_role_id::text AS custom_role_id
         FROM team_members
        WHERE id = $1 AND is_active = TRUE
        LIMIT 1`,
      [actorId]
    )
    return row ? { id: row.id, role: row.role, customRoleId: row.custom_role_id } : null
  },
  async loadPermissionSet(actor) {
    if (!actor.customRoleId) return [...(SYSTEM_ROLE_PERMISSIONS[actor.role] ?? [])]
    const rows = await queryRowsFresh<{ permission_group: string }>(
      `SELECT assignment.permission_group
         FROM role_permission_groups assignment
         JOIN custom_roles role ON role.id = assignment.role_id
        WHERE role.id = $1`,
      [actor.customRoleId]
    )
    return rows.map(row => row.permission_group).filter(group => permissionGroupSet.has(group))
  },
  async loadClient(clientId) {
    const row = await queryOneFresh<{ id: string; name: string; record_visibility: 'team' | 'owner' | null }>(
      `SELECT client.id::text AS id, client.name, settings.record_visibility
         FROM agency_clients client
         LEFT JOIN crm_settings settings ON settings.client_id = client.id
        WHERE client.id = $1 AND client.is_active = TRUE
        LIMIT 1`,
      [clientId]
    )
    return row ? { id: row.id, name: row.name, recordVisibility: row.record_visibility === 'owner' ? 'owner' : 'team' } : null
  },
  async loadAgencyAssignment(actorId, clientId) {
    return !!await queryOneFresh(
      `SELECT 1
         FROM client_team_assignments assignment
         JOIN agency_clients client ON client.id = assignment.client_id
        WHERE assignment.team_member_id = $1 AND assignment.client_id = $2 AND client.is_active = TRUE
        LIMIT 1`,
      [actorId, clientId]
    )
  },
  async loadAssistantAssignments(actorId, permissionSet) {
    const rows = await queryRowsFresh<{ id: string; source_revision: string }>(
      isManagement(permissionSet)
        ? `SELECT id::text AS id, COALESCE(updated_at::text, '') AS source_revision
             FROM agency_clients WHERE is_active = TRUE ORDER BY id`
        : `SELECT client.id::text AS id, COALESCE(assignment.assigned_at::text, '') AS source_revision
             FROM client_team_assignments assignment
             JOIN agency_clients client ON client.id = assignment.client_id
            WHERE assignment.team_member_id = $1 AND client.is_active = TRUE
            ORDER BY client.id`,
      isManagement(permissionSet) ? [] : [actorId]
    )
    return {
      clientIds: rows.map(row => row.id),
      sourceRevision: rows.map(row => row.source_revision).join('|') || 'empty'
    }
  },
  async loadOrganisationScope() {
    const rows = await queryRowsFresh<{ id: string }>(
      `SELECT id::text AS id
         FROM crm_search_organisation_scopes
        WHERE is_primary = TRUE AND is_active = TRUE
        ORDER BY id
        LIMIT 2`
    )
    return rows.length === 1 ? rows[0]!.id : null
  },
  async loadPortalSession(event) {
    const token = getCookie(event, 'client_session_token')
    if (!token) return null
    const digest = await digestPortalSessionToken(token)
    const row = await queryOneFresh<{
      id: string; client_id: string; client_name: string; lead_capture_mode: string
      is_primary_contact: boolean; can_view_crm: boolean; can_edit_crm: boolean; can_admin_crm: boolean
      record_visibility: 'team' | 'owner' | null
    }>(
      `SELECT portal_user.id::text AS id, client.id::text AS client_id, client.name AS client_name,
              client.lead_capture_mode, portal_user.is_primary_contact,
              portal_user.can_view_crm, portal_user.can_edit_crm, portal_user.can_admin_crm, settings.record_visibility
         FROM client_sessions session
         JOIN client_users portal_user ON portal_user.id = session.client_user_id
         JOIN agency_clients client ON client.id = portal_user.client_id
         LEFT JOIN crm_settings settings ON settings.client_id = client.id
        WHERE session.token_hash = $1 AND session.expires_at > NOW()
          AND portal_user.status = 'active' AND client.is_active = TRUE
        LIMIT 1`,
      [digest]
    )
    return row ? {
      id: row.id, clientId: row.client_id, clientName: row.client_name,
      leadCaptureMode: row.lead_capture_mode, isPrimaryContact: row.is_primary_contact,
      canViewCrm: row.can_view_crm, canEditCrm: row.can_edit_crm, canAdminCrm: row.can_admin_crm,
      recordVisibility: row.record_visibility === 'owner' ? 'owner' : 'team'
    } : null
  },
  async loadPortalEntitlement(clientId) {
    const row = await queryOneFresh<{ status: string }>(
      `WITH candidates AS (
         SELECT status, 1 AS priority FROM client_entitlement_overrides
          WHERE client_id = $1 AND feature_key = 'crm.core' AND starts_at <= NOW()
            AND (expires_at IS NULL OR expires_at > NOW())
         UNION ALL
         SELECT status, 2 FROM client_feature_entitlements
          WHERE client_id = $1 AND feature_key = 'crm.core' AND starts_at <= NOW()
            AND (expires_at IS NULL OR expires_at > NOW())
         UNION ALL
         SELECT entitlement.status, 3 FROM client_subscriptions subscription
           JOIN billing_plans plan ON plan.id = subscription.plan_id AND plan.status = 'active'
           JOIN billing_plan_entitlements entitlement ON entitlement.plan_id = plan.id AND entitlement.feature_key = 'crm.core'
          WHERE subscription.client_id = $1 AND subscription.status IN ('trial', 'active', 'grace')
            AND (subscription.current_period_ends_at IS NULL OR subscription.current_period_ends_at > NOW())
       ) SELECT status FROM candidates ORDER BY priority LIMIT 1`,
      [clientId]
    )
    return !!row && enabledEntitlementStatuses.has(row.status)
  },
  async loadAuthorizedActiveClients(clientIds) {
    if (clientIds.length === 0) return []
    return await queryRowsFresh<{ id: string; name: string }>(
      `SELECT id::text AS id, name FROM agency_clients
        WHERE id = ANY($1::uuid[]) AND is_active = TRUE
        ORDER BY id`,
      [clientIds]
    )
  },
  createCorrelationId: correlationId
}

async function resolveAgencyForActor(
  actorId: string,
  input: { clientId: string; surface: 'agency_global' | 'agency_ai' },
  deps: CrmSearchContextDependencies,
  requestCorrelationId: string,
  assistantScope?: { clientIds: readonly string[]; sourceRevision: string }
): Promise<CrmSearchContext> {
  const actor = await deps.loadAgencyActor(actorId)
  if (!actor) notFound()
  const permissionSet = await deps.loadPermissionSet(actor)
  const client = await deps.loadClient(input.clientId)
  if (!client || !permissionSet.includes('CLIENTS')) notFound()

  // Global agency search follows the product's canonical CLIENTS + active
  // client policy. Assignment membership is intentionally an AI-only scope.
  if (assistantScope) {
    const assigned = await deps.loadAgencyAssignment(actor.id, client.id)
    if (!assigned || !assistantScope.clientIds.includes(client.id)) notFound()
  }
  const organisationScopeId = await deps.loadOrganisationScope()
  if (!organisationScopeId) scopeUnavailable()

  return {
    organisationScopeId,
    clientId: client.id,
    correlationId: requestCorrelationId,
    actorType: 'staff',
    actorId: actor.id,
    surface: input.surface,
    permissionSet: [...new Set(permissionSet)],
    visibility: { ownerScoped: client.recordVisibility === 'owner' && !isManagement(permissionSet) },
    ...(assistantScope ? { assistantScope } : {})
  }
}

export async function resolveAgencyCrmSearchContext(
  event: H3Event,
  input: { clientId: string; surface: 'agency_global'; correlationId?: unknown; actorId?: unknown },
  deps: CrmSearchContextDependencies = defaultDependencies
): Promise<CrmSearchContext> {
  const requestCorrelationId = createRequestCorrelationId(event, deps)
  return await resolveAgencyForActor(await deps.resolveAgencyActorId(event), input, deps, requestCorrelationId)
}

export async function resolvePortalCrmSearchContext(
  event: H3Event,
  input: { surface: 'portal_global'; correlationId?: unknown },
  deps: CrmSearchContextDependencies = defaultDependencies
): Promise<CrmSearchContext> {
  const requestCorrelationId = createRequestCorrelationId(event, deps)
  const session = await deps.loadPortalSession(event)
  if (!session || !internalCrmModes.has(session.leadCaptureMode)) notFound()
  const canView = session.isPrimaryContact || session.canViewCrm || session.canEditCrm || session.canAdminCrm
  if (!canView || !(await deps.loadPortalEntitlement(session.clientId))) notFound()
  const organisationScopeId = await deps.loadOrganisationScope()
  if (!organisationScopeId) scopeUnavailable()
  return {
    organisationScopeId,
    clientId: session.clientId,
    correlationId: requestCorrelationId,
    actorType: 'portal',
    actorId: session.id,
    surface: input.surface,
    permissionSet: ['CRM_VIEW'],
    visibility: { ownerScoped: false }
  }
}

export async function resolveTrustedCrmSystemContext(
  input: { clientId: string; purpose: TrustedCrmSystemPurpose },
  deps: Pick<CrmSearchContextDependencies, 'loadClient' | 'loadOrganisationScope' | 'createCorrelationId'> = defaultDependencies
): Promise<TrustedCrmSystemContext> {
  const client = await deps.loadClient(input.clientId)
  if (!client) notFound()
  const organisationScopeId = await deps.loadOrganisationScope()
  if (!organisationScopeId) scopeUnavailable()
  return {
    organisationScopeId,
    clientId: client.id,
    correlationId: deps.createCorrelationId(),
    actorType: 'system',
    actorId: `trusted-system:${input.purpose}`,
    surface: 'trusted_system',
    permissionSet: [],
    visibility: { ownerScoped: false },
    trustedSystem: { purpose: input.purpose }
  }
}

export async function resolveAgencyAiCrmContext(
  tool: Pick<ToolContext, 'userId' | 'event'>,
  input: (
    | { clientName: string, clientId?: never }
    | { clientId: string, clientName?: never }
  ) & { correlationId?: unknown },
  deps: CrmSearchContextDependencies = defaultDependencies
): Promise<AgencyAiContextResolution> {
  const requestCorrelationId = createRequestCorrelationId(tool.event, deps)
  const actor = await deps.loadAgencyActor(tool.userId)
  if (!actor) return { status: 'scope_unavailable' }
  const permissionSet = await deps.loadPermissionSet(actor)
  if (!permissionSet.includes('CLIENTS')) return { status: 'scope_unavailable' }
  const assistantScope = await deps.loadAssistantAssignments(actor.id, permissionSet)
  if (assistantScope.clientIds.length === 0) return { status: 'scope_unavailable' }

  const authorizedIds = new Set(assistantScope.clientIds)
  const clients = (await deps.loadAuthorizedActiveClients(assistantScope.clientIds))
    .filter(client => authorizedIds.has(client.id))
  let selectedClient: (typeof clients)[number] | undefined
  if ('clientId' in input && typeof input.clientId === 'string') {
    selectedClient = clients.find(client => client.id === input.clientId)
  } else {
    const selector = normalizeClientName(input.clientName)
    if (!selector) return { status: 'not_found' }
    const exactMatches = clients.filter(client => normalizeClientName(client.name) === selector)
    if (exactMatches.length > 1) return { status: 'ambiguous' }
    const partialMatches = exactMatches.length === 0
      ? clients.filter(client => normalizeClientName(client.name).includes(selector))
      : exactMatches
    if (partialMatches.length > 1) return { status: 'ambiguous' }
    selectedClient = partialMatches[0]
  }
  if (!selectedClient) return { status: 'not_found' }
  try {
    const context = await resolveAgencyForActor(
      actor.id,
      { clientId: selectedClient.id, surface: 'agency_ai' },
      deps,
      requestCorrelationId,
      assistantScope
    )
    return { status: 'resolved', context, clientName: selectedClient.name }
  } catch (error: any) {
    if (error?.statusCode === 404) return { status: 'scope_unavailable' }
    throw error
  }
}

function normalizeClientName(value: string) {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-AU')
}
