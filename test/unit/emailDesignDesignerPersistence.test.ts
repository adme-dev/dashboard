/* eslint @typescript-eslint/no-explicit-any: off -- Raw database test rows intentionally span heterogeneous SQL projections. */
import { describe, expect, it } from 'vitest'
import { executeDesignerRoundtrip, executeDesignRoundtrip } from '../../server/utils/email-marketing/designHandoffs'
import { saveDesignerTemplateDesignDraft, saveStaffTemplateDesignDraft, type DesignDb, type DesignTransaction } from '../../server/utils/email-marketing/designRevisions'
import type { DesignerOperation, DesignerRoundtripRequest } from '../../shared/emailRendering/designDesigner'
import { composerToDesignDraft } from '../../shared/emailRendering/designComposer'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'
import { testEmailRenderer } from '../fixtures/emailRenderer'
import { renderingQualityDocument } from '../fixtures/emailRenderingQuality'
import { designerBlockId } from '../../shared/emailRendering/designDesigner'
import { recogniseKnownSection } from '../../shared/emailRendering/designKnownSections'
import { oemSplit } from '../../app/utils/edmOemLayouts'
import { Window } from 'happy-dom'
import { inspectDeliveryContent, deliveryPlainText } from '../../shared/emailRendering/deliveryContent'
import { rewriteTrackableHrefs } from '../../server/utils/email-marketing/trackingLinks'

const actorId = '10000000-0000-4000-8000-000000000001'
const documentId = '20000000-0000-4000-8000-000000000001'
const templateId = '30000000-0000-4000-8000-000000000001'
const initial = '40000000-0000-4000-8000-000000000001'
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

/** Deterministic transaction adapter exercises the real handoff/writer/renderer
 * boundaries without remote DB access. It does not certify PostgreSQL locking. */
