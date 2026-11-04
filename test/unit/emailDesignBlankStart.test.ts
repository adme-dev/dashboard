import { ensureLegacyDesignDocument } from '../../server/utils/email-marketing/designRevisions'
import { describe, expect, it } from 'vitest'
import { blankStartHarness, blankScope, blankDocument } from '../helpers/emailBlankStart'
import type { DesignHandoff } from '../../shared/emailRendering/designRoundtrip'
import type { DesignerRoundtripRequest } from '../../shared/emailRendering/designDesigner'

function handoff(result: Awaited<ReturnType<ReturnType<typeof blankStartHarness>['execute']>>): DesignHandoff {
  if (!('handoff' in result)) throw new Error('Expected handoff')
  return result.handoff
}
const propose = (h: DesignHandoff, sectionType: 'Heading' | 'Text' | 'Button' = 'Heading'): DesignerRoundtripRequest => ({ command: 'propose', handoffId: h.id, action: { version: 1, action: 'propose-designer-return', operationId: crypto.randomUUID(), scope: h.source.scope, draftId: h.draftId, baseRevisionId: h.baseRevisionId, operations: [{ op: 'add-section', parentId: 'root', index: 0, sectionType }] } })
const apply = (h: DesignHandoff): Extract<DesignerRoundtripRequest, { command: 'apply' }> => ({ command: 'apply', handoffId: h.id, action: { version: 1, action: 'apply-return', operationId: crypto.randomUUID(), scope: h.source.scope, proposalId: h.id, expectedProposalRevisionId: h.proposalRevisionId!, expectedDraftRevisionId: h.baseRevisionId } })

