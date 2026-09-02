import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'

export const GoogleAdsAccountRoleSchema = z.enum([
  'dealer',
  'brand',
  'group',
  'reporting_only',
  'default_measurement'
])

export interface GoogleAdsAccountResolutionCandidate {
  clientId: string
  canonicalName: string
  aliasId: string | null
  matchedName: string
  matchKind: 'canonical' | 'alias'
}

export interface GoogleAdsAccountBinding {
  id: string
  clientId: string
  aliasId: string | null
  connectionId: string
  operatingCustomerId: string
  loginCustomerId: string | null
  accountRole: z.infer<typeof GoogleAdsAccountRoleSchema>
  connectionStatus: string
  connectionAccountName: string | null
}

export interface GoogleAdsAccountResolutionDependencies {
  findCandidates(query: string): Promise<GoogleAdsAccountResolutionCandidate[]>
  listBindings(clientId: string): Promise<GoogleAdsAccountBinding[]>
}

export type GoogleAdsAccountResolutionResult
  = | {
    status: 'resolved'
    resolutionKind: 'direct' | 'aggregated'
    clientId: string
    canonicalName: string
    matchedName: string
    matchKind: 'canonical' | 'alias'
    accounts: Array<Omit<GoogleAdsAccountBinding, 'id' | 'clientId' | 'aliasId'>>
  }
  | {
    status: 'ambiguous'
    query: string
    candidates: Array<Omit<GoogleAdsAccountResolutionCandidate, 'aliasId'>>
  }
  | { status: 'not_found', query: string }
  | (Omit<GoogleAdsAccountResolutionCandidate, 'aliasId'> & { status: 'missing_mapping' })

const ResolveInputSchema = z.strictObject({
  query: z.string().trim().min(1).max(200),
  aggregate: z.boolean().default(false)
})

function normalized(value: string) {
  return value.trim().toLocaleLowerCase('en-AU')
}

function publicCandidate(candidate: GoogleAdsAccountResolutionCandidate) {
  const { aliasId: _aliasId, ...result } = candidate
  return result
}

function publicBinding(binding: GoogleAdsAccountBinding) {
  const { id: _id, clientId: _clientId, aliasId: _aliasId, ...result } = binding
  return result
}

export async function resolveGoogleAdsAccount(
  rawInput: unknown,
  dependencies: GoogleAdsAccountResolutionDependencies = postgresDependencies
): Promise<GoogleAdsAccountResolutionResult> {
  const input = ResolveInputSchema.parse(rawInput)
  const candidates = await dependencies.findCandidates(input.query)
  const exact = candidates.filter(candidate => normalized(candidate.matchedName) === normalized(input.query))
  const eligible = exact.length > 0 ? exact : candidates

  if (eligible.length === 0) return { status: 'not_found', query: input.query }
  if (eligible.length !== 1) {
    return {
      status: 'ambiguous',
      query: input.query,
      candidates: eligible.map(publicCandidate)
    }
  }

  const candidate = eligible[0]!
  const allBindings = (await dependencies.listBindings(candidate.clientId))
    .filter(binding => binding.clientId === candidate.clientId)
  const selected = input.aggregate
    ? allBindings
    : allBindings.filter(binding => binding.aliasId === candidate.aliasId)

  if (selected.length === 0) return { status: 'missing_mapping', ...publicCandidate(candidate) }
  if (!input.aggregate && selected.length !== 1) {
    return {
      status: 'ambiguous',
      query: input.query,
      candidates: [publicCandidate(candidate)]
    }
  }

  return {
    status: 'resolved',
    resolutionKind: input.aggregate ? 'aggregated' : 'direct',
    ...publicCandidate(candidate),
    accounts: selected.map(publicBinding)
  }
}

const postgresDependencies: GoogleAdsAccountResolutionDependencies = {
  async findCandidates(search) {
    return queryRows<GoogleAdsAccountResolutionCandidate>(`
      SELECT c.id AS "clientId",
             c.name AS "canonicalName",
             NULL::uuid AS "aliasId",
             c.name AS "matchedName",
             'canonical'::text AS "matchKind"
        FROM agency_clients c
       WHERE c.name ILIKE '%' || $1 || '%'
      UNION ALL
      SELECT c.id AS "clientId",
             c.name AS "canonicalName",
             a.id AS "aliasId",
             a.alias AS "matchedName",
             'alias'::text AS "matchKind"
        FROM agency_client_aliases a
        JOIN agency_clients c ON c.id = a.client_id
       WHERE a.alias ILIKE '%' || $1 || '%'
       ORDER BY "matchedName" ASC, "clientId" ASC
       LIMIT 25
    `, [search])
  },

  async listBindings(clientId) {
    const rows = await queryRows<GoogleAdsAccountBinding>(`
      SELECT b.id,
             b.client_id AS "clientId",
             b.alias_id AS "aliasId",
             b.connection_id AS "connectionId",
             b.operating_customer_id AS "operatingCustomerId",
             NULLIF(REGEXP_REPLACE(COALESCE(
               b.login_customer_id,
               sc.metadata->>'managerCustomerId',
               sc.metadata->>'loginCustomerId',
               ''
             ), '[^0-9]', '', 'g'), '') AS "loginCustomerId",
             b.account_role AS "accountRole",
             sc.status AS "connectionStatus",
             sc.account_name AS "connectionAccountName"
        FROM google_ads_account_bindings b
        JOIN social_connections sc
          ON sc.id = b.connection_id
         AND sc.client_id = b.client_id
         AND sc.platform = 'google'
       WHERE b.client_id = $1
       ORDER BY b.account_role ASC, b.operating_customer_id ASC
    `, [clientId])
    return rows.map(row => ({
      ...row,
      accountRole: GoogleAdsAccountRoleSchema.parse(row.accountRole)
    }))
  }
}
