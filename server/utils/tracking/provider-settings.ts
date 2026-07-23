import { z } from 'zod'

const ProviderSettingSchema = z.strictObject({
  interactions: z.boolean(),
  confirmedLeads: z.boolean()
})

const PodiumProviderSettingSchema = ProviderSettingSchema.extend({
  organizationUid: z.string().uuid().nullable().default(null),
  locationUids: z.array(z.string().uuid()).max(50).default([])
}).refine(
  value => !value.confirmedLeads || (
    value.organizationUid !== null && value.locationUids.length > 0
  ),
  { message: 'Podium identity is required before confirmed leads can be enabled' }
)

export const ProviderTrackingSettingsSchema = z.strictObject({
  podium: PodiumProviderSettingSchema,
  xtime: ProviderSettingSchema
})

export type ProviderTrackingSettings = z.infer<typeof ProviderTrackingSettingsSchema>

export const DEFAULT_PROVIDER_TRACKING_SETTINGS: ProviderTrackingSettings = {
  podium: {
    interactions: true,
    confirmedLeads: false,
    organizationUid: null,
    locationUids: []
  },
  xtime: { interactions: true, confirmedLeads: false }
}

export function normalizeProviderTrackingSettings(input: unknown): ProviderTrackingSettings {
  return ProviderTrackingSettingsSchema.parse(input ?? DEFAULT_PROVIDER_TRACKING_SETTINGS)
}

interface ProviderEvent {
  event_name: string
  event_data?: Record<string, unknown>
}

export function filterProviderInteractionEvents<T extends ProviderEvent>(
  events: T[],
  settings: ProviderTrackingSettings
): T[] {
  return events.filter((event) => {
    if (event.event_name !== 'provider_interaction') return true
    const provider = event.event_data?.provider
    if (provider === 'podium') return settings.podium.interactions
    if (provider === 'xtime') return settings.xtime.interactions
    return true
  })
}