describe('E01 atomic blank start and committed reply recovery', () => {
  it.each(['content', 'staff', 'renderer', 'revoked-during-render'] as const)('rolls fresh blank %s refusal back with zero persistent effects', async (failure) => {
    const h = blankStartHarness()
    const before = structuredClone(h.state)
    if (failure === 'staff') h.setRole('staff')
    if (failure === 'renderer') h.renderer.renderDocument.mockRejectedValueOnce(new Error('render failed'))
    if (failure === 'revoked-during-render') h.renderer.renderDocument.mockImplementationOnce(async () => { h.setRole('staff'); return '<p>rendered</p>' })
    const request = h.start()
    await expect(failure === 'content' ? h.content(request) : h.execute(request)).rejects.toMatchObject(failure === 'renderer' ? { message: 'render failed' } : { code: failure === 'content' ? 'NO_EDITABLE_CONTENT' : 'DESIGNER_REQUIRED' })
    expect(h.state).toEqual(before)
    expect(h.state.document).toBeNull()
    expect(h.state.revisions).toEqual({})
    expect(h.state.handoffs).toEqual({})
    expect(h.state.receipts).toEqual({})
    expect(h.state.writes).toEqual({})
    expect(h.state.template.email_design_revision_id).toBeNull()
  })
  it('starts an unchanged schema0 blank without refreshing the snapshot; changed owner refuses without effects', async () => {
    for (const changed of [false, true]) {
      const h = blankStartHarness()
      const legacy = await ensureLegacyDesignDocument({ kind: 'template', ownerId: h.state.template.id, actorId: h.authority.actorId }, async () => {}, h.transaction)
      if (changed) Object.assign(h.state.template, { subject: 'metadata drift' })
      const before = structuredClone(h.state)
      if (changed) {
        await expect(h.execute(h.start())).rejects.toMatchObject({ code: 'LEGACY_CONTENT_CHANGED' })
        expect(h.state).toEqual(before)
      } else {
        const opened = handoff(await h.execute(h.start()))
        expect(h.state.revisions[legacy.revisionId]).toEqual(before.revisions[legacy.revisionId])
        expect(opened.source.policy.editableFields).toEqual([])
        expect(Object.keys(h.state.revisions)).toHaveLength(2)
      }
    }
  })
  it('rejects a mismatched start scope before initialization writes', async () => {
    const h = blankStartHarness()
    const before = structuredClone(h.state)
    await expect(h.execute({ ...h.start(), clientId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.state).toEqual(before)
  })
  it('does not expose transient discovery source through the designer lookup endpoint owner', async () => {
    const h = blankStartHarness()
    expect(await h.execute({ command: 'lookup', templateId: h.state.template.id })).toEqual({ draft: null })
  })
  it.each([blankScope, null])('exact replay after a committed lost reply keeps one document/conversion/handoff for scope %s', async (scope) => {
    const h = blankStartHarness(scope)
    const request = h.start()
    const first = handoff(await h.execute(request)) // response discarded by caller
    const replay = handoff(await h.execute(request))
    expect(replay).toEqual(first)
    expect(h.state.document.id).toBe(blankDocument)
    expect(Object.values(h.state.revisions).filter(r => r.schema === 1)).toHaveLength(1)
    expect(Object.values(h.state.revisions).filter(r => r.schema === 0)).toHaveLength(1)
    expect(Object.keys(h.state.handoffs)).toHaveLength(1)
    expect(Object.keys(h.state.receipts)).toHaveLength(1)
    const committed = structuredClone(h.state)
    await expect(h.execute({ ...request, clientId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(h.state).toEqual(committed)
    h.setRole('staff')
    await expect(h.execute(request)).rejects.toMatchObject({ code: 'DESIGNER_REQUIRED' })
    expect(h.state).toEqual(committed)
  })
  it('keeps post-commit preview failure distinct from a rollback', async () => {
    const h = blankStartHarness()
    const request = h.start()
    h.renderer.renderDocument.mockResolvedValueOnce('<p>conversion</p>').mockRejectedValueOnce(new Error('reply preview failed'))
    await expect(h.execute(request)).rejects.toThrow('reply preview failed')
    expect(Object.keys(h.state.handoffs)).toHaveLength(1)
    const committed = structuredClone(h.state)
    expect(handoff(await h.execute(request)).id).toBe(request.operationId)
    expect(h.state).toEqual(committed)
  })
  it.each(['Heading', 'Text', 'Button'] as const)('previews, applies once, reads back and reopens a %s added to a blank-derived head', async (sectionType) => {
    const h = blankStartHarness()
    const opened = handoff(await h.execute(h.start()))
    const proposed = await h.execute(propose(opened, sectionType))
    expect('preview' in proposed && proposed.preview.html).toContain('<')
    const request = apply(handoff(proposed))
    const saved = handoff(await h.execute(request))
    expect(handoff(await h.execute(request))).toEqual(saved)
    expect(Object.values(h.state.revisions).filter(r => r.schema === 1)).toHaveLength(2)
    const lookup = await h.content({ command: 'lookup', templateId: h.state.template.id })
    expect('draft' in lookup && lookup.draft?.state).toBe('structured')
    const reopened = handoff(await h.execute({ command: 'open', operationId: crypto.randomUUID(), draftId: blankDocument, expectedRevisionId: saved.appliedRevisionId! }))
    expect(Object.values(reopened.source.blocks).some(b => b.type === sectionType)).toBe(true)
    expect(reopened.templateId).toBe(h.state.template.id)
  })
  it('refuses stale blank-derived heads, changed Apply replay and authority revoked after awaited rendering', async () => {
    const h = blankStartHarness()
    const opened = handoff(await h.execute(h.start()))
    const proposed = handoff(await h.execute(propose(opened)))
    const request = apply(proposed)
    const saved = handoff(await h.execute(request))
    await expect(h.execute({ ...request, action: { ...request.action, expectedDraftRevisionId: crypto.randomUUID() } } as DesignerRoundtripRequest)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    await expect(h.execute({ command: 'open', operationId: crypto.randomUUID(), draftId: blankDocument, expectedRevisionId: opened.baseRevisionId })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    const continuation = handoff(await h.execute({ command: 'open', operationId: crypto.randomUUID(), draftId: blankDocument, expectedRevisionId: saved.appliedRevisionId! }))
    const next = handoff(await h.execute(propose(continuation, 'Text')))
    const before = structuredClone(h.state)
    h.renderer.renderDocument.mockImplementationOnce(async () => { h.setRole('staff'); return '<p>render</p>' })
    await expect(h.execute(apply(next))).rejects.toMatchObject({ code: 'DESIGNER_REQUIRED' })
    expect(h.state).toEqual(before)
  })
})
