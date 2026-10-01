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
  const doc: FlyhubDocument = { root: { type: 'EmailLayout', data: { props: { backdropColor: template.backgroundColor, canvasColor: template.canvasColor, textColor: template.textColor, fontFamily: template.fontFamily }, childrenIds: [] } } }
  for (const [index, block] of template.blocks.entries()) {
    const id = `template-${index}`
    doc.root.data.childrenIds!.push(id)
    const style = { color: template.textColor, padding: { top: 12, bottom: 12, left: 24, right: 24 } }
    if (block.type === 'heading') doc[id] = { type: 'Heading', data: { style: { ...style, color: template.accentColor }, props: { level: 'h2', text: resolve(block.text) } } }
    else if (block.type === 'text') doc[id] = { type: 'Text', data: { style, props: { text: escapeHtml(resolve(block.text)).replace(/\n/g, '<br>') } } }
    else if (block.type === 'divider') doc[id] = { type: 'Divider', data: { style, props: { lineColor: template.accentColor, lineThickness: 1 } } }
    else if (block.type === 'button') doc[id] = { type: 'Button', data: { style, props: { text: resolve(block.text), url: '#', buttonBackgroundColor: template.accentColor, buttonTextColor: '#ffffff' } } }
    else doc[id] = { type: 'Text', data: { style, props: { text: context.fields.filter(field => field.type !== 'hidden').map(field => `<p><strong>${escapeHtml(field.name)}</strong><br>Example answer</p>`).join('') || '<p>No visible fields in this form.</p>' } } }
  }
  const subject = header(template.subject)
  const preheader = header(template.preheader)
  const html = renderFlyhubDocumentToHtml(doc, { subjectLine: escapeHtml(subject), previewText: escapeHtml(preheader), primaryColor: template.accentColor })
    .replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src \'none\'; form-action \'none\'; base-uri \'none\'">')
  return { subject, preheader, html, sample: true as const }
}
