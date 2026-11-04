/* eslint @typescript-eslint/no-explicit-any: off -- Heterogeneous SQL fixture projections. */
import { vi } from 'vitest'
import { createEmptyDocument } from '../../app/types/edm'
import { executeDesignerRoundtrip, executeDesignRoundtrip } from '../../server/utils/email-marketing/designHandoffs'
import type { DesignDb, DesignTransaction } from '../../server/utils/email-marketing/designRevisions'
import type { DesignerRoundtripRequest } from '../../shared/emailRendering/designDesigner'
import type { RoundtripRequest } from '../../shared/emailRendering/designRoundtrip'
import { testEmailRenderer } from '../fixtures/emailRenderer'

export const blankActor = '10000000-0000-4000-8000-000000000001'
export const blankTemplate = '20000000-0000-4000-8000-000000000001'
export const blankDocument = '30000000-0000-4000-8000-000000000001'
export const blankScope = '40000000-0000-4000-8000-000000000001'
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

/** Exercises real initialization, handoff, writer, renderer and replay owners.
 * Transaction rollback is deterministic here; PostgreSQL locks/JSONB are CI gates. */
export function blankStartHarness(scope: string | null = blankScope) {
  let state = {
    template: { id: blankTemplate, client_id: scope, template_kind: 'draft', body_source: createEmptyDocument(), body_html: '', email_design_revision_id: null as string | null },
    document: null as any,
    revisions: {} as Record<string, { schema: number, payload: any }>,
    handoffs: {} as Record<string, any>, receipts: {} as Record<string, any>, writes: {} as Record<string, any>
  }
  let role: 'designer' | 'staff' = 'designer'
  const authority = { actorId: blankActor, assertCampaignNativeEnabled: () => { throw new Error('campaign disabled') }, authorize: vi.fn(async (clientId: string | null, _access: 'read' | 'write') => {
    if (clientId !== scope) throw new Error('scope denied')
    return role
  }) }
  const renderer = { ...testEmailRenderer, renderDocument: vi.fn(testEmailRenderer.renderDocument) }
  const db: DesignDb = { query: async (raw, p = []) => {
    const sql = raw.replace(/\s+/g, ' ').trim()
    const rows = (...values: any[]) => ({ rows: clone(values) })
    const current = () => state.revisions[state.document.head_revision_id]!
    if (sql.includes('pg_advisory_xact_lock')) return rows()
    if (sql.startsWith('SELECT request_text FROM email_design_handoff_receipts')) return rows(...(state.receipts[String(p[1])] ? [state.receipts[String(p[1])]] : []))
    if (sql.startsWith('SELECT id FROM email_design_handoffs')) return rows(...(state.handoffs[String(p[0])] ? [{ id: p[0] }] : []))
    if (sql.startsWith('SELECT h.*')) {
      const h = state.handoffs[String(p[0])]
      return !h || p[1] !== blankActor ? rows() : rows({ ...h, template_id: blankTemplate, campaign_id: null, client_id: scope, payload: state.revisions[h.base_revision_id]!.payload, open_request_text: state.receipts[h.id]?.request_text ?? null })
    }
    if (sql.startsWith('SELECT id, client_id, template_kind, body_source FROM edm_templates')) return rows(state.template)
    if (sql.startsWith('SELECT id FROM email_design_documents')) return rows(...(state.document ? [{ id: blankDocument }] : []))
    if (sql.startsWith('SELECT * FROM email_design_documents')) return rows(...(state.document ? [state.document] : []))
    if (sql.startsWith('SELECT head_revision_id')) return rows({ head_revision_id: state.document.head_revision_id })
    if (sql.startsWith('SELECT client_id') && sql.includes('FROM edm_templates')) return rows(state.template)
    if (sql.startsWith('INSERT INTO email_design_documents')) {
      state.document = { id: blankDocument, template_id: blankTemplate, campaign_id: null, module_id: null, client_id: scope, head_revision_id: null }
      return rows(state.document)
    }
    if (sql.startsWith('SELECT d.id AS document_id')) return rows({ document_id: blankDocument, template_id: blankTemplate, document_client_id: scope, template_client_id: scope, template_kind: state.template.template_kind, head_revision_id: state.document.head_revision_id, schema_version: current().schema, payload: current().payload, payload_text: JSON.stringify(current().payload), projection_revision_id: state.template.email_design_revision_id, projection_source: state.template.body_source, legacy_changed: current().schema === 0 && JSON.stringify(current().payload) !== JSON.stringify(state.template) })
    if (sql.startsWith('SELECT r.schema_version')) return rows({ schema_version: current().schema, origin: current().schema === 0 ? 'legacy' : 'design', payload: current().payload, legacy_unchanged: current().schema !== 0 || JSON.stringify(current().payload) === JSON.stringify(state.template) })
    if (sql.startsWith('SELECT document_id, revision_id, payload_sha256')) return rows(...(state.writes[String(p[1])] ? [state.writes[String(p[1])]] : []))
    if (sql.startsWith('INSERT INTO email_design_revisions')) {
      const id = crypto.randomUUID()
      const legacy = sql.includes("SELECT $1,0,'legacy'")
      state.revisions[id] = { schema: legacy ? 0 : 1, payload: legacy ? clone(state.template) : JSON.parse(String(p[2])) }
      return rows({ id })
    }
    if (sql.startsWith('UPDATE email_design_documents')) { state.document.head_revision_id = p[1]; return rows() }
    if (sql.startsWith('UPDATE edm_templates')) {
      Object.assign(state.template, { body_source: JSON.parse(String(p[1])), body_html: p[2], email_design_revision_id: p[3] })
      return rows()
    }
    if (sql.startsWith('INSERT INTO email_design_revision_receipts')) {
      state.writes[String(p[1])] = { document_id: p[2], payload_sha256: p[3], revision_id: p[4] }; return rows()
    }
    if (sql.startsWith('INSERT INTO email_design_handoffs')) {
      state.handoffs[String(p[0])] = { id: p[0], actor_id: p[1], document_id: p[2], base_revision_id: p[3], open_revision_id: p[4], state: 'open', expires_at: '2099-01-01T00:00:00Z', expired: false, proposal_revision_id: null, proposal_action_text: null, proposal_payload_text: null, applied_revision_id: null, apply_action_text: null, cancel_action_text: null }; return rows()
    }
    if (sql.startsWith('INSERT INTO email_design_handoff_receipts')) {
      state.receipts[String(p[1])] ??= { request_text: p[3] }; return rows()
    }
    if (sql.includes("SET state='proposed'")) {
      Object.assign(state.handoffs[String(p[0])], { state: 'proposed', proposal_revision_id: p[1], proposal_action_text: p[3], proposal_payload_text: p[4] }); return rows({ id: p[0] })
    }
    if (sql.includes("SET state='applied'")) {
      Object.assign(state.handoffs[String(p[0])], { state: 'applied', applied_revision_id: p[1], apply_action_text: p[2] }); return rows({ id: p[0] })
    }
    throw new Error(`Unhandled blank fixture SQL: ${sql}`)
  } }
  const transaction: DesignTransaction = async callback => {
    const before = clone(state)
    try { return await callback(db) } catch (error) { state = before; throw error }
  }
  const start = (): Extract<DesignerRoundtripRequest, { command: 'start' }> => ({ command: 'start', operationId: crypto.randomUUID(), templateId: blankTemplate, clientId: scope })
  const execute = (request: DesignerRoundtripRequest) => executeDesignerRoundtrip(request, authority, renderer, transaction)
  const content = (request: RoundtripRequest) => executeDesignRoundtrip(request, authority, renderer, transaction)
  return { start, execute, content, transaction, authority, renderer, get state() { return state }, setRole: (value: typeof role) => { role = value } }
}
