import type { H3Event } from 'h3'
import { assertPermissionGrant } from '~~/server/utils/financeAccess'

/** Commercial workflows retain their own grant; Finance may administer them too. */
export async function assertCommercialPermission(event: H3Event, userId: string, group: 'CLIENTS' | 'SALES', write = false): Promise<void> {
  try {
    await assertPermissionGrant(event, userId, group, write)
    return
  } catch (error: unknown) {
    if ((error as { statusCode?: number })?.statusCode !== 403) throw error
  }
  await assertPermissionGrant(event, userId, 'FINANCE', write)
}