function harness(seed: () => unknown = structuredDesign) {
  let state = {
    head: initial, source: validateEmailDesign(seed()), html: '', schema: 1,
    revisions: { [initial]: validateEmailDesign(seed()) as unknown } as Record<string, unknown>,
    handoffs: {} as Record<string, any>, receipts: {} as Record<string, any>, writes: {} as Record<string, any>, revisionCount: 0
  }
  let role: 'staff' | 'designer' = 'designer'
  let authorized = true
  const authority = { actorId, authorize: async (scope: string | null, _access: string) => {
    if (!authorized || scope !== structuredDesign().scope.clientId) throw new Error('access revoked')
    return role
  } }
  const db: DesignDb = { query: async (sql, p = []) => {
    const rows = (...values: any[]) => ({ rows: values })
    if (sql.includes('pg_advisory_xact_lock')) return rows()
    if (sql.startsWith('SELECT request_text FROM email_design_handoff_receipts')) return rows(...(state.receipts[String(p[1])] ? [state.receipts[String(p[1])]] : []))
    if (sql.includes('SELECT h.*')) {
      const h = state.handoffs[String(p[0])]
      return !h || p[1] !== actorId ? rows() : rows({ ...h, template_id: templateId, client_id: state.source.scope.clientId, payload: state.revisions[h.base_revision_id], open_request_text: state.receipts[h.id]?.request_text ?? null })
    }
    if (sql.startsWith('SELECT id FROM email_design_handoffs')) return state.handoffs[String(p[0])] ? rows({ id: p[0] }) : rows()
    if (sql.includes('SELECT d.id AS document_id')) return rows({ document_id: documentId, template_id: templateId, document_client_id: state.source.scope.clientId, template_client_id: state.source.scope.clientId, template_kind: 'draft', head_revision_id: state.head, schema_version: state.schema, payload: state.revisions[state.head], payload_text: JSON.stringify(state.revisions[state.head]), projection_revision_id: state.head, projection_source: state.source.blocks, legacy_changed: false })
    if (sql.startsWith('SELECT id FROM edm_templates')) return rows({ id: templateId })
    if (sql.startsWith('SELECT head_revision_id')) return rows({ head_revision_id: state.head })
    if (sql.startsWith('SELECT * FROM email_design_documents')) return rows({ id: documentId, template_id: templateId, client_id: state.source.scope.clientId, head_revision_id: state.head })
    if (sql.includes('FROM edm_templates WHERE id=$1 FOR UPDATE')) return rows({ client_id: state.source.scope.clientId, template_kind: 'draft', subject: 'Designer test' })
    if (sql.startsWith('SELECT document_id, revision_id, payload_sha256')) return rows(...(state.writes[String(p[1])] ? [state.writes[String(p[1])]] : []))
    if (sql.includes('SELECT r.schema_version, r.payload')) return rows({ schema_version: state.schema, payload: state.revisions[state.head], legacy_unchanged: true })
    if (sql.startsWith('INSERT INTO email_design_handoffs')) {
      state.handoffs[String(p[0])] = { id: p[0], actor_id: p[1], document_id: p[2], base_revision_id: p[3], open_revision_id: p[4], state: 'open', expires_at: '2099-01-01T00:00:00Z', expired: false, proposal_revision_id: null, proposal_action_text: null, proposal_payload_text: null, applied_revision_id: null, apply_action_text: null, cancel_action_text: null }
      return rows()
    }
    if (sql.startsWith('INSERT INTO email_design_handoff_receipts')) {
      state.receipts[String(p[1])] ??= { request_text: p[3] }
      return rows()
    }
    if (sql.includes('SET state=\'proposed\'')) {
      Object.assign(state.handoffs[String(p[0])], { state: 'proposed', proposal_revision_id: p[1], proposal_action_text: p[3], proposal_payload_text: p[4] })
      return rows({ id: p[0] })
    }
    if (sql.includes('SET state=\'applied\'')) {
      Object.assign(state.handoffs[String(p[0])], { state: 'applied', applied_revision_id: p[1], apply_action_text: p[2] })
      return rows({ id: p[0] })
    }
    if (sql.includes('SET state=\'cancelled\'')) {
      Object.assign(state.handoffs[String(p[0])], { state: 'cancelled', cancel_action_text: p[1] })
      return rows({ id: p[0] })
    }
    if (sql.includes('INSERT INTO email_design_revisions')) {
      const id = crypto.randomUUID()
      state.revisions[id] = JSON.parse(String(p[2]))
      state.revisionCount++
      state.schema = 1
      return rows({ id })
    }
    if (sql.startsWith('UPDATE email_design_documents')) {
      state.head = String(p[1])
      return rows()
    }
    if (sql.startsWith('UPDATE edm_templates')) {
      state.source = JSON.parse(String(p[1]))
      state.html = String(p[2])
      return rows()
    }
    if (sql.includes('INSERT INTO email_design_revision_receipts')) {
      state.writes[String(p[1])] = { document_id: p[2], payload_sha256: p[3], revision_id: p[4] }
      return rows()
    }
    throw new Error(`Unhandled test SQL: ${sql}`)
  } }
  // Projection source is blocks, but persisted canonical source is an envelope.
  const projectQuery = db.query
  db.query = async (sql, p) => {
    if (sql.startsWith('UPDATE edm_templates')) {
      state.html = String(p![2])
      state.source = validateEmailDesign(state.revisions[state.head])
      return { rows: [] }
    }
    return projectQuery(sql, p)
  }
  const transaction: DesignTransaction = async (callback) => {
    const before = clone(state)
    try {
      return await callback(db)
    } catch (error) {
      state = before
      throw error
    }
  }
  const execute = (request: DesignerRoundtripRequest, tx = transaction) => executeDesignerRoundtrip(request, authority, testEmailRenderer, tx)
  const open = async () => {
    const result = await execute({ command: 'open', operationId: crypto.randomUUID(), draftId: documentId, expectedRevisionId: state.head })
    if (!('handoff' in result)) throw new Error('handoff expected')
    return result.handoff
  }
  const propose = async (operations: DesignerOperation[] = [{ op: 'set-style', blockId: 'heading', style: { color: '#123456' } }]) => {
    const h = await open()
    const request: DesignerRoundtripRequest = { command: 'propose', handoffId: h.id, action: { version: 1, action: 'propose-designer-return', operationId: crypto.randomUUID(), scope: h.source.scope, draftId: documentId, baseRevisionId: h.baseRevisionId, operations } }
    const result = await execute(request)
    if (!('handoff' in result)) throw new Error('handoff expected')
    return { result, request }
  }
  const applyRequest = (h: Awaited<ReturnType<typeof open>>): DesignerRoundtripRequest => ({ command: 'apply', handoffId: h.id, action: { version: 1, action: 'apply-return', operationId: crypto.randomUUID(), scope: h.source.scope, proposalId: h.id, expectedProposalRevisionId: h.proposalRevisionId!, expectedDraftRevisionId: h.baseRevisionId } })
  return { execute, open, propose, applyRequest, authority, transaction, get state() {
    return state
  }, setRole: (next: typeof role) => {
    role = next
  }, revoke: () => {
    authorized = false
  } }
}

