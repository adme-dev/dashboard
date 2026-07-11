import { createError } from 'h3'
import { requireAuth, type User } from '~~/server/utils/auth'
import { canManageHr } from './access'

/**
 * HR data never uses the general ADMIN group and never bypasses authorization in
 * development. This prevents an ordinary administrator from reading private
 * owner discovery or employee review records.
 */
export async function requireHrAdmin(event: any): Promise<User> {
  const user = await requireAuth(event)
  if (!canManageHr(user)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden - HR administrator access required' })
  }
  return user
}
