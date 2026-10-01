import { z } from 'zod'
import { PageStudioContentScopeSchema } from './businessContent'

const Identity = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
const singleLine = (value: string) => Array.from(value).every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
const line = z.string().max(200).refine(singleLine, 'Use a single line')
const text = z.string().max(8000)
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/, 'Use a six-digit hex colour, for example #243047')
const link = z.string().max(2048).url().refine((value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !/[\s{}<>"']/.test(value)
  } catch {
    return false
  }
}, 'Use a fixed HTTPS link without variables or credentials')
export const EmailImageSchema = z.object({ assetId: z.string().uuid(), alt: z.string().trim().min(1, 'Describe the image for people who cannot see it').max(300), width: z.number().int().min(40).max(600), alignment: z.enum(['left', 'center', 'right']) }).strict()
export type EmailImage = z.infer<typeof EmailImageSchema>
export const EMAIL_IMAGE_MAX_BYTES = 512 * 1024
export const EMAIL_IMAGES_MAX_BYTES = 2 * 1024 * 1024
export const socialPlatforms = ['Facebook', 'Instagram', 'LinkedIn', 'YouTube', 'TikTok', 'X'] as const
export const EmailIdentitySchema = z.object({
  logo: EmailImageSchema.optional(),
  businessName: line, tagline: line, phone: line,
  email: z.union([z.literal(''), z.string().email().max(254)]),
  address: z.string().max(1000), websiteUrl: z.union([z.literal(''), link]),
  disclaimer: z.string().max(4000),
  socials: z.array(z.object({ platform: z.enum(socialPlatforms), url: link }).strict()).max(6)
    .refine(items => new Set(items.map(item => item.platform)).size === items.length, 'Choose each social platform only once')
}).strict()
export type EmailIdentity = z.infer<typeof EmailIdentitySchema>
export const emptyEmailIdentity = (): EmailIdentity => ({ businessName: '{{site.name}}', tagline: '', phone: '', email: '', address: '', websiteUrl: '', disclaimer: '', socials: [] })
export const EmailAudienceSchema = z.enum(['team', 'customer'])
export const EmailTemplateBlockSchema = z.discriminatedUnion('type', [
  EmailImageSchema.extend({ id: Identity, type: z.literal('image') }),
  z.object({ id: Identity, type: z.literal('heading'), text }).strict(),
  z.object({ id: Identity, type: z.literal('text'), text }).strict(),
  z.object({ id: Identity, type: z.literal('divider') }).strict(),
  z.object({ id: Identity, type: z.literal('answers') }).strict(),
  z.object({ id: Identity, type: z.literal('button'), text: line, url: link }).strict()
])
export const EmailTemplateSchema = z.object({
  schemaVersion: z.literal(1), subject: line.refine(value => value.trim().length > 0, 'Enter a subject'), preheader: line,
  accentColor: color, canvasColor: color, backgroundColor: color, textColor: color,
  identity: EmailIdentitySchema.optional(),
  fontFamily: z.enum(['MODERN_SANS', 'BOOK_SERIF']),
  blocks: z.array(EmailTemplateBlockSchema).min(1).max(30).refine(blocks => new Set(blocks.map(block => block.id)).size === blocks.length, 'Block IDs must be unique')
}).strict().refine(template => template.blocks.filter(block => block.type === 'image').length + (template.identity?.logo ? 1 : 0) <= 6, 'Use up to six images, including your logo')
export type EmailTemplate = z.infer<typeof EmailTemplateSchema>
export type EmailTemplateBlock = z.infer<typeof EmailTemplateBlockSchema>
export type EmailAudience = z.infer<typeof EmailAudienceSchema>
export function validateTemplateVariables(template: EmailTemplate): string[] {
  const errors: string[] = []
  for (const value of [template.subject, template.preheader, ...(template.identity ? [template.identity.businessName, template.identity.tagline, template.identity.phone, template.identity.address, template.identity.disclaimer] : []), ...template.blocks.flatMap(block => 'text' in block ? [block.text] : [])]) {
    const remaining = value.replace(/\{\{([^{}]+)\}\}/g, (_, variable: string) => {
      if (!['site.name', 'form.name'].includes(variable)) errors.push(`Unknown variable: ${variable}`)
      return ''
    })
    if (/[{}]/.test(remaining)) errors.push('Use complete variables such as {{site.name}}')
  }
  return errors
}
export const ValidatedEmailTemplateSchema = EmailTemplateSchema.refine(template => !validateTemplateVariables(template).length, 'Use only the supported website and form name variables')
export const EmailTemplateReadSchema = z.object({ scope: PageStudioContentScopeSchema, audience: EmailAudienceSchema }).strict()
export const EmailTemplateEditSchema = z.object({ checkpointId: Identity, expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1), template: ValidatedEmailTemplateSchema }).strict()
export const EmailTemplateOverridesSchema = z.array(z.object({ definitionId: Identity, template: ValidatedEmailTemplateSchema }).strict()).max(100).refine(items => new Set(items.map(item => item.definitionId)).size === items.length, 'Each form can have only one template override')
export const EmailTemplateOverrideEditSchema = EmailTemplateEditSchema.extend({ template: ValidatedEmailTemplateSchema.nullable() }).strict()
export const emailTemplateRecordFits = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= 1_500_000
export const EmailTemplateWriteSchema = EmailTemplateEditSchema.extend({ overrides: EmailTemplateOverridesSchema.optional(), scope: PageStudioContentScopeSchema, audience: EmailAudienceSchema, actorId: Identity }).strict().refine(value => emailTemplateRecordFits({ template: value.template, overrides: value.overrides ?? [] }), 'The combined email templates are too large. Shorten a template before saving.')
export const EmailTemplateRecordSchema = EmailTemplateReadSchema.extend({ overrides: EmailTemplateOverridesSchema.optional(), checkpointId: Identity, actorId: Identity, revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), updatedAt: z.string().datetime(), template: ValidatedEmailTemplateSchema }).strict().refine(value => emailTemplateRecordFits({ template: value.template, overrides: value.overrides ?? [] }), 'The combined email templates are too large. Shorten a template before saving.')
export interface EmailTemplateState { activation: 'draft_only', canEdit: boolean, record: z.infer<typeof EmailTemplateRecordSchema> | null }
export const EmailTemplatePreviewSchema = z.object({ template: ValidatedEmailTemplateSchema, pageId: Identity, formId: Identity }).strict()
export function starterEmailTemplate(audience: EmailAudience): EmailTemplate {
  return { schemaVersion: 1, subject: audience === 'team' ? 'New submission: {{form.name}} | {{site.name}}' : 'We received your enquiry | {{site.name}}', preheader: audience === 'team' ? 'A new website enquiry is ready to review.' : 'Thank you for getting in touch.', accentColor: '#243047', canvasColor: '#ffffff', backgroundColor: '#f3f4f6', textColor: '#243047', fontFamily: 'MODERN_SANS', blocks: [
    { id: 'heading', type: 'heading', text: audience === 'team' ? 'New submission: {{form.name}}' : 'Thank you for contacting {{site.name}}' },
    { id: 'intro', type: 'text', text: audience === 'team' ? 'Someone has submitted {{form.name}} on {{site.name}}.' : 'Your enquiry has been received. Our team will be in touch.' },
    { id: 'divider', type: 'divider' },
    ...(audience === 'team' ? [{ id: 'answers', type: 'answers' as const }] : []),
    { id: 'footer', type: 'text', text: '{{site.name}}' }
  ] }
}

export function effectiveEmailTemplate(record: EmailTemplateState['record'], audience: EmailAudience, definitionId?: string): EmailTemplate {
  return record?.overrides?.find(item => item.definitionId === definitionId)?.template ?? record?.template ?? defaultWebsiteEmailTemplate(audience)
}

export function defaultWebsiteEmailTemplate(audience: EmailAudience): EmailTemplate {
  const template = starterEmailTemplate(audience)
  return { ...template, identity: emptyEmailIdentity(), blocks: template.blocks.filter(block => block.id !== 'footer') }
}

export function emailTemplateImages(template: EmailTemplate): EmailImage[] {
  return [...(template.identity?.logo ? [template.identity.logo] : []), ...template.blocks.filter((block): block is Extract<EmailTemplateBlock, { type: 'image' }> => block.type === 'image')]
}
