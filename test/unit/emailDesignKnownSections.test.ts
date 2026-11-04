import { describe, expect, it } from 'vitest'
import { applyDesignerOperations, assertDesignerOperationsResult, designerBlockId, designerCapabilities } from '../../shared/emailRendering/designDesigner'
import { parseKnownSplitSection, recogniseKnownSection } from '../../shared/emailRendering/designKnownSections'
import { composerToDesignDraft } from '../../shared/emailRendering/designComposer'
import { oemSplit } from '../../app/utils/edmOemLayouts'
import { renderFlyhubDocumentToHtml } from '../../workers/email-rendering/src/render/flyhub-html-renderer'

const opId = '7b0a4f2e-3c1d-4e5f-9a8b-1c2d3e4f5a6b'
const split = (overrides: Partial<Parameters<typeof oemSplit>[0]> = {}) => oemSplit({ title: 'Your next drive starts here.', copy: 'Choose a time & talk it through.', action: 'Book a test drive', path: 'book-a-test-drive', image: 'https://app.xeroflow.io/email/drive.jpeg', alt: 'Kia EV9 outside', bg: '#F0F4F7', ...overrides })
function design(cta = split()) {
  return composerToDesignDraft({
    root: { type: 'EmailLayout', data: { props: { contentWidth: 600 }, childrenIds: ['intro', 'cta', 'outro'] } },
    intro: { type: 'Heading', data: { props: { text: 'Hello', level: 'h2' } } },
    cta: cta as never,
    outro: { type: 'Text', data: { props: { text: 'Bye' } } }
  }, null)
}
const adopt = (source = design()) => applyDesignerOperations(source, [{ op: 'adopt-known-section', blockId: 'cta' }], opId)

