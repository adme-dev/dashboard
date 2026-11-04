import { describe, expect, it } from 'vitest'
import { emailBrandDefaults, newEmailBlockDefaults } from '../../shared/emailRendering/designBrandDefaults'
import { applyDesignBrand, applyDesignLock, designLockTargets } from '../../shared/emailRendering/designBrand'
import { assertStaffDesignEdit, validateEmailDesign } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'
import { applyDesignerOperations, designerBlockId } from '../../shared/emailRendering/designDesigner'
import { applyModuleInstance, extractDesignModule, insertDesignImage } from '../../shared/emailRendering/designModules'

const kit = { name: 'Client', colors: [{ role: 'primary', hex: '#123456' }], fonts: [{ role: 'body', family: 'Private uploaded font', assets: [{ id: crypto.randomUUID(), weight: 400 }] }] }
const snapshot = () => ({ kitId: crypto.randomUUID(), versionId: crypto.randomUUID(), version: 1, name: 'Client', defaults: emailBrandDefaults(kit) })
describe('explicit email brand defaults', () => {
  it('maps unsupported uploaded fonts to an explicit supported fallback without URLs/assets', () => {
    const defaults = emailBrandDefaults(kit)
    expect(defaults).toEqual({ primaryColor: '#123456', fontFamily: 'MODERN_SANS', contentWidth: 600, fontFallback: true, requestedFont: 'Private uploaded font' })
    expect(emailBrandDefaults({ fonts: [{ role: 'body', family: 'Georgia' }] }).fontFamily).toBe('MODERN_SERIF')
  })
  it('snapshots only future defaults and leaves authored blocks and content grants intact', () => {
    const base = validateEmailDesign(structuredDesign())
    const branded = applyDesignBrand(base, snapshot())
    expect(branded.blocks).toEqual({ ...base.blocks, root: { ...base.blocks.root, data: { ...base.blocks.root.data, props: { primaryColor: '#123456' } } } })
    expect(branded.policy).toEqual(base.policy)
    expect(branded.source.brand?.defaults.fontFallback).toBe(true)
    expect(() => assertStaffDesignEdit(base, branded)).toThrow()
    const changed = structuredClone(branded)
    changed.blocks.heading.data.props!.text = 'Editable copy'
    expect(() => assertStaffDesignEdit(branded, changed)).not.toThrow()
    expect(newEmailBlockDefaults('Button', branded)).toEqual({ props: { buttonBackgroundColor: '#123456' }, style: { fontFamily: 'MODERN_SANS' } })
    expect(branded.blocks.cta.data.props).not.toHaveProperty('buttonBackgroundColor')
  })
  it('uses the same defaults for deterministic designer additions without restyling duplicates or protected existing sections', () => {
    const base = validateEmailDesign(structuredDesign())
    base.blocks.root.data.props = { fontFamily: 'BOOK_SERIF', contentWidth: 700, canvasColor: '#ffffff' }
    const branded = applyDesignBrand(base, snapshot())
    expect(branded.blocks.root.data.props).toMatchObject({ fontFamily: 'BOOK_SERIF', contentWidth: 700, canvasColor: '#ffffff' })
    const operationId = crypto.randomUUID()
    const next = applyDesignerOperations(branded, [{ op: 'add-section', parentId: 'root', index: 2, sectionType: 'Button' }, { op: 'duplicate-section', blockId: 'cta', parentId: 'root', index: 3 }], operationId)
    expect(next.blocks[designerBlockId(operationId, 0)].data).toMatchObject({ props: { buttonBackgroundColor: '#123456' }, style: { fontFamily: 'MODERN_SANS' } })
    expect(next.blocks[designerBlockId(operationId, 1)]).toEqual(base.blocks.cta)
    const empty = validateEmailDesign(structuredDesign())
    empty.blocks = { root: { type: 'EmailLayout', data: { childrenIds: [] } } }
    empty.policy.editableFields = []
    empty.lineage = []
    expect(applyDesignBrand(empty, snapshot()).blocks.root.data.props).toMatchObject({ fontFamily: 'MODERN_SANS', contentWidth: 600 })
  })
})
describe('agency design lock derivation', () => {
  it('derives valid lock targets from persisted fields, preserves content grants, and refuses arbitrary policy paths', () => {
    const base = validateEmailDesign(structuredDesign())
    base.blocks.heading.data.style = { color: '#123456', padding: { top: 1, left: 1, right: 1, bottom: 1 } }
    const next = applyDesignLock(base, { blockId: 'heading', target: 'style', field: 'data.style.color', locked: true })
    expect(next.policy.editableFields).toEqual(base.policy.editableFields)
    expect(next.policy.designerLocks?.styleFields).toEqual(['heading.data.style.color'])
    expect(designLockTargets(base).find(t => t.blockId === 'heading')?.styleFields).toContain('data.style.padding.top')
    expect(() => applyDesignLock(base, { blockId: 'heading', target: 'style', field: 'data.props.text', locked: true })).toThrow()
    expect(() => applyDesignLock(base, { blockId: 'missing', target: 'block', locked: true })).toThrow()
    expect(() => assertStaffDesignEdit(base, next)).toThrow()
  })
  it('relaxes only explicit selected locks and keeps legal/content policy intact', () => {
    const base = validateEmailDesign(structuredDesign())
    const locked = applyDesignLock(base, { blockId: 'root', target: 'block', locked: true })
    const relaxed = applyDesignLock(locked, { blockId: 'root', target: 'block', locked: false })
    expect(relaxed.policy.editableFields).toEqual(base.policy.editableFields)
    expect(relaxed.policy.designerLocks?.blockIds).toEqual([])
  })
  it('inherits root font/style restrictions to descendant desktop and mobile and prevents structural escape', () => {
    const base = validateEmailDesign(structuredDesign())
    base.blocks.root.data.props = { fontFamily: 'MODERN_SANS' }
    const locked = applyDesignLock(base, { blockId: 'root', target: 'style', field: 'data.props.fontFamily', locked: true })
    for (const mobile of [true, false]) expect(() => applyDesignerOperations(locked, [{ op: 'set-style', blockId: 'heading', mobile, style: { fontFamily: 'BOOK_SERIF' } }], crypto.randomUUID())).toThrow('EDIT_FORBIDDEN')
    for (const op of ['move-section', 'duplicate-section']) expect(() => applyDesignerOperations(locked, [{ op, blockId: 'heading', parentId: 'root', index: 1 }], crypto.randomUUID())).toThrow('EDIT_FORBIDDEN')
    expect(() => applyDesignBrand(locked, snapshot())).toThrow('EDIT_FORBIDDEN')
    const staff = structuredClone(locked)
    staff.blocks.heading.data.props!.text = 'Staff copy still editable'
    expect(() => assertStaffDesignEdit(locked, staff)).not.toThrow()
    expect(() => applyDesignerOperations(locked, [{ op: 'add-section', parentId: 'root', index: 0, sectionType: 'Button' }], crypto.randomUUID())).toThrow('EDIT_FORBIDDEN')
    expect(() => insertDesignImage(locked, { id: crypto.randomUUID(), sha256: 'a'.repeat(64), bytes: 1, width: 1, height: 1, mimeType: 'image/png' }, 'https://example.test/image.png', crypto.randomUUID(), { parentId: 'root', index: 0 })).toThrow('EDIT_FORBIDDEN')
  })
  it('does not let module insertion or updating bypass inherited or instance locks; explicit detach preserves them', () => {
    const base = validateEmailDesign(structuredDesign())
    const record = { moduleId: crypto.randomUUID(), revisionId: crypto.randomUUID(), design: extractDesignModule(base, ['heading'], [], []) }
    const request = { version: 1 as const, operationId: crypto.randomUUID(), draftId: crypto.randomUUID(), expectedDraftRevisionId: crypto.randomUUID(), command: 'insert-module' as const, moduleId: record.moduleId, revisionId: record.revisionId, parentId: 'root', index: 0 }
    const inserted = applyModuleInstance(base, request, [record])
    const root = inserted.moduleInstances[0].rootBlockIds[0]
    const locked = applyDesignLock(inserted, { target: 'block', blockId: root, locked: true })
    expect(() => applyModuleInstance(locked, { ...request, command: 'update-module-instance', instanceId: request.operationId, overrides: 'discard' }, [record])).toThrow('EDIT_FORBIDDEN')
    const detached = applyModuleInstance(locked, { ...request, command: 'detach-module-instance', instanceId: request.operationId }, [record])
    expect(detached.blocks).toEqual(locked.blocks)
    expect(detached.policy).toEqual(locked.policy)
    base.policy.designerLocks = { blockIds: ['root'], styleFields: [] }
    expect(() => applyModuleInstance(base, request, [record])).toThrow('EDIT_FORBIDDEN')
  })
  it('maps inherited semantic colours to mobile/CTA overrides and derives mobile-only lock fields', () => {
    const base = validateEmailDesign(structuredDesign())
    base.blocks.root.data.props = { textColor: '#111111' }
    base.blocks.heading.data.mobile = { style: { fontSize: 18 } }
    expect(designLockTargets(base).find(t => t.blockId === 'heading')?.styleFields).toContain('data.style.fontSize')
    const locked = applyDesignLock(base, { target: 'style', blockId: 'root', field: 'data.props.textColor', locked: true })
    expect(() => applyDesignerOperations(locked, [{ op: 'set-props', blockId: 'cta', props: { buttonTextColor: '#abcdef' } }], crypto.randomUUID())).toThrow('EDIT_FORBIDDEN')
    expect(() => applyDesignerOperations(locked, [{ op: 'set-style', blockId: 'heading', mobile: true, style: { color: '#abcdef' } }], crypto.randomUUID())).toThrow('EDIT_FORBIDDEN')
    base.blocks.heading.data.mobile = { style: { fontFamily: 'BOOK_SERIF' } }
    const childLock = applyDesignLock(base, { target: 'style', blockId: 'heading', field: 'data.style.fontFamily', locked: true })
    expect(() => applyDesignerOperations(childLock, [{ op: 'set-props', blockId: 'root', props: { fontFamily: 'MONOSPACE' } }], crypto.randomUUID())).toThrow('EDIT_FORBIDDEN')
  })
})
