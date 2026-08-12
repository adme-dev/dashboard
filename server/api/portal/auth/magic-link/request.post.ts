import { queryRowsFresh, transaction } from '~~/server/utils/db'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { getAppUrl } from '~~/server/utils/appUrl'
import {
  isEmailConfigured,
  sendClientPortalMagicLinkEmail
} from '~~/server/utils/email'
import { isCloudflareEmailGatewayAvailable } from '~~/server/utils/cloudflareEmailGateway'
import {
  digestPortalSessionToken,
  generatePortalMagicLinkToken,
  normalizePortalRedirect
} from '~~/server/utils/portalSession'
import { checkAndConsume } from '~~/server/utils/rateLimit'
import { z } from 'zod'

const requestSchema = z.object({
  email: z.string().trim().email().max(254),
  redirect: z.string().max(2048).optional()
})

const genericResponse = {
  success: true,
  message: 'If an eligible portal account exists, a sign-in link has been sent.'
}

interface EligiblePortalUser {
  id: string
  email: string
  name: string
  status: 'active' | 'pending'
  client_name: string
}

async function enforceRequestLimit(
  event: Parameters<typeof getHeaders>[0],
  key: string,
  limit: number
) {
  const result = await checkAndConsume({
    key,
    limit,
    windowSeconds: 15 * 60,
    failureMode: 'closed'
  })
  if (result.allowed) return

  const retryAfter = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000))
  setHeader(event, 'Retry-After', retryAfter)
  throw createError({
    statusCode: 429,
    statusMessage: 'Too many sign-in links requested. Try again later.'
  })
}

export default defineEventHandler(async (event) => {
  const parsed = requestSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid magic-link request' })
  }

  const email = parsed.data.email.toLowerCase()
  const redirect = normalizePortalRedirect(parsed.data.redirect)
  const headers = getHeaders(event)
  const ipAddress = headers['x-forwarded-for']?.split(',')[0]?.trim()
    || headers['x-real-ip']
    || 'unknown'
  const userAgent = headers['user-agent'] || null

  await enforceRequestLimit(
    event,
    `portal-magic-link:email:${await digestPortalSessionToken(email)}`,
    5
  )
  await enforceRequestLimit(
    event,
    `portal-magic-link:ip:${await digestPortalSessionToken(ipAddress)}`,
    20
  )

  if (!isEmailConfigured(event) && !isCloudflareEmailGatewayAvailable(event)) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Sign-in email is temporarily unavailable. Please contact your account manager.'
    })
  }

  const users = await queryRowsFresh<EligiblePortalUser>(`
    SELECT cu.id, cu.email, cu.name, cu.status, c.name AS client_name
    FROM client_users cu
    JOIN agency_clients c ON c.id = cu.client_id
    WHERE LOWER(cu.email) = $1
      AND (
        cu.status = 'active'
        OR (
          cu.status = 'pending'
          AND EXISTS (
            SELECT 1
            FROM client_invitations AS invitation
            WHERE invitation.client_id = cu.client_id
              AND LOWER(invitation.email) = LOWER(cu.email)
              AND invitation.status = 'pending'
              AND invitation.expires_at > NOW()
          )
        )
      )
      AND LOWER(cu.email) NOT LIKE '%@portal-access.local'
    ORDER BY cu.created_at ASC
    LIMIT 10
  `, [email])

  if (!users.length) return genericResponse

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
  const appUrl = getAppUrl(event).replace(/\/$/, '')
  const deliveries = await transaction(async (client) => {
    const issued: Array<EligiblePortalUser & { magicLinkUrl: string }> = []

    for (const user of users) {
      const token = generatePortalMagicLinkToken()
      const tokenHash = await digestPortalSessionToken(token)

      await client.query(`
        UPDATE client_magic_link_tokens
        SET consumed_at = NOW()
        WHERE client_user_id = $1
          AND consumed_at IS NULL
      `, [user.id])

      await client.query(`
        INSERT INTO client_magic_link_tokens (
          client_user_id, token_hash, expires_at, requested_ip, user_agent
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        user.id,
        tokenHash,
        expiresAt.toISOString(),
        ipAddress === 'unknown' ? null : ipAddress,
        userAgent
      ])

      issued.push({
        ...user,
        magicLinkUrl: `${appUrl}/portal/magic-link?redirect=${encodeURIComponent(redirect)}#token=${token}`
      })
    }

    return issued
  })

  const deliveryWork = Promise.all(deliveries.map(async (delivery) => {
    try {
      await sendClientPortalMagicLinkEmail({
        to: delivery.email,
        name: delivery.name,
        clientName: delivery.client_name,
        magicLinkUrl: delivery.magicLinkUrl,
        expiresInMinutes: 15,
        event
      })
    } catch {
      console.error('[Portal Magic Link] Delivery failed for an eligible portal account')
    }
  }))
  runAfterResponse(event, deliveryWork, 'portal-magic-link-email')

  return genericResponse
})
