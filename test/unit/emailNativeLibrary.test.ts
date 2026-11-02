import { describe, expect, it } from 'vitest'
import { parseNativeLibraryContext, replaceDesignImage, insertDesignImage, parseDesignModuleRequest, extractDesignModule } from '../../shared/emailRendering/designModules'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'

const op = '50000000-0000-4000-8000-000000000001'
const asset = { id: op, sha256: 'a'.repeat(64), mimeType: 'image/png' as const, bytes: 24, width: 1, height: 1 }
const source = () => insertDesignImage(structuredDesign(), asset, 'https://app.test/image.png', op, { parentId: 'root', index: 1 })
describe('native library selection and verified image derivation', () => {
  it('orders multi-section publication by canonical reading order and refuses overlapping selection', () => {
    const base = structuredDesign()
    const context = { operationId: op, operations: [], selectedBlockIds: ['cta', 'heading'] }
    expect(parseNativeLibraryContext(base, context, op).selectedBlockIds).toEqual(['heading', 'cta'])
    expect(extractDesignModule(base, ['cta', 'heading'], [], []).rootChildrenIds).toEqual(['heading', 'cta'])
    expect(() => parseNativeLibraryContext(base, { ...context, selectedBlockIds: ['root', 'heading'] }, op)).toThrow()
    expect(() => extractDesignModule(base, ['root', 'heading'], [], [])).toThrow()
  })
  it('derives selected IDs and column zero against captured canonical operations without mutation', () => {
    const base = structuredDesign()
    const input = { operationId: op, operations: [], selectedBlockIds: ['heading'], insertionTarget: { parentId: 'root', index: 1 } }
    expect(parseNativeLibraryContext(base, input, op)).toEqual(input)
    expect(base).toEqual(structuredDesign())
    const columns = validateEmailDesign(base)
    columns.blocks.cols = { type: 'ColumnsContainer', data: { props: { columnsCount: 2, columns: [{ childrenIds: [] }, { childrenIds: [] }] } } }
    columns.blocks.root.data.childrenIds!.push('cols')
    expect(parseNativeLibraryContext(columns, { ...input, selectedBlockIds: ['cols'], insertionTarget: { parentId: 'cols', columnIndex: 0, index: 0 } }, op).insertionTarget?.columnIndex).toBe(0)
  })
  it('rejects forged operation identity, unmapped/duplicate selection and invalid target rather than inventing one', () => {
    const context = { operationId: op, operations: [], selectedBlockIds: ['heading'] }
    for (const change of [
      { operationId: crypto.randomUUID() }, { selectedBlockIds: ['missing'] }, { selectedBlockIds: ['heading', 'heading'] },
      { insertionTarget: { parentId: 'root', columnIndex: null, index: 0 } }, { insertionTarget: { parentId: 'root', index: 999 } },
      { insertionTarget: { parentId: 'heading', index: 0 } }, { actor: 'owner' }
    ])
      expect(() => parseNativeLibraryContext(structuredDesign(), { ...context, ...change }, op)).toThrow()
    expect(parseNativeLibraryContext(structuredDesign(), { ...context, selectedBlockIds: [] }, op).insertionTarget).toBeUndefined()
  })
  it('replaces only URL and asset declarations, retaining IDs, alt, links, layout and old references', () => {
    const base = source(), id = `img_${op}`
    base.blocks[id].data.props = { ...base.blocks[id].data.props, alt: 'Keep alt', linkHref: 'https://example.com', width: 200 }
    base.policy.editableFields.push(`${id}.data.props.linkHref`)
    const replacement = { ...asset, id: crypto.randomUUID(), sha256: 'b'.repeat(64) }
    const next = replaceDesignImage(base, replacement, 'https://app.test/new.png', id, true)
    expect(next.blocks[id]).toEqual({ ...base.blocks[id], data: { ...base.blocks[id].data, props: { ...base.blocks[id].data.props, url: 'https://app.test/new.png' } } })
    expect(next.assets).toEqual([asset, replacement])
    expect(next.lineage).toEqual(base.lineage)
    expect(next.policy).toEqual(base.policy)
    expect(base.blocks[id].data.props.url).toBe('https://app.test/image.png')
  })
  it('refuses inherited locks, pinned instances, nonimages and descriptor collisions', () => {
    const base = source(), id = `img_${op}`
    for (const modify of [
      (d: typeof base) => {
        d.policy.designerLocks = { blockIds: ['root'], styleFields: [] }
      },
      (d: typeof base) => {
        d.policy.designerLocks = { blockIds: [], styleFields: [`${id}.data.props.url`] }
      },
      (d: typeof base) => {
        d.dependencies = [{ moduleId: op, revisionId: op }]
        d.moduleInstances = [{ instanceId: op, moduleId: op, revisionId: op, rootBlockIds: [id], overrides: {} }]
      }
    ]) {
      const locked = structuredClone(base)
      modify(locked)
      expect(() => replaceDesignImage(locked, asset, 'https://app.test/new.png', id, true)).toThrow()
    }
    expect(() => replaceDesignImage(base, asset, 'https://app.test/new.png', 'heading')).toThrow()
    expect(() => replaceDesignImage(base, { ...asset, sha256: 'b'.repeat(64) }, 'https://app.test/new.png', id, true)).toThrow()
  })
  it('allows explicitly URL-granted legacy content but never treats an alt grant as library provenance', () => {
    const base = source(), id = `img_${op}`
    base.lineage = base.lineage.filter(item => item.blockId !== id)
    const fresh = { ...asset, id: crypto.randomUUID() }
    expect(() => replaceDesignImage(base, fresh, 'https://app.test/new.png', id)).toThrow()
    base.policy.editableFields.push(`${id}.data.props.url`)
    expect(replaceDesignImage(base, fresh, 'https://app.test/new.png', id).blocks[id].data.props?.url).toBe('https://app.test/new.png')
  })
  it('retains present-content grants and inherited/mobile URL locks even with proven library provenance', () => {
    for (const kind of ['missing alt grant', 'missing link grant', 'inherited URL lock', 'mobile URL lock']) {
      const base = source(), id = `img_${op}`
      if (kind === 'missing alt grant') base.policy.editableFields = []
      if (kind === 'missing link grant') base.blocks[id].data.props!.linkHref = 'https://example.com'
      if (kind === 'inherited URL lock') base.policy.designerLocks = { blockIds: [], styleFields: ['root.data.props.url'] }
      if (kind === 'mobile URL lock') base.policy.designerLocks = { blockIds: [], styleFields: [`${id}.data.mobile.props.url`] }
      expect(() => replaceDesignImage(base, asset, 'https://app.test/new.png', id, true)).toThrow()
    }
  })
  it.each(['ungranted logo', 'alt-only legacy logo', 'legal value', 'unknown own data', 'locked ancestor'])('refuses %s using canonical editability', (kind) => {
    const base = source(), id = `img_${op}`
    if (kind === 'ungranted logo') base.policy.editableFields = []
    if (kind === 'alt-only legacy logo') base.lineage = base.lineage.filter(item => item.blockId !== id)
    if (kind === 'legal value') base.blocks[id].data.props!.alt = 'postal address'
    if (kind === 'unknown own data') Object.assign(base.blocks[id].data, { extension: true })
    if (kind === 'locked ancestor') base.blocks.root.data.props = { brand: 'protected' }
    expect(() => replaceDesignImage(base, { ...asset, id: crypto.randomUUID() }, 'https://app.test/new.png', id, !['ungranted logo', 'alt-only legacy logo'].includes(kind))).toThrow()
  })
  it('admits only strict replacement IDs, never URL/manifest or role authority', () => {
    const command = { command: 'replace-published-image', version: 1, operationId: op, draftId: op, expectedDraftRevisionId: op, assetId: op, blockId: 'hero' }
    expect(parseDesignModuleRequest(command)).toEqual(command)
    for (const extra of [{ url: 'https://evil.test' }, { asset }, { designer: true }])
      expect(() => parseDesignModuleRequest({ ...command, ...extra })).toThrow()
  })
})
