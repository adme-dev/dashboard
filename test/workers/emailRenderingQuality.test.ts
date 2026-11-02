import { describe, expect, it } from 'vitest'
import { CONDITION_MARKER_PREFIX } from '../../shared/emailRendering/conditions'
import { composerToDesignDraft, validateContentReturn } from '../../shared/emailRendering/designComposer'
import { applyDesignerOperations } from '../../shared/emailRendering/designDesigner'
import { handleEmailRender } from '../../workers/email-rendering/src/handleRender'
import { renderTemplateDocumentLocally } from '../../workers/email-rendering/src/render/document'
import { renderingQualityDocument } from '../fixtures/emailRenderingQuality'
import { documentFixtures, expectedDocumentHtml } from '../fixtures/emailRendering'

const render = (document: unknown, options = {}) => renderTemplateDocumentLocally(document, options)
const rpc = (document: unknown, options = {}) => handleEmailRender({ version: 1, expectedEnvironment: 'staging', operation: 'document', document, options }, 'staging')

describe('opt-in generated rendering quality', () => {
  it('emits bounded generated dark metadata and both dark CSS paths', () => {
    const html = render(renderingQualityDocument())
    expect(html).toContain('<meta name="color-scheme" content="light dark">')
    expect(html).toContain('<meta name="supported-color-schemes" content="light dark">')
    expect(html).toContain('@media (prefers-color-scheme: dark)')
    expect(html).toContain('[data-ogsc] .edm-dark-canvas')
    expect(html).toContain('background-color: #182430 !important')
    expect(html).toContain('color: #f2f4f8 !important')
    expect(html).toContain('width="700"')
    expect(html).not.toContain('@import')
  })
  it('uses safely encoded explicit image variants with a light fallback', () => {
    const html = render(renderingQualityDocument())
    expect(html).toContain('class="edm-light-image"')
    expect(html).toContain('class="edm-dark-image"')
    expect(html).toContain('src="https://assets.example/dark.png?a=1&amp;b=2"')
    expect(html).toContain('src="https://assets.example/light.png?a=1&amp;b=2"')
    expect(html).toContain('alt="Logo &amp; partners"')
    expect(html).toContain('<!--[if !mso]><!-->')
    const doc = renderingQualityDocument()
    doc.root.data.props.darkMode = false
    expect(render(doc)).not.toContain('edm-dark-image')
  })
  it('emits a bounded Outlook VML shape with one non-MSO fallback and literal singlepass values', () => {
    const html = render(renderingQualityDocument(), { variables: { name: 'Ari & "{{other}}"', other: 'SECRET' } })
    expect(html).toContain('<!--[if mso]>')
    expect(html).toContain('<v:roundrect')
    expect(html).toContain('xmlns:v="urn:schemas-microsoft-com:vml"')
    expect(html).toContain('<w:anchorlock/>')
    expect(html).toContain('width:220px')
    expect(html).toContain('fillcolor="#234567"')
    expect(html.match(/Hello Ari &amp; &quot;\{\{other\}\}&quot; &amp; team/g)).toHaveLength(2)
    expect(html).toContain('href="https://example.com/?name=Ari &amp; &quot;{{other}}&quot;&amp;x=1"')
    expect(html).not.toContain('SECRET')
  })
  it('reverses only visual mobile stacking while preserving DOM source order', () => {
    const html = render(renderingQualityDocument())
    expect(html).toContain('class="columns-row edm-reverse-stack"')
    expect(html).toContain('.columns-row.edm-reverse-stack { display: flex !important; flex-direction: column-reverse !important; }')
    expect(html.indexOf('light.png')).toBeLessThan(html.indexOf('<v:roundrect'))
    expect(html).not.toContain('tabindex=')
    expect(html).not.toContain('direction: rtl')
  })
  it.each([320, 960])('retains the shared bounded width %s', (width) => {
    const doc = renderingQualityDocument()
    doc.root.data.props.contentWidth = width
    expect(render(doc)).toContain(`width="${width}"`)
  })
  it('retains authored root primaryColor as authoring-only', () => {
    const doc = renderingQualityDocument()
    Object.assign(doc.root.data.props, { primaryColor: '#abcdef' })
    expect(render(doc)).not.toContain('#abcdef')
  })
  it('preserves complete imported documents byte-for-byte despite root theme flags', () => {
    const contents = '<!DOCTYPE html>\n<html><head><meta name="color-scheme" content="light"><style>@media (max-width:700px){.x{color:red}}</style></head><body><!--[if mso]><p>Office</p><![endif]-->Original &amp; exact</body></html>'
    const doc = { root: { type: 'EmailLayout', data: { props: renderingQualityDocument().root.data.props, childrenIds: ['html'] } }, html: { type: 'Html', data: { props: { documentMode: 'email', contents } } } }
    expect(render(doc)).toBe(contents)
    expect(rpc(doc)).toMatchObject({ ok: true, value: { html: contents } })
  })
  it.each(documentFixtures)('preserves no-flag $name golden output', (fixture) => {
    expect(render(fixture.document, fixture.options)).toBe(expectedDocumentHtml(fixture.name))
  })
  it.each([
    ['root', { darkMode: 'true' }], ['root', { darkBackdropColor: '</style>' }],
    ['root', { darkMode: { enabled: true, surprise: 1 } }],
    ['logo', { darkSrc: 'javascript:alert(1)' }], ['logo', { darkSrc: 'https://127.0.0.1/x' }],
    ['logo', { darkSrc: 'https://assets.example/{{secret}}' }], ['logo', { darkSrc: 42 }],
    ['button', { outlookVml: 1 }], ['button', { outlookWidth: 961 }], ['button', { outlookWidth: -1 }],
    ['columns', { reverseStacking: 'true' }], ['button', { darkMode: true }]
  ])('rejects malicious quality fields on %s: %j', (id, patch) => {
    const doc = renderingQualityDocument()
    Object.assign(doc[id as keyof typeof doc].data.props, patch)
    expect(rpc(doc)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  })
  it('matches direct output through the request handler without mutable input', () => {
    const doc = renderingQualityDocument()
    const before = JSON.stringify(doc)
    const options = { variables: { name: 'Ari & Co' } }
    expect(rpc(doc, options)).toMatchObject({ ok: true, value: { html: render(doc, options) } })
    expect(JSON.stringify(doc)).toBe(before)
  })
  it('applies dark default text to generated text/headings while retaining custom colors', () => {
    const doc = { root: { type: 'EmailLayout', data: { props: { darkMode: true }, childrenIds: ['text', 'heading', 'custom'] } },
      text: { type: 'Text', data: { props: { text: 'Default body' } } },
      heading: { type: 'Heading', data: { props: { text: 'Default heading' } } },
      custom: { type: 'Heading', data: { props: { text: 'Authored color' }, style: { color: '#abc123' } } } }
    const html = render(doc)
    expect(html).toContain('.edm-dark-text { color: #f3f4f6 !important; }')
    expect(html.match(/class="edm-dark-text"/g)).toHaveLength(2)
    expect(html).toContain('color: #abc123;')
  })
  it('evaluates conditions before replacing values in both CTA versions', () => {
    const doc = renderingQualityDocument()
    Object.assign(doc.button.data.props, { visibilityCondition: { version: 1, name: 'Ari only', predicate: { field: 'name', op: 'equals', value: 'Ari' } } })
    const excluded = render(doc, { variables: { name: 'Other' } })
    expect(excluded).not.toContain('<v:roundrect')
    expect(excluded).not.toContain('Hello Other')
    const included = render(doc, { variables: { name: 'Ari' } })
    expect(included).toContain('<v:roundrect')
    expect(included).toContain('Hello Ari &amp; team')
    expect(included).not.toContain(CONDITION_MARKER_PREFIX)
  })
  it('rejects forged compiler markers and visibility on protected generated subtrees', () => {
    const doc = renderingQualityDocument()
    doc.button.data.props.text = CONDITION_MARKER_PREFIX + 'forged'
    expect(rpc(doc)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    doc.button.data.props.text = 'Unsubscribe'
    Object.assign(doc.button.data.props, { visibilityCondition: { version: 1, name: 'Hidden legal', predicate: { field: 'name', op: 'exists' } } })
    expect(rpc(doc)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  })
  it('preserves quality source and pins through no-op return without granting edits/native operations', () => {
    const doc = renderingQualityDocument()
    const source = composerToDesignDraft(doc, '11111111-1111-4111-8111-111111111111')
    source.dependencies = [{ moduleId: 'module', revisionId: 'revision' }]
    source.moduleInstances = [{ instanceId: 'instance', moduleId: 'module', revisionId: 'revision', rootBlockIds: ['logo'], overrides: {} }]
    expect(validateContentReturn(source, source)).toEqual(source)
    expect(source.policy.editableFields).not.toContain('logo.data.props.darkSrc')
    const changed = structuredClone(source)
    changed.blocks.logo.data.props!.darkSrc = 'https://other.example/dark.png'
    expect(() => validateContentReturn(source, changed)).toThrow('EDIT_FORBIDDEN')
    expect(() => applyDesignerOperations(source, [{ op: 'set-props', blockId: 'button', props: { outlookVml: true } }], '10000000-0000-4000-8000-000000000003')).toThrow()
  })
  it.each([
    { fontSize: '24' }, { fontSize: 1e9 }, { padding: { left: -100 } }, { textAlign: 'left; color:red' }
  ])('rejects malformed VML-dependent style %j', (style) => {
    const doc = renderingQualityDocument()
    Object.assign(doc.button.data, { style })
    expect(rpc(doc)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  })

  it('keeps default text readable inside an authored light container in dark mode', () => {
    const doc = { root: { type: 'EmailLayout', data: { props: { darkMode: true }, childrenIds: ['box'] } },
      box: { type: 'Container', data: { style: { backgroundColor: '#ffffff' }, childrenIds: ['text'] } },
      text: { type: 'Text', data: { props: { text: 'Light panel body' } } } }
    expect(render(doc)).not.toContain('class="edm-dark-text"')
  })
  it('caps full-width VML inside a narrow declared column', () => {
    const doc = renderingQualityDocument()
    Object.assign(doc.columns.data.props, { fixedWidths: [350, 100], columnsGap: 0 })
    Object.assign(doc.button.data.props, { fullWidth: true, outlookWidth: 960 })
    expect(render(doc)).toContain('width:36px')
  })
  it('keeps VML dimensions finite when legacy ancestor width settings are malformed', () => {
    const doc = renderingQualityDocument()
    doc.columns.data.props.reverseStacking = false
    Object.assign(doc.columns.data.props, { columnsGap: 'invalid legacy gap' })
    const html = render(doc)
    expect(html).toContain('<v:roundrect')
    expect(html).not.toContain('width:NaNpx')
  })
})
