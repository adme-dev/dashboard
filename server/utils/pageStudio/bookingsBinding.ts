export interface PageStudioBookingsBinding {
  listBookings: (options?: { status?: string, limit?: number }) => Promise<unknown>
  applyAuthorizedBooking: (actor: 'operator', bookingId: string, command: unknown) => Promise<unknown>
}

export class PageStudioBookingsError extends Error {
  constructor(readonly code: 'BOOKINGS_UNAVAILABLE' | 'BOOKINGS_FAILED', message: string, readonly statusCode = 503) {
    super(message)
    this.name = 'PageStudioBookingsError'
  }
}

export async function listScopedPageStudioBookings(binding: PageStudioBookingsBinding | undefined, options: { status?: string, limit: number }) {
  if (!binding) throw new PageStudioBookingsError('BOOKINGS_UNAVAILABLE', 'Page Studio booking service is not configured')
  try {
    const result = await binding.listBookings(options)
    if (!Array.isArray(result)) throw new Error('Booking service returned an invalid queue')
    return result
  } catch (error) {
    if (error instanceof PageStudioBookingsError) throw error
    throw new PageStudioBookingsError('BOOKINGS_FAILED', error instanceof Error ? error.message : 'Booking queue failed')
  }
}

export async function applyScopedPageStudioBooking(binding: PageStudioBookingsBinding | undefined, bookingId: string, command: unknown) {
  if (!binding) throw new PageStudioBookingsError('BOOKINGS_UNAVAILABLE', 'Page Studio booking service is not configured')
  try {
    return await binding.applyAuthorizedBooking('operator', bookingId, command)
  } catch (error) {
    throw new PageStudioBookingsError('BOOKINGS_FAILED', error instanceof Error ? error.message : 'Booking command failed')
  }
}