describe('known generated sections become structured layers only on explicit request', () => {
  it('recognises only exact generator output and carries in-place text edits', () => {
    const contents = String(split().data.props?.contents)
    expect(parseKnownSplitSection(contents)).toMatchObject({ kind: 'split-photo', title: 'Your next drive starts here.', copy: 'Choose a time & talk it through.', path: 'book-a-test-drive', image: 'https://app.xeroflow.io/email/drive.jpeg' })
    expect(parseKnownSplitSection(String(split({ reverse: true }).data.props?.contents))?.kind).toBe('split-reverse')
    expect(parseKnownSplitSection(contents.replace('Your next drive', '<strong>Your</strong> next drive'))).toBeNull()
    expect(parseKnownSplitSection(contents.replace('font-size:16px', 'font-size:17px'))).toBeNull()
    expect(parseKnownSplitSection(contents.replace('data-edm-layout="split-photo"', 'data-edm-layout="split-photo" data-x="1"'))).toBeNull()
    expect(recogniseKnownSection({ ...split(), data: { ...split().data, hideOnMobile: true } })).toBeNull()
    expect(recogniseKnownSection({ type: 'Html', data: { props: { contents: '<p>Unknown</p>' } } })).toBeNull()
  })

  it('replaces the section in place with a structured Columns subtree derived from the persisted block', () => {
    const source = design()
    const result = adopt(source)
    const ids = [0, 1, 2, 3, 4].map(index => designerBlockId(opId, 0, index))
    expect(result.blocks.cta).toBeUndefined()
    expect(result.blocks.root.data.childrenIds).toEqual(['intro', ids[0], 'outro'])
    const container = result.blocks[ids[0]!]!
    expect(container.type).toBe('ColumnsContainer')
    expect(container.data.props).toMatchObject({ columnsCount: 2, contentAlignment: 'middle', columns: [{ childrenIds: [ids[1]] }, { childrenIds: [ids[2], ids[3], ids[4]] }] })
    expect(result.blocks[ids[1]!]).toMatchObject({ type: 'Image', data: { props: { url: 'https://app.xeroflow.io/email/drive.jpeg', alt: 'Kia EV9 outside' } } })
    expect(result.blocks[ids[2]!]).toMatchObject({ type: 'Heading', data: { props: { text: 'Your next drive starts here.' } } })
    expect(result.blocks[ids[3]!]).toMatchObject({ type: 'Text', data: { props: { text: 'Choose a time & talk it through.' } } })
    expect(result.blocks[ids[4]!]).toMatchObject({ type: 'Button', data: { props: { text: 'Book a test drive', url: 'https://example.com/book-a-test-drive' } } })
    expect(result.policy.editableFields).toEqual(expect.arrayContaining([`${ids[1]}.data.props.url`, `${ids[1]}.data.props.alt`, `${ids[2]}.data.props.text`, `${ids[3]}.data.props.text`, `${ids[4]}.data.props.text`, `${ids[4]}.data.props.url`]))
    expect(result.policy.editableFields.some(path => path.startsWith('cta.'))).toBe(false)
    expect(result.lineage.some(item => item.blockId === 'cta')).toBe(false)
    expect(result.lineage.filter(item => ids.includes(item.blockId))).toHaveLength(5)
    // Everything else is untouched; replay is deterministic for the Apply writer.
    expect(result.blocks.intro).toEqual(source.blocks.intro)
    expect(result.blocks.outro).toEqual(source.blocks.outro)
    expect(result.scope).toEqual(source.scope)
    expect(() => assertDesignerOperationsResult(source, result, [{ op: 'adopt-known-section', blockId: 'cta' }], opId)).not.toThrow()
    const html = renderFlyhubDocumentToHtml(result.blocks as never)
    expect(html).toContain('Your next drive starts here.')
    expect(html).toContain('https://app.xeroflow.io/email/drive.jpeg')
    expect(html).not.toContain('data-edm-layout')
    // The native capability vector is unchanged: this is not a native operation.
    expect(designerCapabilities(source).operations).not.toContain('adopt-known-section')
  })

  it('refuses edited or unknown sections, explicit locks, module links and the root', () => {
    expect(() => adopt(design(split({ copy: 'x' }) && { type: 'Html', data: { props: { contents: String(split().data.props?.contents).replace('font-size:16px', 'font-size:17px') } } } as never))).toThrow('EDIT_FORBIDDEN')
    expect(() => adopt(design({ type: 'Html', data: { props: { contents: '<p>Unknown</p>' } } } as never))).toThrow('EDIT_FORBIDDEN')
    const locked = design()
    locked.policy.designerLocks = { blockIds: ['cta'], styleFields: [] }
    expect(() => adopt(locked)).toThrow('EDIT_FORBIDDEN')
    const linked = design()
    linked.dependencies = [{ moduleId: opId, revisionId: opId }]
    linked.moduleInstances = [{ instanceId: 'instance', moduleId: opId, revisionId: opId, rootBlockIds: ['cta'], overrides: {} }]
    expect(() => adopt(linked)).toThrow('EDIT_FORBIDDEN')
    expect(() => applyDesignerOperations(design(), [{ op: 'adopt-known-section', blockId: 'root' }], opId)).toThrow('EDIT_FORBIDDEN')
  })

  it('fails closed for carried links a structured layer could not safely hold, as designer link edits do', () => {
    for (const image of ['https://app.xeroflow.io/a.jpeg" onerror="x', 'javascript:alert(1)', 'http://app.xeroflow.io/a.jpeg']) {
      expect(() => adopt(design(split({ image }))), image).toThrow('EDIT_FORBIDDEN')
    }
    expect(() => adopt(design(split({ path: 'book" onclick="x' })))).toThrow('EDIT_FORBIDDEN')
  })

  it('carries only literal-safe text and keeps markup or entity spellings in the original Html', () => {
    for (const value of [{ copy: 'Book <today> & save' }, { copy: 'Keep literal &copy; text' }, { copy: 'Legacy &copy without semicolon' }, { title: 'Save <b>now</b>' }, { action: 'Book &#38; go' }]) {
      expect(recogniseKnownSection(split(value) as never), JSON.stringify(value)).toBeNull()
    }
    expect(recogniseKnownSection(split({ copy: 'Plain & simple – 50% "off" {{first_name}}' }) as never)?.copy).toBe('Plain & simple – 50% "off" {{first_name}}')
  })

  it('A0 boundary: any ampersand in the carried image URL or button path keeps the section as Html; no name tables', async () => {
    const module = await import('../../shared/emailRendering/designKnownSections')
    // The conversion no longer models HTML reference names or any parser.
    expect(Object.keys(module)).not.toContain('LEGACY_REFERENCES')
    expect(Object.keys(module)).not.toContain('literalUrlSafe')
    for (const suffix of ['?a=1&b=2', '?utm_source=edm&utm_medium=email', '?x=&#35;tail', '?x=1&copy;', '?x=1&notin', '?x=1&copysr', '?x=1&ubrcy_', '?x=1&'])
      for (const value of [{ image: `https://app.xeroflow.io/a.jpeg${suffix}` }, { path: `book${suffix}` }])
        expect(recogniseKnownSection(split(value) as never), JSON.stringify(value)).toBeNull()
    for (const value of [{ image: 'https://app.xeroflow.io/a-600x400.jpeg?w=600' }, { path: 'book/test-drive?model=ev9#form' }])
      expect(recogniseKnownSection(split(value) as never), JSON.stringify(value)).not.toBeNull()
  })
})
