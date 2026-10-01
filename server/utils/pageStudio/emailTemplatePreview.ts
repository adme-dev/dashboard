import { ValidatedEmailTemplateSchema, type EmailTemplate } from '~~/shared/pageStudio/emailTemplates'
import { renderFlyhubDocumentToHtml } from '~~/server/utils/email-marketing/render/flyhub-html-renderer'
import { escapeHtml } from '~~/server/utils/email-marketing/render/blocks/helpers'
import type { FlyhubDocument } from '~~/server/utils/email-marketing/render/blocks/types'

/** Safe adapter into the existing EDM renderer. No raw markup, remote images,
 * arbitrary style objects, answer interpolation into URLs, or agency state. */
export function renderCustomerEmailPreview(input: EmailTemplate, context: { siteName: string, formName: string, fields: Array<{ id: string, name: string, type: string }> }) {
  const template = ValidatedEmailTemplateSchema.parse(input)
  const values: Record<string, string> = { 'site.name': context.siteName, 'form.name': context.formName }
  const resolve = (value: string) => value.replace(/\{\{(site.name|form.name)\}\}/g, (_, variable: string) => values[variable] ?? '')
  // Bound and strip header controls even if a saved site/form name contains them.
  const header = (value: string) => resolve(value).replace(/[\r\n\t]/g, ' ').slice(0, 998)
  const doc: FlyhubDocument = { root: { type: 'EmailLayout', data: { props: { backdropColor: template.backgroundColor, canvasColor: template.canvasColor, textColor: template.textColor, fontFamily: template.fontFamily, borderRadius: 12 }, childrenIds: [] } } }
  const identity = template.identity
  const safeText = (value: string) => escapeHtml(resolve(value)).replace(/\n/g, '<br>')
  if (identity && (identity.businessName.trim() || identity.tagline.trim())) {
    doc.root.data.childrenIds!.push('business-header')
    doc['business-header'] = { type: 'Text', data: { style: { color: template.accentColor, fontSize: 14, padding: { top: 30, bottom: 20, left: 28, right: 28 } }, props: { text: [identity.businessName.trim() ? `<strong>${safeText(identity.businessName)}</strong>` : '', identity.tagline.trim() ? safeText(identity.tagline) : ''].filter(Boolean).join('<br>') } } }
  }
  for (const [index, block] of template.blocks.entries()) {
    const id = `template-${index}`
    doc.root.data.childrenIds!.push(id)
    const style = { color: template.textColor, padding: { top: 12, bottom: 12, left: 28, right: 28 } }
    if (block.type === 'heading') doc[id] = { type: 'Heading', data: { style: { ...style, color: template.accentColor }, props: { level: index === 0 ? 'h1' : 'h2', text: resolve(block.text) } } }
    else if (block.type === 'text') doc[id] = { type: 'Text', data: { style, props: { text: escapeHtml(resolve(block.text)).replace(/\n/g, '<br>') } } }
    else if (block.type === 'divider') doc[id] = { type: 'Divider', data: { style, props: { lineColor: template.accentColor, lineThickness: 1 } } }
    else if (block.type === 'button') doc[id] = { type: 'Button', data: { style, props: { text: resolve(block.text), url: '#', buttonBackgroundColor: template.accentColor, buttonTextColor: '#ffffff' } } }
    else doc[id] = { type: 'Text', data: { style, props: { text: context.fields.filter(field => field.type !== 'hidden').map(field => `<p><strong>${escapeHtml(field.name)}</strong><br>Example answer</p>`).join('') || '<p>No visible fields in this form.</p>' } } }
  }
  if (identity) {
    const contact = [identity.businessName, identity.phone, identity.email, identity.address, identity.websiteUrl].filter(value => value.trim()).map(safeText)
    const social = identity.socials.map(item => `<a href="#" style="color:${template.accentColor};text-decoration:underline;">${escapeHtml(item.platform)}</a>`).join(' &nbsp; ')
    const sections = [contact.join('<br>'), social, identity.disclaimer.trim() ? safeText(identity.disclaimer) : ''].filter(Boolean)
    if (sections.length) {
      doc.root.data.childrenIds!.push('business-footer')
      doc['business-footer'] = { type: 'Text', data: { style: { color: template.textColor, backgroundColor: template.backgroundColor, fontSize: 13, padding: { top: 24, bottom: 28, left: 28, right: 28 } }, props: { text: sections.join('<br><br>') } } }
    }
  }
  const subject = header(template.subject)
  const preheader = header(template.preheader)
  const html = renderFlyhubDocumentToHtml(doc, { subjectLine: escapeHtml(subject), previewText: escapeHtml(preheader), primaryColor: template.accentColor })
    .replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src \'none\'; form-action \'none\'; base-uri \'none\'">')
  return { subject, preheader, html, sample: true as const }
}