describe('designer proposal persistence boundary', () => {
  it('previews and applies via the real canonical writer and renderer, with one revision receipt', async () => {
    const h = harness()
    const { result } = await h.propose()
    expect(result.preview.html).toContain('#123456')
    expect(h.state.revisionCount).toBe(0)
    const applied = await h.execute(h.applyRequest(result.handoff))
    expect('handoff' in applied && applied.handoff.state).toBe('applied')
    expect(h.state.revisionCount).toBe(1)
    expect(h.state.html).toContain('#123456')
    expect(Object.keys(h.state.writes)).toHaveLength(1)
  })
  it('escapes permitted ampersands in the actual canonical preview', async () => {
    const h = harness()
    const { result } = await h.propose([{ op: 'set-props', blockId: 'heading', props: { text: 'R&D {{first_name}}' } }])
    expect(result.preview.html).toContain('R&amp;D')
  })
  it('binds persisted open mode across resume/apply and rejects content-mode crossing', async () => {
    const h = harness()
    const opened = await h.open()
    await expect(executeDesignRoundtrip({ command: 'resume', handoffId: opened.id }, h.authority, testEmailRenderer, h.transaction)).rejects.toMatchObject({ code: 'HANDOFF_MODE_MISMATCH' })
    const { result } = await h.propose()
    await expect(executeDesignRoundtrip(h.applyRequest(result.handoff) as any, h.authority, testEmailRenderer, h.transaction)).rejects.toMatchObject({ code: 'HANDOFF_MODE_MISMATCH' })
  })
  it('rejects stale CAS after a newer staff edit without overwriting either proposal or source', async () => {
    const h = harness()
    const { result } = await h.propose()
    const current = validateEmailDesign(h.state.revisions[h.state.head])
    current.blocks.heading.data.props!.text = 'New staff text {{first_name}}'
    const revision = crypto.randomUUID()
    h.state.revisions[revision] = current
    h.state.head = revision
    h.state.source = current
    await expect(h.execute(h.applyRequest(result.handoff))).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    expect(h.state.source.blocks.heading.data.props?.text).toContain('New staff text')
    expect(h.state.handoffs[result.handoff.id].state).toBe('proposed')
    expect(h.state.revisionCount).toBe(0)
  })
  it('keeps actor and client scope bound to the persisted handoff', async () => {
    const h = harness()
    const { result } = await h.propose()
    const request = h.applyRequest(result.handoff)
    await expect(executeDesignerRoundtrip(request, { ...h.authority, actorId: crypto.randomUUID() }, testEmailRenderer, h.transaction)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const foreign = { ...request, action: { ...('action' in request ? request.action : {}), scope: { clientId: crypto.randomUUID() } } }
    await expect(h.execute(foreign as DesignerRoundtripRequest)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.state.revisionCount).toBe(0)
  })
  it('reconciles a committed Apply with an unknown reply using its original operation receipt', async () => {
    const h = harness()
    const { result } = await h.propose()
    const request = h.applyRequest(result.handoff)
    const loseReply: DesignTransaction = async (callback) => {
      await h.transaction(callback)
      throw new Error('reply lost after commit')
    }
    await expect(h.execute(request, loseReply)).rejects.toThrow('reply lost')
    const recovered = await h.execute(request)
    expect('handoff' in recovered && recovered.handoff.state).toBe('applied')
    expect(h.state.revisionCount).toBe(1)
    const different = { ...request, action: { ...('action' in request ? request.action : {}), expectedDraftRevisionId: crypto.randomUUID() } }
    await expect(h.execute(different as any)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })
  it('requires current creative authority and rejects a revoked role at Apply', async () => {
    const h = harness()
    const { result } = await h.propose()
    h.setRole('staff')
    await expect(h.execute(h.applyRequest(result.handoff))).rejects.toMatchObject({ code: 'DESIGNER_REQUIRED' })
    expect(h.state.revisionCount).toBe(0)
  })
  it('revalidates the candidate against the locked head inside the canonical writer', async () => {
    const h = harness()
    const design = validateEmailDesign(structuredDesign())
    design.policy.editableFields.push('heading.data.props.illegal')
    design.blocks.heading.data.props!.illegal = 'grant'
    await expect(saveDesignerTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: initial, design, operations: [], proposalOperationId: crypto.randomUUID() }, async () => {}, testEmailRenderer, h.transaction)).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
    expect(h.state.revisionCount).toBe(0)
  })
  it('generic creative saves enforce staff policy and legacy conversion derives policy server-side', async () => {
    const h = harness()
    const forged = validateEmailDesign(structuredDesign())
    forged.policy.editableFields = []
    await expect(saveStaffTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: initial, design: forged }, async () => {}, testEmailRenderer, h.transaction, {}, true)).rejects.toMatchObject({ code: 'POLICY_CHANGE_FORBIDDEN' })
    h.state.schema = 0
    const legacy = { body_source: structuredDesign().blocks }
    h.state.revisions[initial] = legacy
    const converted = composerToDesignDraft(legacy.body_source, h.state.source.scope.clientId)
    await expect(saveStaffTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: initial, design: converted }, async () => {}, testEmailRenderer, h.transaction, {}, true)).resolves.toMatchObject({ documentId })
    expect(h.state.source.policy).toEqual(converted.policy)
  })
  it('rejects forged initial conversion policy before a canonical append', async () => {
    const h = harness()
    h.state.schema = 0
    h.state.revisions[initial] = { body_source: structuredDesign().blocks }
    await expect(saveStaffTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: initial, design: structuredDesign() }, async () => {}, testEmailRenderer, h.transaction, {}, true)).rejects.toMatchObject({ code: 'STRUCTURED_REVISION_REQUIRED' })
    expect(h.state.revisionCount).toBe(0)
  })
  it('preserves server-saved legacy dark logos but rejects differing browser variants before conversion append', async () => {
    const h = harness()
    h.state.schema = 0
    const legacy = { body_source: renderingQualityDocument() }
    h.state.revisions[initial] = legacy
    const converted = composerToDesignDraft(legacy.body_source, h.state.source.scope.clientId)
    expect(converted.blocks.logo.data.props?.darkSrc).toBe(legacy.body_source.logo.data.props.darkSrc)
    expect(converted.assets).toEqual([])
    const forged = clone(converted)
    forged.blocks.logo.data.props!.darkSrc = 'https://other.example/changed.png'
    await expect(saveStaffTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: initial, design: forged }, async () => {}, testEmailRenderer, h.transaction, {}, true)).rejects.toMatchObject({ code: 'STRUCTURED_REVISION_REQUIRED' })
    expect(h.state.revisionCount).toBe(0)
    await expect(saveStaffTemplateDesignDraft({ documentId, actorId, operationId: crypto.randomUUID(), expectedRevisionId: initial, design: converted }, async () => {}, testEmailRenderer, h.transaction, {}, true)).resolves.toMatchObject({ documentId })
    expect(h.state.source.blocks).toEqual(converted.blocks)
    expect(h.state.source.assets).toEqual([])
  })
})

