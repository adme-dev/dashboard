import { describe, expect, it } from 'vitest'
import { starterEmailTemplate } from '../../shared/pageStudio/emailTemplates'
import { handleEmailRender } from '../../workers/email-rendering/src/handleRender'

const template = { ...starterEmailTemplate('customer'), schemaVersion: 2, subject: 'Hello {{field.booking.name}}', blocks: [{ id: 'message', type: 'text', text: '{{field.booking.name}} / {{site.name}}' }], fieldBindings: [{ formKey: 'booking', fieldId: 'name', type: 'text', fallback: '{{site.name}} <script>literal</script>' }] }
const input = { version: 1, expectedEnvironment: 'staging', operation: 'customer-preview', template, context: { siteName: 'Demo', formName: 'Booking', formKey: 'booking', fields: [{ id: 'name', type: 'text', name: 'Changed label' }] } }
describe('private field-bound template previews', () => {
  it('uses current canonical IDs and synthetic values, never labels as merge keys', () => {
    const result = handleEmailRender(input, 'staging')
    expect(result).toMatchObject({ ok: true, value: { subject: 'Hello Example answer', sample: true, html: expect.stringContaining('Example answer / Demo') } })
  })
  it('escapes literal, nonrecursive fallbacks when this template is previewed on another form', () => {
    const result = handleEmailRender({ ...input, context: { ...input.context, formKey: 'contact' } }, 'staging')
    expect(result).toMatchObject({ ok: true, value: { subject: 'Hello {{site.name}} <script>literal</script>', html: expect.stringContaining('{{site.name}} &lt;script&gt;literal&lt;/script&gt; / Demo') } })
  })
  it.each([[], [{ id: 'name', type: 'hidden', name: 'Name' }], [{ id: 'name', type: 'email', name: 'Name' }]])('withholds stale matching-form schemas %j', (fields) => {
    expect(handleEmailRender({ ...input, context: { ...input.context, fields } }, 'staging')).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  })
  it('does not allow real answers, defaults or forged source scope through the preview context', () => {
    for (const extra of [{ answers: { name: 'Real answer' } }, { defaults: { name: 'Default' } }, { actorId: 'another' }]) {
      expect(handleEmailRender({ ...input, context: { ...input.context, ...extra } }, 'staging')).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    }
  })
})
