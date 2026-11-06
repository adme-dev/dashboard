import { z } from 'zod'

// Values are feed data only, never scripts, URLs, object paths outside inventory, or secrets.
const text = z.string().trim().min(1).max(300).refine(v => !/https?:\/\/|bearer\s|token[=:]|secret[=:]/i.test(v))
const source = z.enum(['address', 'street', 'city', 'state', 'postcode', 'country', 'drive', 'drivetrain', 'condition', 'listing_type', 'body_style', 'fuel_type', 'transmission', 'color', 'exterior_colour_generic', 'address.street', 'address.city', 'address.region', 'address.postal_code', 'address.country'])
const target = z.enum(['address', 'street', 'city', 'state', 'postcode', 'country', 'drive', 'drivetrain', 'condition', 'body_style', 'fuel_type', 'transmission', 'color', 'g:condition', 'g:body_style', 'g:color', 'g:transmissions'])
const valueMap = z.strictObject({ type: z.literal('valueMap'), map: z.record(z.string().min(1).max(160), text).refine(v => Object.keys(v).length > 0 && Object.keys(v).length <= 100 && !Object.keys(v).some(k => ['__proto__', 'constructor', 'prototype'].includes(k))), default: text.optional() })
export const departmentFeedMappingUpdateSchema = z.strictObject({
  target_field: target,
  source_field: source.optional(),
  fallback_value: z.union([text, z.strictObject({ line1: text.optional(), city: text.optional(), suburb: text.optional(), state: text.optional(), postcode: text.optional(), country: text.optional() }).refine(v => Object.keys(v).length > 0)]).optional(),
  transformations: z.array(z.union([valueMap, z.strictObject({ type: z.enum(['trim', 'uppercase', 'lowercase']) })])).max(10).optional()
}).refine(v => v.source_field !== undefined || v.fallback_value !== undefined || v.transformations !== undefined).refine(v => typeof v.fallback_value !== 'object' || v.target_field === 'address')
export const departmentFeedMappingUpdatesSchema = z.array(departmentFeedMappingUpdateSchema).min(1).max(30).refine(v => new Set(v.map(r => r.target_field)).size === v.length)
export const departmentFeedPlatformSettingsSchema = z.strictObject({
  store_code: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional(),
  store_address: text.optional(),
  fb_page_id: z.string().regex(/^\d{1,30}$/).optional(),
  website_domain: z.string().trim().regex(/^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,63}$/).max(253).optional(),
  channel_link: z.string().url().max(400).optional(),
  link_templatePreset: z.enum(['default', 'imotor']).optional()
}).refine(v => Object.keys(v).length > 0)
export type MappingUpdate = z.infer<typeof departmentFeedMappingUpdateSchema>
export type PlatformSettingsPatch = z.infer<typeof departmentFeedPlatformSettingsSchema>

export function mergeFeedMappings(existing: Record<string, unknown>, updates?: MappingUpdate[]) {
  if (!updates) return existing
  const rules = existing.rules === undefined ? [] : existing.rules
  if (!Array.isArray(rules) || rules.some(r => !r || typeof r !== 'object' || typeof r.target_field !== 'string')) throw new Error('Unsupported baseline mappings')
  const changed = new Set(updates.map(r => r.target_field))
  // Keep untouched rules byte-for-byte; one merged replacement per changed target.
  return { ...existing, rules: [
    ...rules.filter(r => !changed.has(r.target_field)),
    ...updates.map((update) => {
      const matches = rules.filter(r => r.target_field === update.target_field)
      if (matches.length > 1) throw new Error('Ambiguous target mapping')
      return { ...matches[0], ...update }
    })
  ] }
}
function host(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || /^(localhost|\d+(?:\.\d+){3})$/.test(url.hostname)) return null
    return url.hostname.toLowerCase().replace(/^www\./, '')
  } catch { return null }
}
export function mergeFeedPlatformSettings(existing: Record<string, unknown>, patch?: PlatformSettingsPatch) {
  if (!patch) return existing
  const baselineHost = host(existing.website_domain) ?? host(existing.channel_link)
  const { link_templatePreset, ...settings } = patch
  if (settings.website_domain || settings.channel_link || link_templatePreset) {
    if (!baselineHost || [settings.website_domain, settings.channel_link].some(value => value !== undefined && host(value) !== baselineHost)) throw new Error('Dealer website host must match trusted baseline')
  }
  return { ...existing, ...settings, ...(link_templatePreset ? { link_template: link_templatePreset === 'imotor' ? 'https://{domain}/{condition}-cars/for-sale/{stock_number}' : 'https://{domain}/vehicle-for-sale/{stock_number}/{slug}' } : {}) }
}
