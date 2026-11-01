import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEdmDesignRoundtrip } from '../../app/composables/useEdmDesignRoundtrip'
import { structuredDesign } from '../fixtures/email-design/structured'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'

const fetch = vi.fn()
const id = '10000000-0000-4000-8000-000000000001'
const revision = '20000000-0000-4000-8000-000000000001'
const source = () => validateEmailDesign(structuredDesign())
const draft = () => ({ state: 'structured' as const, source: source(), documentId: id, templateId: id, headRevisionId: revision, projectionRevisionId: revision, projection: { state: 'current' as const } })
const handoff = () => ({ id, draftId: id, templateId: id, baseRevisionId: revision, state: 'open' as const, source: source(), proposal: null, proposalRevisionId: null, appliedRevisionId: null, expiresAt: '2026-11-02T00:00:00Z', editorUrl: 'https://creative.xeroflow.io/figflow/0.11.2-edm1/' })

describe('composer handoff reconciliation', () => {
  beforeEach(() => {
    fetch.mockReset()
    vi.stubGlobal('$fetch', fetch)
  })
  it('retries an uncertain proposal with the original operation and refuses to silently substitute another command', async () => {
    const flow = useEdmDesignRoundtrip()
    flow.handoff.value = handoff()
    const changed = source()
    changed.blocks.heading.data.props!.text = 'Changed'
    fetch.mockRejectedValueOnce(new Error('network lost'))
    await expect(flow.propose(changed)).rejects.toThrow()
    const original = fetch.mock.calls[0][1].body
    const alternate = source()
    alternate.blocks.heading.data.props!.text = 'Other change'
    await expect(flow.propose(alternate)).rejects.toThrow('reconciliation')
    expect(fetch).toHaveBeenCalledTimes(1)
    fetch.mockResolvedValueOnce({ handoff: { ...handoff(), state: 'proposed', proposal: changed, proposalRevisionId: revision } })
    await flow.propose(changed)
    expect(fetch.mock.calls[1][1].body).toEqual(original)
    expect(flow.handoff.value!.state).toBe('proposed')
  })
  it('reconciles an uncertain open directly without trying a now-forbidden legacy save', async () => {
    const flow = useEdmDesignRoundtrip()
    fetch.mockRejectedValueOnce(new Error('open receipt lost'))
    await expect(flow.open(id, null)).rejects.toThrow()
    expect(flow.hasPending.value).toBe(true)
    const original = fetch.mock.calls[0][1].body
    fetch.mockResolvedValueOnce({ handoff: handoff() }).mockResolvedValueOnce({ draft: draft() })
    expect((await flow.reconcile())!.id).toBe(id)
    expect(fetch.mock.calls[1][1].body).toEqual(original)
    expect(flow.hasPending.value).toBe(false)
    expect(flow.draft.value?.state).toBe('structured')
  })
  it('does not adopt another writers newer head after a save receipt or reconnect', async () => {
    const flow = useEdmDesignRoundtrip()
    flow.draft.value = draft()
    fetch.mockResolvedValueOnce({ draft: { ...draft(), headRevisionId: '20000000-0000-4000-8000-000000000002' } })
    await expect(flow.lookup(id, revision)).rejects.toThrow('another editor')
    expect(flow.draft.value.headRevisionId).toBe(revision)
    fetch.mockResolvedValueOnce({ revisionId: revision }).mockResolvedValueOnce({ draft: { ...draft(), headRevisionId: '20000000-0000-4000-8000-000000000002' } })
    await expect(flow.saveStructured(source().blocks)).rejects.toThrow('another editor')
    expect(flow.draft.value.headRevisionId).toBe(revision)
  })
  it('serializes reactive document values and preserves the source on a rejected save', async () => {
    const flow = useEdmDesignRoundtrip()
    flow.draft.value = draft()
    fetch.mockRejectedValueOnce(Object.assign(new Error('conflict'), { statusCode: 409 }))
    await expect(flow.saveStructured(flow.draft.value.source.blocks)).rejects.toThrow('conflict')
    expect(flow.draft.value.headRevisionId).toBe(revision)
    expect(fetch.mock.calls[0][1].body.design.blocks).toEqual(source().blocks)
  })
  it.each(['content', 'metadata', 'open', 'apply'] as const)('retains a committed %s operation until its readback succeeds', async (kind) => {
    const flow = useEdmDesignRoundtrip()
    flow.draft.value = draft()
    const nextRevision = '20000000-0000-4000-8000-000000000002'
    const proposal = source()
    proposal.blocks.heading.data.props!.text = 'Committed content'
    flow.handoff.value = { ...handoff(), state: 'proposed', proposal, proposalRevisionId: revision }
    const savedHandoff = kind === 'apply'
      ? { ...flow.handoff.value, state: 'applied' as const, appliedRevisionId: nextRevision }
      : { ...handoff(), baseRevisionId: nextRevision }
    const receipt = kind === 'open' || kind === 'apply' ? { handoff: savedHandoff } : { revisionId: nextRevision }
    const execute = () => kind === 'content'
      ? flow.saveStructured(proposal.blocks)
      : kind === 'metadata'
        ? flow.saveMetadata('Changed subject', 'Preview')
        : kind === 'open' ? flow.open(id, null) : flow.finish('apply')
    fetch.mockResolvedValueOnce(receipt).mockRejectedValueOnce(new Error('readback unavailable'))
    await expect(execute()).rejects.toThrow('readback unavailable')
    expect(flow.hasPending.value).toBe(true)
    expect(flow.draft.value.headRevisionId).toBe(revision)
    const original = fetch.mock.calls[0][1].body
    const readback = { draft: { ...draft(), source: proposal, headRevisionId: nextRevision } }
    // A second read outage must not consume the retained action either.
    fetch.mockResolvedValueOnce(receipt).mockRejectedValueOnce(new Error('readback still unavailable'))
    await expect(flow.reconcile()).rejects.toThrow('readback still unavailable')
    expect(flow.hasPending.value).toBe(true)
    fetch.mockResolvedValueOnce(receipt).mockResolvedValueOnce(readback)
    await flow.reconcile()
    expect(fetch.mock.calls[2][1].body).toEqual(original)
    expect(fetch.mock.calls[4][1].body).toEqual(original)
    expect(flow.hasPending.value).toBe(false)
    expect(flow.draft.value.headRevisionId).toBe(nextRevision)
    expect(flow.draft.value.source.blocks).toEqual(proposal.blocks)
  })
  it('reconciles a pending metadata write before retrying the complete save sequence', async () => {
    const flow = useEdmDesignRoundtrip()
    flow.draft.value = draft()
    fetch.mockRejectedValueOnce(new Error('unknown metadata receipt'))
    await expect(flow.saveMetadata('Subject', 'Preview')).rejects.toThrow()
    const retained = fetch.mock.calls[0][1].body
    fetch.mockImplementation(async (url) => {
      if (url.endsWith('/metadata')) return { revisionId: revision }
      if (url.endsWith('/roundtrip')) return { draft: draft() }
      return { revisionId: revision }
    })
    await flow.saveStructured(source().blocks)
    expect(fetch.mock.calls[1][1].body).toEqual(retained)
    expect(fetch.mock.calls[3][1].body.action).toBe('save-draft')
  })
})
