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
export const EmailAudienceSchema = z.enum(['team', 'customer'])
export const EmailTemplateBlockSchema = z.discriminatedUnion('type', [
  z.object({ id: Identity, type: z.literal('heading'), text }).strict(),
  z.object({ id: Identity, type: z.literal('text'), text }).strict(),
  z.object({ id: Identity, type: z.literal('divider') }).strict(),
  z.object({ id: Identity, type: z.literal('answers') }).strict(),
  z.object({ id: Identity, type: z.literal('button'), text: line, url: link }).strict()
])
export const EmailTemplateSchema = z.object({
  schemaVersion: z.literal(1), subject: line.refine(value => value.trim().length > 0, 'Enter a subject'), preheader: line,
  accentColor: color, canvasColor: color, backgroundColor: color, textColor: color,
  fontFamily: z.enum(['MODERN_SANS', 'BOOK_SERIF']),
  blocks: z.array(EmailTemplateBlockSchema).min(1).max(30).refine(blocks => new Set(blocks.map(block => block.id)).size === blocks.length, 'Block IDs must be unique')
}).strict()
export type EmailTemplate = z.infer<typeof EmailTemplateSchema>
export type EmailTemplateBlock = z.infer<typeof EmailTemplateBlockSchema>
export type EmailAudience = z.infer<typeof EmailAudienceSchema>
export function validateTemplateVariables(template: EmailTemplate): string[] {
  const errors: string[] = []
  for (const value of [template.subject, template.preheader, ...template.blocks.flatMap(block => 'text' in block ? [block.text] : [])]) {
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
export const EmailTemplateWriteSchema = EmailTemplateEditSchema.extend({ scope: PageStudioContentScopeSchema, audience: EmailAudienceSchema, actorId: Identity }).strict()
export const EmailTemplateRecordSchema = EmailTemplateReadSchema.extend({ checkpointId: Identity, actorId: Identity, revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), updatedAt: z.string().datetime(), template: ValidatedEmailTemplateSchema }).strict()
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
