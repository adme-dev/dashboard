import { z } from 'zod'
import { PageStudioContentScopeSchema } from './businessContent'

// Wire contract with the standalone booking protocol. IDs and transport fields
// are translated at the Dashboard boundary; authority never comes from JSON.
const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
const Timestamp = z.string().max(64).refine(value => Number.isFinite(Date.parse(value)), 'Invalid timestamp')
export const PageStudioBookingStatusSchema = z.enum(['enquiry', 'quoted', 'approved', 'rejected', 'customer-confirmed', 'completed', 'cancelled'])
const Quote = z.object({ amountCents: z.number().int().min(0).max(100_000_000), currency: z.string().regex(/^[A-Z]{3}$/), expiresAt: Timestamp, version: z.number().int().min(1) }).strict()
export const PageStudioBookingSchema = z.object({
  id: Id,
  scope: PageStudioContentScopeSchema,
  createdAt: Timestamp,
  requestedAt: Timestamp,
  customer: z.object({ name: z.string().trim().min(1).max(120), email: z.string().email(), phone: z.string().trim().min(6).max(40) }).strict(),
  pickup: z.string().trim().min(1).max(240),
  dropoff: z.string().trim().min(1).max(240),
  travelAt: Timestamp,
  durationMinutes: z.number().int().min(1).max(2880),
  passengers: z.number().int().min(1).max(500),
  occasion: z.string().trim().max(160),
  vehicleId: Id.nullable(),
  quote: Quote.nullable(),
  status: PageStudioBookingStatusSchema
}).strict()
export const PageStudioBookingAggregateSchema = z.object({ booking: PageStudioBookingSchema, version: z.number().int().min(0), processedCommands: z.array(Id) }).strict()
export const PageStudioBookingEnquirySchema = PageStudioBookingSchema.pick({ customer: true, pickup: true, dropoff: true, travelAt: true, durationMinutes: true, passengers: true, occasion: true }).extend({ bookingId: Id, requestKey: Id, vehicleId: z.null().optional() }).strict()
export const PageStudioBookingCommandSchema = z.object({
  actor: z.literal('operator'), bookingId: Id,
  expectedVersion: z.number().int().min(0), idempotencyKey: Id,
  nextStatus: z.enum(['enquiry', 'quoted', 'approved', 'rejected', 'cancelled', 'completed']),
  quote: Quote.optional(), vehicleId: Id.nullable().optional()
}).strict()
export const PageStudioBookingFiltersSchema = z.object({ siteId: z.string().uuid(), status: PageStudioBookingStatusSchema.optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict()
export type PageStudioBookingAggregate = z.infer<typeof PageStudioBookingAggregateSchema>