/** Saved draft holding generated split sections: one top-level, one nested in a
 * Container, carrying text the author edited (and saved) before starters became
 * structured. Everything else is the shared structured fixture. */
const editedTitle = 'Spring "drive" event & more'
const editedCopy = 'Book today & save – 50% off "now"'
const knownSeed = () => {
  const design = structuredDesign() as any
  design.blocks.root.data.childrenIds = ['heading', 'promo', 'wrap', 'cta']
  design.blocks.promo = clone(oemSplit({ title: editedTitle, copy: editedCopy, action: 'Book now', path: 'book', image: 'https://app.xeroflow.io/email/drive.jpeg', alt: 'EV outside', bg: '#F0F4F7' }))
  design.blocks.wrap = { type: 'Container', data: { childrenIds: ['inner'] } }
  design.blocks.inner = clone(oemSplit({ title: 'Nested offer', copy: 'Inside a container', action: 'See offer', path: 'offer', image: 'https://app.xeroflow.io/email/offer.jpeg', alt: 'Offer', bg: '#FFFFFF', reverse: true }))
  // As composerToDesignDraft persists it: every block has lineage; Html has no grants.
  design.lineage.push(...['promo', 'wrap', 'inner'].map(blockId => ({ blockId, nodeId: `node-${blockId}`, fields: {} })))
  return design
}
const adoptOp = (blockId: string): DesignerOperation => ({ op: 'adopt-known-section', blockId })
/** Visible text of each leaf text element (td/p/h2/a): literal meaning, so markup
 * or entity spellings introduced by a conversion cannot pass as equal strings.
 * (`span` holds the Button label in the HTML renderer.) */
function leafTexts(html: string) {
  const window = new Window()
  window.document.body.innerHTML = html
  const leaves = [...window.document.body.querySelectorAll('td, p, h1, h2, h3, a, span')].filter(element => element.children.length === 0)
  const texts = leaves.map(element => (element.textContent ?? '').replace(/\s+/g, ' ').trim())
  window.close()
  return texts
}
const fixedOperation = '50000000-0000-4000-8000-000000000001'

