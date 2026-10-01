import { starterEmailTemplate, emptyEmailIdentity, type EmailAudience, type EmailTemplate } from './emailTemplates'

export const emailDesigns = [
  { id: 'clean', name: 'Clean', description: 'Crisp, clear and professional.', accentColor: '#243047', textColor: '#243047', canvasColor: '#ffffff', backgroundColor: '#eef1f5', fontFamily: 'MODERN_SANS' },
  { id: 'warm', name: 'Warm', description: 'A welcoming, personal touch.', accentColor: '#235347', textColor: '#293e36', canvasColor: '#ffffff', backgroundColor: '#eef3ef', fontFamily: 'MODERN_SANS' },
  { id: 'classic', name: 'Classic', description: 'An elegant letter from your business.', accentColor: '#59472e', textColor: '#39352f', canvasColor: '#fffdf8', backgroundColor: '#f1eee8', fontFamily: 'BOOK_SERIF' }
] as const
export type EmailDesignId = typeof emailDesigns[number]['id']
/** Style changes preserve the customer's wording, contact details and block IDs. */
export function styleEmailTemplate(template: EmailTemplate, id: EmailDesignId): EmailTemplate {
  const { accentColor, textColor, canvasColor, backgroundColor, fontFamily } = emailDesigns.find(item => item.id === id)!
  return { ...template, accentColor, textColor, canvasColor, backgroundColor, fontFamily }
}
export function emailStarterLayout(audience: EmailAudience, kind: 'enquiry' | 'booking', current: EmailTemplate): EmailTemplate {
  const template = starterEmailTemplate(audience)
  template.identity = current.identity ?? emptyEmailIdentity()
  template.blocks = template.blocks.filter(block => block.id !== 'footer')
  if (audience === 'customer') {
    template.subject = kind === 'booking' ? 'Your booking enquiry | {{site.name}}' : 'Thank you for getting in touch | {{site.name}}'
    template.blocks = [
      { id: 'heading', type: 'heading', text: kind === 'booking' ? 'Your enquiry is with our team.' : 'Thank you for getting in touch.' },
      { id: 'intro', type: 'text', text: kind === 'booking' ? 'Thanks for sharing your plans with {{site.name}}. Our team will review the details and contact you about availability and next steps.' : 'We have received your message. The team at {{site.name}} will review your enquiry and get back to you.' },
      ...(kind === 'booking' ? [{ id: 'booking_note', type: 'text' as const, text: 'This acknowledges your enquiry. Your booking is confirmed only when you receive a separate confirmation.' }] : []),
      { id: 'signoff', type: 'text', text: 'Kind regards,\nThe {{site.name}} team' }
    ]
  }
  return { ...current, subject: template.subject, preheader: template.preheader, blocks: template.blocks, identity: template.identity }
}

/** Hydrate editing controls without changing how an older saved email looks. */
export function prepareEmailTemplate(saved: EmailTemplate | null, audience: EmailAudience): EmailTemplate {
  const template: EmailTemplate = JSON.parse(JSON.stringify(saved ?? starterEmailTemplate(audience)))
  template.identity ??= { ...emptyEmailIdentity(), businessName: saved ? '' : '{{site.name}}' }
  if (!saved) template.blocks = template.blocks.filter(block => block.id !== 'footer')
  return template
}
