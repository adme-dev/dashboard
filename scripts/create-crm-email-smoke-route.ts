import { queryOne } from '~~/server/utils/db'
import { createCrmEmailReplyToken } from '~~/server/utils/crm/emailReplyToken'

interface CreatedRouteRow {
  id: string
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function parseReplySecret(): string {
  const raw = requiredEnvironment('CRM_EMAIL_REPLY_SECRETS')
  const parsed = JSON.parse(raw) as unknown
  if (
    !parsed
    || typeof parsed !== 'object'
    || Array.isArray(parsed)
    || typeof (parsed as Record<string, unknown>)['1'] !== 'string'
  ) {
    throw new Error('CRM_EMAIL_REPLY_SECRETS must contain secret version 1')
  }
  return (parsed as Record<string, string>)['1']!
}

async function main(): Promise<void> {
  const clientId = requiredEnvironment('CRM_EMAIL_SMOKE_CLIENT_ID')
  const recipientDomain
    = process.env.CRM_EMAIL_SMOKE_RECIPIENT_DOMAIN?.trim() || 'xeroflow.io'
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const created = await createCrmEmailReplyToken({
    version: 1,
    domain: recipientDomain,
    secret: parseReplySecret()
  })

  const route = await queryOne<CreatedRouteRow>(`
    INSERT INTO crm_email_routes (
      client_id,
      route_kind,
      token_version,
      route_token_hash,
      recipient_domain,
      expires_at,
      created_by
    )
    SELECT
      client.id,
      'lead_inbox',
      1,
      $2,
      $3,
      $4,
      'activation-smoke'
    FROM agency_clients AS client
    WHERE client.id = $1
    RETURNING id
  `, [
    clientId,
    created.routeTokenHash,
    recipientDomain,
    expiresAt.toISOString()
  ])
  if (!route) throw new Error('CRM email smoke client was not found')

  process.stdout.write(JSON.stringify({
    routeId: route.id,
    address: `lead+${created.token}@${recipientDomain}`,
    expiresAt: expiresAt.toISOString()
  }))
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error'
  console.error(`CRM email smoke route creation failed: ${message}`)
  process.exitCode = 1
})
