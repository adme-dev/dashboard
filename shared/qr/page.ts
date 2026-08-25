import { z } from 'zod'

/**
 * Hosted QR landing page configuration. Stored as `qr_pages.config`; rendered server-side by
 * server/utils/qr/landing/render.ts. Keep this schema the single source of truth for both the
 * editor and the public form validation.
 */
export const QR_PAGE_TEMPLATES = ['lead', 'interest', 'subscribe', 'competition'] as const
export type QrPageTemplate = typeof QR_PAGE_TEMPLATES[number]

export const QR_FIELD_TYPES = ['text', 'email', 'tel', 'postcode', 'select', 'checkbox', 'textarea'] as const
export type QrFieldType = typeof QR_FIELD_TYPES[number]

const KEY = /^[a-z][a-z0-9_]{0,39}$/
const HEX = /^#[0-9a-fA-F]{6}$/
const HTTP_URL = z.string().trim().url().max(2048).refine(u => /^https?:\/\//i.test(u), 'Must be an http(s) URL')

export const QrPageFieldSchema = z.object({
  key: z.string().regex(KEY, 'Field keys are lowercase letters, digits and underscores'),
  label: z.string().trim().min(1).max(80),
  type: z.enum(QR_FIELD_TYPES).default('text'),
  required: z.boolean().default(true),
  placeholder: z.string().trim().max(120).optional(),
  options: z.array(z.string().trim().min(1).max(80)).max(20).optional()
}).strict()
export type QrPageField = z.infer<typeof QrPageFieldSchema>

export const QrPageConfigSchema = z.object({
  headline: z.string().trim().min(1).max(120),
  subheadline: z.string().trim().max(200).default(''),
  body_md: z.string().max(4000).default(''),
  cta_label: z.string().trim().min(1).max(40).default('Send'),
  fields: z.array(QrPageFieldSchema).min(0).max(6).default([]),
  consent_text: z.string().trim().max(1200).default('We collect the details you enter to respond to your enquiry. See our privacy policy for how we handle personal information and how to opt out.'),
  marketing_consent: z.boolean().default(false),
  marketing_consent_label: z.string().trim().max(200).default('Keep me updated with offers and news'),
  success_headline: z.string().trim().min(1).max(120).default('Thanks — you\'re in'),
  success_body: z.string().trim().max(1000).default('We\'ve received your details.'),
  success_redirect_url: HTTP_URL.nullable().default(null),
  theme: z.object({
    bg: z.string().regex(HEX).default('#0f1312'),
    fg: z.string().regex(HEX).default('#edf2ef'),
    accent: z.string().regex(HEX).default('#1f9d5a'),
    scheme: z.enum(['dark', 'light']).default('dark')
  }).default({ bg: '#0f1312', fg: '#edf2ef', accent: '#1f9d5a', scheme: 'dark' }),
  pixels: z.object({
    ga4_measurement_id: z.string().trim().regex(/^G-[A-Z0-9]{4,16}$/).nullable().default(null),
    meta_pixel_id: z.string().trim().regex(/^\d{6,20}$/).nullable().default(null),
    gtm_container_id: z.string().trim().regex(/^GTM-[A-Z0-9]{4,12}$/).nullable().default(null)
  }).default({ ga4_measurement_id: null, meta_pixel_id: null, gtm_container_id: null }),
  footer: z.object({
    promoter_name: z.string().trim().max(120).default(''),
    privacy_url: HTTP_URL.nullable().default(null),
    terms_url: HTTP_URL.nullable().default(null)
  }).default({ promoter_name: '', privacy_url: null, terms_url: null }),
  hero_asset_id: z.string().uuid().nullable().default(null),
  logo_asset_id: z.string().uuid().nullable().default(null)
}).strict()
export type QrPageConfig = z.infer<typeof QrPageConfigSchema>

export const DEFAULT_FIELDS: Record<QrPageTemplate, QrPageField[]> = {
  lead: [
    { key: 'full_name', label: 'Your name', type: 'text', required: true },
    { key: 'phone', label: 'Mobile', type: 'tel', required: true }
  ],
  interest: [
    { key: 'full_name', label: 'Your name', type: 'text', required: true },
    { key: 'email', label: 'Email', type: 'email', required: true },
    { key: 'postcode', label: 'Postcode', type: 'postcode', required: false }
  ],
  subscribe: [
    { key: 'email', label: 'Email', type: 'email', required: true }
  ],
  competition: [
    { key: 'full_name', label: 'Your name', type: 'text', required: true },
    { key: 'phone', label: 'Mobile', type: 'tel', required: true },
    { key: 'postcode', label: 'Postcode', type: 'postcode', required: true }
  ]
}

export function defaultPageConfig(template: QrPageTemplate, seed: { name?: string, clientName?: string } = {}): QrPageConfig {
  const base = {
    lead: { headline: `Get in touch with ${seed.clientName ?? 'us'}`, subheadline: 'Leave your details and we\'ll call you back.', cta_label: 'Request a call' },
    interest: { headline: 'Register your interest', subheadline: 'Be first to hear when it launches.', cta_label: 'Register' },
    subscribe: { headline: 'Stay in the loop', subheadline: 'Offers and news, straight to your inbox.', cta_label: 'Subscribe' },
    competition: { headline: 'Enter to win', subheadline: 'Scan, enter, done.', cta_label: 'Enter now' }
  }[template]
  return QrPageConfigSchema.parse({
    ...base,
    fields: DEFAULT_FIELDS[template],
    marketing_consent: template !== 'lead',
    footer: { promoter_name: seed.clientName ?? '' }
  })
}

/** Australian postcodes are 4 digits; strip anything else. */
export function normalisePostcode(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  return /^\d{4}$/.test(digits) ? digits : null
}
