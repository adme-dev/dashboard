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

const actorId = '10000000-0000-4000-8000-000000000001'
const documentId = '20000000-0000-4000-8000-000000000001'
const templateId = '30000000-0000-4000-8000-000000000001'
const initial = '40000000-0000-4000-8000-000000000001'
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

/** Deterministic transaction adapter exercises the real handoff/writer/renderer
 * boundaries without remote DB access. It does not certify PostgreSQL locking. */
function harness() {
  let state = {
    head: initial, source: validateEmailDesign(structuredDesign()), html: '', schema: 1,
    revisions: { [initial]: validateEmailDesign(structuredDesign()) as unknown } as Record<string, unknown>,
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
