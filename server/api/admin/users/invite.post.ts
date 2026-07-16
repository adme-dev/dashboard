/**
 * Invite users
 * POST /api/admin/users/invite
 *
 * Creates team_members rows for new emails, assigns the chosen teams, and
 * emails each new user a magic sign-in link. The admin Users page's Invite
 * modal previously collected all of this and then did nothing with it.
 */

import { requireRole, generateMagicLink } from '~~/server/utils/auth'
import { sendMagicLinkEmail } from '~~/server/utils/email'
import { getAppUrl } from '~~/server/utils/appUrl'
import { queryOne, queryRows, execute } from '~~/server/utils/db'

interface InviteBody {
  emails: string[]
  role?: string
  title?: string
  teamIds?: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || email
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || email
}

export default defineEventHandler(async (event) => {
  const currentUser = await requireRole(event, ['admin', 'owner'])
  const body = await readBody<InviteBody>(event)

  const emails = [...new Set((body.emails || []).map(e => String(e).trim().toLowerCase()).filter(Boolean))]
  if (!emails.length) {
    throw createError({ statusCode: 400, statusMessage: 'At least one email is required' })
  }
  if (emails.length > 20) {
    throw createError({ statusCode: 400, statusMessage: 'Maximum 20 invites at a time' })
  }
  const invalid = emails.filter(e => !EMAIL_RE.test(e))
  if (invalid.length) {
    throw createError({ statusCode: 400, statusMessage: `Invalid email(s): ${invalid.join(', ')}` })
  }

  // Role must be a real role slug, and only owners can mint owners.
  const role = String(body.role || 'member')
  const roleRow = await queryOne<{ slug: string }>(`SELECT slug FROM custom_roles WHERE slug = $1`, [role])
  if (!roleRow) {
    throw createError({ statusCode: 400, statusMessage: `Unknown role: ${role}` })
  }
  if (role === 'owner' && currentUser.role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Only an owner can invite an owner' })
  }

  const teamIds = Array.isArray(body.teamIds) ? body.teamIds.filter(Boolean) : []
  if (teamIds.length) {
    const known = await queryRows<{ id: string }>(`SELECT id FROM teams WHERE id = ANY($1::uuid[])`, [teamIds])
    if (known.length !== teamIds.length) {
      throw createError({ statusCode: 400, statusMessage: 'One or more teams not found' })
    }
  }

  const appUrl = getAppUrl(event).replace(/\/$/, '')
  const title = body.title ? String(body.title).slice(0, 120) : null

  const results: Array<{ email: string; status: 'invited' | 'already_member' | 'email_failed' }> = []

  for (const email of emails) {
    const existing = await queryOne<{ id: string }>(`SELECT id FROM team_members WHERE email = $1`, [email])
    if (existing) {
      results.push({ email, status: 'already_member' })
      continue
    }

    // user_role is a Postgres enum — a custom-role slug outside it fails
    // the insert. Report that per-email instead of aborting the batch.
    let created: { id: string; name: string } | null = null
    try {
      created = await queryOne<{ id: string; name: string }>(
        `INSERT INTO team_members (name, email, user_role, role, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id, name`,
        [nameFromEmail(email), email, role, title ?? role],
      )
    } catch (err: any) {
      console.warn('[admin/users invite] insert failed for', email, err?.message)
    }
    if (!created) {
      results.push({ email, status: 'email_failed' })
      continue
    }

    for (const teamId of teamIds) {
      await execute(
        `INSERT INTO team_memberships (team_id, team_member_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (team_id, team_member_id) DO NOTHING`,
        [teamId, created.id],
      )
    }

    try {
      const token = await generateMagicLink(created.id, email)
      await sendMagicLinkEmail({
        to: email,
        name: created.name,
        magicLinkUrl: `${appUrl}/api/auth/magic-link/callback?token=${token}`,
        event,
      })
      results.push({ email, status: 'invited' })
    } catch (err: any) {
      // Account exists either way — they can request their own magic link.
      console.warn('[admin/users invite] email send failed for', email, err?.message)
      results.push({ email, status: 'email_failed' })
    }
  }

  return { results }
})
