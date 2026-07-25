import { requirePermission } from '~~/server/utils/auth'

export async function requirePersonaReadAccess(event: any) {
  return requirePermission(event, 'MEDIA_BUYING')
}

export async function requirePersonaAdminAccess(event: any) {
  return requirePermission(event, 'ADMIN')
}
