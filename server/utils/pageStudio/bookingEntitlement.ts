import { z } from 'zod'

const BookingModules = z.object({ allowedModules: z.array(z.string()) })

/** Shared eligibility only; callers must separately verify actor/site scope. */
export function hasPageStudioBookingEntitlement(input: {
  siteStatus: string
  entitlementStatus?: string | null
  effective?: boolean | null
  planMetadata: unknown
}): boolean {
  const modules = BookingModules.safeParse(input.planMetadata)
  return ['draft', 'active'].includes(input.siteStatus)
    && ['trial', 'active'].includes(input.entitlementStatus ?? '')
    && input.effective === true
    && modules.success
    && modules.data.allowedModules.includes('bookings')
}