describe('known generated sections through the designer review/Apply owner', () => {
  async function proposeKnown(h: ReturnType<typeof harness>, operations: DesignerOperation[], operationId = fixedOperation) {
    const handoff = await h.open()
    const request: DesignerRoundtripRequest = { command: 'propose', handoffId: handoff.id, action: { version: 1, action: 'propose-designer-return', operationId, scope: handoff.source.scope, draftId: documentId, baseRevisionId: handoff.baseRevisionId, operations } }
    return { handoff, request, result: await h.execute(request) }
  }

  it('previews without writing, then Apply commits exactly one revision with carried text, nested replacement and deterministic ids', async () => {
    const h = harness(knownSeed)
    const { result } = await proposeKnown(h, [adoptOp('promo'), adoptOp('inner')])
    if (!('handoff' in result)) throw new Error('handoff expected')
    // Review is non-mutating: nothing is saved until Apply.
    expect(h.state.revisionCount).toBe(0)
    expect(h.state.source.blocks.promo?.type).toBe('Html')
    expect(result.preview.html).toContain('Spring &quot;drive&quot; event &amp; more')
    const applied = await h.execute(h.applyRequest(result.handoff))
    expect('handoff' in applied && applied.handoff.state).toBe('applied')
    expect(h.state.revisionCount).toBe(1)
    // Rendered meaning, not just stored strings: every carried value reads the
    // same as literal text in the old generated HTML, the preview and the saved HTML.
    const before = leafTexts(String(validateEmailDesign(knownSeed()).blocks.promo!.data.props!.contents))
    for (const value of [editedTitle, editedCopy, 'Book now']) {
      expect(before).toContain(value)
      expect(leafTexts(result.preview.html)).toContain(value)
      expect(leafTexts(h.state.html)).toContain(value)
    }
    const saved = h.state.source
    const first = [0, 1, 2, 3, 4].map(k => designerBlockId(fixedOperation, 0, k))
    const second = [0, 1, 2, 3, 4].map(k => designerBlockId(fixedOperation, 1, k))
    expect(saved.blocks.root.data.childrenIds).toEqual(['heading', first[0], 'wrap', 'cta'])
    // Nested container: replaced in place inside its own parent, not hoisted.
    expect(saved.blocks.wrap.data.childrenIds).toEqual([second[0]])
    expect(saved.blocks.promo).toBeUndefined()
    expect(saved.blocks.inner).toBeUndefined()
    // Carried persisted text (including entities) — never generator defaults.
    expect(saved.blocks[first[2]!]?.data.props?.text).toBe(editedTitle)
    expect(saved.blocks[first[3]!]?.data.props?.text).toBe(editedCopy)
    expect(saved.blocks[second[1]!]?.data.props?.text).toBe('Nested offer')
    // Reverse layout keeps words first.
    expect((saved.blocks[second[0]!]?.data.props?.columns as any[])[1].childrenIds).toEqual([second[4]])
    // Untouched blocks and their grants/lineage survive byte for byte.
    const seed = validateEmailDesign(knownSeed())
    for (const id of ['heading', 'cta']) expect(saved.blocks[id]).toEqual(seed.blocks[id])
    expect(saved.policy.editableFields).toEqual(expect.arrayContaining(seed.policy.editableFields))
    expect(saved.lineage.filter(item => ['heading', 'cta', 'wrap'].includes(item.blockId))).toEqual(seed.lineage.filter(item => ['heading', 'cta', 'wrap'].includes(item.blockId)))
    expect(Object.values(saved.blocks).some(block => recogniseKnownSection(block as any))).toBe(false)
    // The replaced Html blocks leave no dangling grants or lineage behind.
    expect(saved.lineage.some(item => ['promo', 'inner'].includes(item.blockId))).toBe(false)
    expect(saved.policy.editableFields.some(path => ['promo', 'inner'].includes(path.split('.')[0]!))).toBe(false)
    expect(saved.lineage.filter(item => [...first, ...second].includes(item.blockId))).toHaveLength(10)
    // Deterministic: an independent replay of the same operation yields the same design.
    const replay = harness(knownSeed)
    const again = await proposeKnown(replay, [adoptOp('promo'), adoptOp('inner')])
    if (!('handoff' in again.result)) throw new Error('handoff expected')
    await replay.execute(replay.applyRequest(again.result.handoff))
    expect(replay.state.source).toEqual(saved)
  })

  it('replays an identical proposal idempotently and refuses a different payload under the same operation', async () => {
    const h = harness(knownSeed)
    const { request, result } = await proposeKnown(h, [adoptOp('promo')])
    if (!('handoff' in result)) throw new Error('handoff expected')
    const replayed = await h.execute(request)
    expect('handoff' in replayed && replayed.handoff.proposalRevisionId).toBe(result.handoff.proposalRevisionId)
    const changed = { ...request, action: { ...(request as any).action, operations: [adoptOp('promo'), adoptOp('inner')] } }
    await expect(h.execute(changed as DesignerRoundtripRequest)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    const apply = h.applyRequest(result.handoff)
    await h.execute(apply)
    await expect(h.execute(apply)).resolves.toMatchObject({ handoff: { state: 'applied' } })
    expect(h.state.revisionCount).toBe(1)
  })

  it('enforces exact base CAS when the saved draft changes after open or after review', async () => {
    const restaff = (h: ReturnType<typeof harness>, mutate: (design: any) => void) => {
      const current = validateEmailDesign(h.state.revisions[h.state.head]) as any
      mutate(current)
      const revision = crypto.randomUUID()
      h.state.revisions[revision] = current
      h.state.head = revision
      h.state.source = current
    }
    // Changed between open and propose: refused before any preview/proposal.
    const early = harness(knownSeed)
    const handoff = await early.open()
    restaff(early, (design) => {
      design.blocks.heading.data.props.text = 'Staff edit {{first_name}}'
    })
    await expect(early.execute({ command: 'propose', handoffId: handoff.id, action: { version: 1, action: 'propose-designer-return', operationId: fixedOperation, scope: handoff.source.scope, draftId: documentId, baseRevisionId: handoff.baseRevisionId, operations: [adoptOp('promo')] } })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    expect(early.state.handoffs[handoff.id].state).toBe('open')
    // Changed between review and Apply (the section itself was edited, so it is
    // no longer recognised): Apply refuses and the newer edit stands.
    const late = harness(knownSeed)
    const { result } = await proposeKnown(late, [adoptOp('promo')])
    if (!('handoff' in result)) throw new Error('handoff expected')
    restaff(late, (design) => {
      design.blocks.promo.data.props.contents = String(design.blocks.promo.data.props.contents).replace('Book now', 'Book today')
    })
    await expect(late.execute(late.applyRequest(result.handoff))).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    expect(late.state.source.blocks.promo.data.props?.contents).toContain('Book today')
    expect(late.state.revisionCount).toBe(0)
    expect(late.state.handoffs[result.handoff.id].state).toBe('proposed')
  })

  it('re-derives recognition from the saved base: client hints for edited or unknown HTML are refused', async () => {
    const edited = () => {
      const design = knownSeed()
      design.blocks.promo.data.props.contents = String(design.blocks.promo.data.props.contents).replace('font-size:16px', 'font-size:17px')
      design.blocks.inner.data.hideOnMobile = true
      return design
    }
    for (const blockId of ['promo', 'inner', 'heading', 'root']) {
      const h = harness(edited)
      await expect(proposeKnown(h, [adoptOp(blockId)])).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
      expect(h.state.revisionCount).toBe(0)
      expect(Object.values(h.state.handoffs).every((row: any) => row.state === 'open')).toBe(true)
    }
  })

  it('fails closed for copy whose literal meaning a structured layer cannot keep, leaving state unchanged', async () => {
    // Text layers render rich HTML and native shows tags/entities as non-text, so
    // literal angle brackets or entity spellings stay in the original Html section.
    const values: Array<Record<string, string>> = [{ copy: 'Book <today> & save' }, { copy: 'Keep literal &copy; text' }, { title: 'Save <b>now</b>' }, { action: 'Book &amp; go' }, { copy: 'Legacy &copy without semicolon' }]
    for (const value of values) {
      const h = harness(() => {
        const design = knownSeed()
        design.blocks.promo = clone(oemSplit({ title: 'T', copy: 'C', action: 'A', path: 'p', image: 'https://app.xeroflow.io/email/drive.jpeg', alt: 'x', ...value }))
        return design
      })
      const seed = clone(h.state.source)
      expect(recogniseKnownSection(seed.blocks.promo as any), JSON.stringify(value)).toBeNull()
      await expect(proposeKnown(h, [adoptOp('promo')]), JSON.stringify(value)).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
      expect(h.state.revisionCount).toBe(0)
      expect(h.state.source).toEqual(seed)
      expect(Object.values(h.state.handoffs).every((row: any) => row.state === 'open' && !row.proposal_payload_text)).toBe(true)
    }
  })

  /** Parsed link attributes, as a mail client's HTML parser reads them. */
  function linkAttributes(html: string) {
    const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } })
    const template = window.document.createElement('template')
    template.innerHTML = html
    const result = { src: [...template.content.querySelectorAll('img')].map(img => img.getAttribute('src')), href: [...template.content.querySelectorAll('a')].map(a => a.getAttribute('href')) }
    window.close()
    return result
  }
  const linkSeed = (link: { image?: string, path?: string }) => () => {
    const design = knownSeed()
    design.blocks.promo = clone(oemSplit({ title: 'Saved', copy: 'Plain copy', action: 'Book', path: 'book', image: 'https://app.xeroflow.io/email/drive.jpeg', alt: 'Saved alt', ...link }))
    return design
  }
  // A0 conversion boundary: a carried image URL or button path containing any
  // `&` is not converted (the original Html section is kept). These were
  // previously admitted/carried cases; they are now explicit unsupported-
  // conversion and full-state-preservation cases, not deleted coverage.
  const ampersandSuffixes = [
    '?a=1&b=2', '?utm_source=edm&utm_medium=email', '?w=600&h=400&fit=crop', '?x=1&copy=1&amp=2',
    '?x=&#35;tail', '?x=&#35tail', '?x=&#x26;b=2', '?x=&#x26b=2',
    '?x=1&copy;', '?a=1&amp;b=2', '?x=1&foo;', '?x=1&Ecy0;', '?x=1&#x;', '?x=1&#;', '?x=1&#xZ;',
    '?x=1&copy-x=1', '?x=1&lt', '?a=1&amp;amp;b=2', '?x=1&notin', '?x=1&notin-', '?x=1&copysr', '?x=1&ubrcy_', '?x=1&'
  ]
  it.each([
    ...ampersandSuffixes.map(suffix => ['image', { image: `https://app.xeroflow.io/email/drive.jpeg${suffix}` }] as const),
    ...ampersandSuffixes.map(suffix => ['button', { path: `book${suffix}` }] as const)
  ])('does not convert a section whose %s link contains an ampersand, preserving full post-open state %j', async (_kind, link) => {
    const h = harness(linkSeed(link))
    h.state.html = 'saved-projection'
    const handoff = await h.open()
    const before = clone(h.state)
    const contents = String(h.state.source.blocks.promo!.data.props!.contents)
    await expect(h.execute({ command: 'propose', handoffId: handoff.id, action: { version: 1, action: 'propose-designer-return', operationId: fixedOperation, scope: handoff.source.scope, draftId: documentId, baseRevisionId: handoff.baseRevisionId, operations: [adoptOp('promo')] } })).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
    expect(h.state).toEqual(before)
    expect(h.state.source.blocks.promo!.data.props!.contents).toBe(contents)
    expect(recogniseKnownSection(h.state.source.blocks.promo as any)).toBeNull()
  })

  it('refuses a whole batch when one selected section is ineligible: no partial conversion of the others', async () => {
    const h = harness(linkSeed({ path: 'book?utm_source=edm&utm_medium=email' }))
    expect(recogniseKnownSection(h.state.source.blocks.inner as any)).not.toBeNull()
    h.state.html = 'saved-projection'
    const handoff = await h.open()
    const before = clone(h.state)
    for (const operations of [[adoptOp('inner'), adoptOp('promo')], [adoptOp('promo'), adoptOp('inner')]]) {
      await expect(h.execute({ command: 'propose', handoffId: handoff.id, action: { version: 1, action: 'propose-designer-return', operationId: crypto.randomUUID(), scope: handoff.source.scope, draftId: documentId, baseRevisionId: handoff.baseRevisionId, operations } })).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
      expect(h.state).toEqual(before)
    }
    expect(h.state.source.blocks.inner!.type).toBe('Html')
  })

  /** Logical link destinations as each existing provider-free consumer reads them. */
  async function consumerReadings(html: string) {
    const tracked: string[] = []
    await rewriteTrackableHrefs(html, (href) => {
      tracked.push(href)
      return href
    })
    return { direct: linkAttributes(html), tracked, delivery: inspectDeliveryContent(html).links.map(link => link.href), plaintext: deliveryPlainText(html) }
  }
  it.each([
    ['image', { image: 'https://app.xeroflow.io/email/drive-600x400.jpeg' }],
    ['button', { path: 'book/test-drive?model=ev9' }]
  ] as const)('converts an ampersand-free %s link with identical destinations in original, preview and committed output for every consumer', async (_kind, link) => {
    const h = harness(linkSeed(link))
    const original = String(h.state.source.blocks.promo!.data.props!.contents)
    const before = await consumerReadings(original)
    const { result } = await proposeKnown(h, [adoptOp('promo')])
    if (!('handoff' in result)) throw new Error('handoff expected')
    expect(h.state.revisionCount).toBe(0)
    await h.execute(h.applyRequest(result.handoff))
    expect(h.state.revisionCount).toBe(1)
    const image = before.direct.src[0]!
    const button = before.direct.href[0]!
    expect(before.tracked).toEqual([button])
    expect(before.delivery).toEqual([button])
    for (const html of [result.preview.html, h.state.html]) {
      const now = await consumerReadings(html)
      expect(now.direct.src).toContain(image)
      expect(now.direct.href).toContain(button)
      expect(now.tracked).toContain(button)
      expect(now.delivery).toContain(button)
      expect(now.plaintext).toContain(`Book: ${button}`)
    }
    expect(before.plaintext).toContain(`Book: ${button}`)
    // Canonical readback of the converted blocks holds the same literal values.
    const ids = [0, 1, 2, 3, 4].map(k => designerBlockId(fixedOperation, 0, k))
    expect(h.state.source.blocks[ids[1]!]).toMatchObject({ type: 'Image', data: { props: { url: image } } })
    expect(h.state.source.blocks[ids[4]!]).toMatchObject({ type: 'Button', data: { props: { url: button } } })
  })

  it('refuses inherited root and container style locks through the real proposal owner, leaving state unchanged', async () => {
    const variants: Array<[string, string]> = [['promo', 'root.data.props.fontFamily'], ['inner', 'wrap.data.style.padding'], ['inner', 'root.data.style.backgroundColor']]
    for (const [blockId, path] of variants) {
      const h = harness(() => {
        const design = knownSeed()
        design.policy.designerLocks = { blockIds: [], styleFields: [path] }
        return design
      })
      const seed = clone(h.state.source)
      await expect(proposeKnown(h, [adoptOp(blockId)]), path).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
      expect(h.state.revisionCount).toBe(0)
      expect(h.state.source).toEqual(seed)
      expect(Object.values(h.state.handoffs).every((row: any) => row.state === 'open' && !row.proposal_payload_text)).toBe(true)
    }
  })

  it('refuses explicit block locks, locked parents and module-linked sections', async () => {
    const variants: Array<[string, (design: any) => void]> = [
      ['promo', (design) => {
        design.policy.designerLocks = { blockIds: ['promo'], styleFields: [] }
      }],
      ['inner', (design) => {
        design.policy.designerLocks = { blockIds: ['wrap'], styleFields: [] }
      }],
      ['promo', (design) => {
        design.policy.designerLocks = { blockIds: [], styleFields: ['promo.data.style.padding'] }
      }],
      ['inner', (design) => {
        design.dependencies = [{ moduleId: fixedOperation, revisionId: fixedOperation }]
        design.moduleInstances = [{ instanceId: 'instance', moduleId: fixedOperation, revisionId: fixedOperation, rootBlockIds: ['wrap'], overrides: {} }]
      }]
    ]
    for (const [index, [blockId, mutate]] of variants.entries()) {
      const h = harness(() => {
        const design = knownSeed()
        mutate(design)
        return design
      })
      await expect(proposeKnown(h, [adoptOp(blockId)]), `lock variant ${index}`).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
      expect(h.state.revisionCount).toBe(0)
    }
  })

  it('checks fresh designer authority at propose and again at Apply', async () => {
    const demoted = harness(knownSeed)
    const handoff = await demoted.open()
    demoted.setRole('staff')
    await expect(demoted.execute({ command: 'propose', handoffId: handoff.id, action: { version: 1, action: 'propose-designer-return', operationId: fixedOperation, scope: handoff.source.scope, draftId: documentId, baseRevisionId: handoff.baseRevisionId, operations: [adoptOp('promo')] } })).rejects.toMatchObject({ code: 'DESIGNER_REQUIRED' })
    const revoked = harness(knownSeed)
    const { result } = await proposeKnown(revoked, [adoptOp('promo')])
    if (!('handoff' in result)) throw new Error('handoff expected')
    revoked.revoke()
    await expect(revoked.execute(revoked.applyRequest(result.handoff))).rejects.toThrow()
    expect(revoked.state.revisionCount).toBe(0)
    expect(revoked.state.source.blocks.promo?.type).toBe('Html')
  })
})
