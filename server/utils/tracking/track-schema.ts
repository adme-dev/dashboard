/**
 * Behaviour-event ingestion schema for POST /api/public/track (Slice 1).
 *
 * Distinct from the (Slice 2) conversion schema: this accepts the looser set of
 * behavioural events the tag emits. event_id is mandatory and non-empty — the
 * browser is the canonical id source for cross-platform dedup (Pitfall 4).
 *
 * The event-name list is a deliberate SUPERSET that reserves the richer signals
 * (vehicle_view, finance_calculator_interact, trade_in_*, test_drive_booking,
 * generate_lead) the Slice 4 persona/360 engine will aggregate — even though
 * some only start firing once Slice 3 wires forms. Reserving them now keeps the
 * tag and store forward-compatible without a schema change later.
 *
 * Pure module. Single dependency: zod. NEVER throws — parseTrackPayload returns
 * a discriminated-union result.
 */
import { z } from 'zod'

export const TRACK_EVENT_NAMES = [
  // core behaviour (fire in Slice 1)
  'page_view', 'scroll', 'engagement', 'click', 'phone_click', 'directions_click', 'outbound_click',
  'form_start', 'form_submit', 'form_abandonment', 'provider_interaction',
  // tag behavioural signals — dead_click is default-on; the rest fire only when
  // the tag's opt-in `behavioral` mode is enabled. Reserved so the endpoint never
  // 422-rejects a tag-emitted event (see public/track.js).
  'dead_click', 'rage_click', 'idle_start', 'idle_end', 'idle_extended',
  'form_field_timings',
  // reserved richer signals (Slice 3/4 — accepted now, may not fire yet)
  'vehicle_view', 'vehicle_list_view', 'search', 'filter_change',
  'finance_calculator_interact', 'trade_in_start', 'trade_in_complete',
  'test_drive_booking', 'add_to_wishlist', 'video_play', 'video_progress',
  'return_to_vehicle', 'competitive_referrer', 'generate_lead',
  // Phase B funnel & intent signals — fire only when the tag's opt-in
  // `funnelSignals` mode is enabled (see public/track.js).
  'vehicle_comparison', 'exit_intent', 'cta_visible',
  // QR client-360 mirror (server-emitted; see server/utils/qr/export360.ts)
  'qr_scan', 'qr_landing_view', 'qr_lead'
] as const

export const TrackEventNameSchema = z.enum(TRACK_EVENT_NAMES)

const AttributionSchema = z.object({
  utm_source: z.string().max(512).nullable().optional(),
  utm_medium: z.string().max(512).nullable().optional(),
  utm_campaign: z.string().max(512).nullable().optional(),
  utm_content: z.string().max(512).nullable().optional(),
  utm_term: z.string().max(512).nullable().optional(),
  gclid: z.string().max(512).nullable().optional(),
  gbraid: z.string().max(512).nullable().optional(),
  wbraid: z.string().max(512).nullable().optional(),
  fbclid: z.string().max(512).nullable().optional(),
  fbc: z.string().max(512).nullable().optional(),
  fbp: z.string().max(512).nullable().optional(),
  ttclid: z.string().max(512).nullable().optional(),
  msclkid: z.string().max(512).nullable().optional(),
  li_fat_id: z.string().max(512).nullable().optional(),
  ga_client_id: z.string().max(512).nullable().optional(),
  email_click_id: z.string().max(128).nullable().optional(),
  xf_qr: z.string().max(32).nullable().optional(),
  xf_qr_variant: z.string().max(1).nullable().optional()
})

const TrackEventSchema = z.object({
  event_id: z.string().min(1, 'event_id is mandatory (browser-canonical dedup key)').max(128),
  event_name: TrackEventNameSchema,
  anon_id: z.string().min(1).max(128),
  session_id: z.string().max(128).nullable().optional(),
  page_url: z.string().max(2048).nullable().optional(),
  referrer: z.string().max(2048).nullable().optional(),
  occurred_at: z.number().int().positive().optional(), // ms since epoch (browser clock)
  attribution: AttributionSchema.optional(),
  event_data: z.record(z.string(), z.unknown()).optional()
})

export const TrackPayloadSchema = z.object({
  events: z.array(TrackEventSchema).min(1).max(50),
  // Raw `_xf_consent` cookie value, forwarded by the tag from the dealer domain.
  // The collect endpoint can't read that cookie cross-origin, so the tag relays
  // it here; the endpoint prefers it over the (absent) request cookie.
  consent: z.string().max(4096).nullable().optional()
})

export type TrackEvent = z.infer<typeof TrackEventSchema>
export type TrackPayload = z.infer<typeof TrackPayloadSchema>

export type TrackParseResult
  = | { ok: true, payload: TrackPayload, errors?: undefined }
    | { ok: false, errors: { path: string, message: string }[] }

export function parseTrackPayload(input: unknown): TrackParseResult {
  try {
    const result = TrackPayloadSchema.safeParse(input)
    if (result.success) return { ok: true, payload: result.data }
    return {
      ok: false,
      errors: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }))
    }
  } catch {
    return { ok: false, errors: [{ path: '', message: 'Invalid body' }] }
  }
}
