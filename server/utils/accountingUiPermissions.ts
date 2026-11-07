import type { H3Event } from 'h3'
import type { PermissionGroup } from '~~/server/utils/permissions'
import { assertPermissionGrant } from '~~/server/utils/financeAccess'

/** Navigation must not advertise cached or static accounting authority. */
export async function resolveAccountingUiGroups(event: H3Event, userId: string, groups: PermissionGroup[]): Promise<PermissionGroup[]> {
  const current: PermissionGroup[] = groups.filter(group => group !== 'FINANCE' && group !== 'INVOICE_OWN_CLIENTS')
  for (const group of ['FINANCE', 'INVOICE_OWN_CLIENTS'] as const) {
    try {
      await assertPermissionGrant(event, userId, group)
      current.push(group)
    } catch (error: unknown) {
      if ((error as { statusCode?: number })?.statusCode !== 403) throw error
    }
  }
  return current
}
