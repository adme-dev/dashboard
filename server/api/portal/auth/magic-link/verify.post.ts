import { transaction } from '~~/server/utils/db'
import {
  digestPortalSessionToken,
  generatePortalMagicLinkToken,
  normalizePortalRedirect
} from '~~/server/utils/portalSession'
import { z } from 'zod'

const verifySchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{64}$/),
  redirect: z.string().max(2048).optional()
})

interface ConsumedMagicLinkUser {
  id: string
  client_id: string
  email: string
  status: 'active' | 'pending'
}

export default defineEventHandler(async (event) => {
  const parsed = verifySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid magic-link verification request'
    })
  }

  const tokenHash = await digestPortalSessionToken(parsed.data.token)
  const redirect = normalizePortalRedirect(parsed.data.redirect)
  const sessionToken = generatePortalMagicLinkToken()
  const sessionHash = await digestPortalSessionToken(sessionToken)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const headers = getHeaders(event)
  const ipAddress = headers['x-forwarded-for']?.split(',')[0]?.trim()
    || headers['x-real-ip']
    || 'unknown'
  const userAgent = headers['user-agent'] || null

  await transaction(async (client) => {
    const consumed = await client.query<ConsumedMagicLinkUser>(`
      UPDATE client_magic_link_tokens AS magic_link
      SET consumed_at = NOW()
      FROM client_users AS client_user
      WHERE magic_link.token_hash = $1
        AND magic_link.client_user_id = client_user.id
        AND magic_link.consumed_at IS NULL
        AND magic_link.expires_at > NOW()
        AND (
          client_user.status = 'active'
          OR (
            client_user.status = 'pending'
            AND EXISTS (
              SELECT 1
              FROM client_invitations AS invitation
              WHERE invitation.client_id = client_user.client_id
                AND LOWER(invitation.email) = LOWER(client_user.email)
                AND invitation.status = 'pending'
                AND invitation.expires_at > NOW()
            )
          )
        )
      RETURNING
        client_user.id,
        client_user.client_id,
        client_user.email,
        client_user.status
    `, [tokenHash])

    const user = consumed.rows[0]
    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'This sign-in link is invalid or has expired.'
      })
    }

    if (user.status === 'pending') {
      await client.query(`
        UPDATE client_users
        SET
          status = 'active',
          email_verified = TRUE,
          email_verified_at = COALESCE(email_verified_at, NOW()),
          activated_at = COALESCE(activated_at, NOW()),
          updated_at = NOW()
        WHERE id = $1
      `, [user.id])

      await client.query(`
        UPDATE client_invitations
        SET status = 'accepted', accepted_at = NOW(), accepted_by_user_id = $1
        WHERE client_id = $2
          AND LOWER(email) = LOWER($3)
          AND status = 'pending'
          AND expires_at > NOW()
      `, [user.id, user.client_id, user.email])
    }

    await client.query(`
      INSERT INTO client_sessions (
        client_user_id, token_hash, ip_address, user_agent, expires_at
      ) VALUES ($1, $2, $3, $4, $5)
    `, [
      user.id,
      sessionHash,
      ipAddress === 'unknown' ? null : ipAddress,
      userAgent,
      expiresAt.toISOString()
    ])

    await client.query(`
      UPDATE client_users
      SET last_login_at = NOW(), login_count = login_count + 1
      WHERE id = $1
    `, [user.id])

    await client.query(`
      INSERT INTO client_activity_log (
        client_user_id, client_id, action, details, ip_address, user_agent
      ) VALUES ($1, $2, 'magic_link_login', $3, $4, $5)
    `, [
      user.id,
      user.client_id,
      JSON.stringify({ activatedFromPending: user.status === 'pending' }),
      ipAddress === 'unknown' ? null : ipAddress,
      userAgent
    ])
  })

  setCookie(event, 'client_session_token', sessionToken, {
    httpOnly: true,
    secure: getRequestURL(event).protocol === 'https:',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/'
  })

  return { success: true, redirect }
})
