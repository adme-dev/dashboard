import { queryOne as defaultQueryOne } from '~~/server/utils/db'
import {
  canonicalizeCrmEmailDomain,
  verifyCrmEmailReplyToken
} from '~~/server/utils/crm/emailReplyToken'

export type CrmInboundEmailRouteKind = 'lead_inbox' | 'conversation_reply'

export interface ResolveCrmInboundEmailRouteInput {
  routeKind: CrmInboundEmailRouteKind
  routeToken: string
  recipientDomain: string
  secrets: Readonly<Record<number, string>>
}

export interface CrmInboundEmailRoute {
  id: string
  clientId: string
  conversationId: string | null
  routeKind: CrmInboundEmailRouteKind
  tokenVersion: number
  recipientDomain: string
  routeTokenHash: string
}

interface CrmInboundEmailRouteRow {
  id: string
  client_id: string
  conversation_id: string | null
  route_kind: CrmInboundEmailRouteKind
  token_version: number
  recipient_domain: string
}

interface CrmEmailRouteDependencies {
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>
}

export async function resolveCrmInboundEmailRoute(
  input: ResolveCrmInboundEmailRouteInput,
  dependencies: CrmEmailRouteDependencies = {
    queryOne: defaultQueryOne
  }
): Promise<CrmInboundEmailRoute | null> {
  const verified = await verifyCrmEmailReplyToken({
    token: input.routeToken,
    domain: input.recipientDomain,
    secrets: input.secrets
  })
  if (!verified.valid) return null

  let recipientDomain: string
  try {
    recipientDomain = canonicalizeCrmEmailDomain(input.recipientDomain)
  } catch {
    return null
  }

  const row = await dependencies.queryOne<CrmInboundEmailRouteRow>(`
    SELECT
      id, client_id, conversation_id, route_kind, token_version,
      recipient_domain
    FROM crm_email_routes
    WHERE route_token_hash = $1
      AND token_version = $2
      AND recipient_domain = $3
      AND route_kind = $4
      AND is_active = TRUE
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1
  `, [
    verified.routeTokenHash,
    verified.version,
    recipientDomain,
    input.routeKind
  ])
  if (!row) return null

  return {
    id: row.id,
    clientId: row.client_id,
    conversationId: row.conversation_id,
    routeKind: row.route_kind,
    tokenVersion: row.token_version,
    recipientDomain: row.recipient_domain,
    routeTokenHash: verified.routeTokenHash
  }
}
