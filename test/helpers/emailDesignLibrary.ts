/* eslint @typescript-eslint/no-explicit-any: off -- Transaction fixture models heterogeneous SQL rows. */
import { vi } from 'vitest'
import {
  executeDesignModules,
  type ModuleAuthority
} from '../../server/utils/email-marketing/designModules'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import type { DesignModuleRequest } from '../../shared/emailRendering/designModules'
import type { DesignTransaction } from '../../server/utils/email-marketing/designRevisions'
import type { DesignAssetStorage } from '../../server/utils/email-marketing/designAssets'
import { structuredDesign } from '../fixtures/email-design/structured'
import { testEmailRenderer } from '../fixtures/emailRenderer'

export const actorId = '10000000-0000-4000-8000-000000000002'
export const draftId = '20000000-0000-4000-8000-000000000001'
export const templateId = '30000000-0000-4000-8000-000000000001'
export const initial = '40000000-0000-4000-8000-000000000001'
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
export function libraryHarness() {
  let state = {
    documents: {
      [draftId]: {
        id: draftId,
        template_id: templateId,
        module_id: null,
        client_id: structuredDesign().scope.clientId,
        head_revision_id: initial
      }
    } as Record<string, any>,
    revisions: {
      [initial]: {
        id: initial,
        document_id: draftId,
        schema_version: 1,
        payload: validateEmailDesign(structuredDesign())
      }
    } as Record<string, any>,
    templates: {
      [templateId]: {
        id: templateId,
        client_id: structuredDesign().scope.clientId,
        template_kind: 'draft',
        subject: null,
        preview_text: null,
        body_source: structuredDesign().blocks,
        body_html: 'original draft HTML',
        email_design_revision_id: initial
      }
    } as Record<string, any>,
    assets: {} as Record<string, any>,
    modules: {} as Record<string, any>,
    receipts: {} as Record<string, any>,
    campaigns: { sent: 'frozen sent html', scheduled: 'frozen scheduled html' }
  }
  let queue = Promise.resolve()
  const queries: string[] = []
  let allowed = true
  const check = vi.fn(async (_scope: string | null) => {
    if (!allowed) throw new Error('denied')
  })
  const authority: ModuleAuthority = { actorId, read: check, designer: check, publisher: check }
  const rows = (...items: any[]) => ({ rows: items })
  const db = {
    query: async (sql: string, p: unknown[] = []) => {
      queries.push(sql)
      if (sql.includes('pg_advisory_xact_lock')) return rows()
      if (sql.startsWith('SELECT operation_id FROM email_asset_publication_receipts')) return rows()
      if (sql.startsWith('SELECT payload FROM email_design_revisions')) {
        const r = state.revisions[String(p[1])]
        return r?.document_id === p[0] ? rows(r) : rows()
      }
      if (sql.startsWith('SELECT id,parent_revision_id,schema_version,payload')) {
        const r = state.revisions[String(p[1])]
        return r?.document_id === p[0]
          ? rows({ subject: null, preview_text: null, created_at: '2026-11-01T00:00:00Z', ...r })
          : rows()
      }
      if (sql.startsWith('WITH RECURSIVE history')) {
        const chain = []
        let r = state.revisions[String(p[1])]
        while (r && chain.length < 51) {
          chain.push({ ...r, created_at: '2026-11-01T00:00:00Z' })
          r = state.revisions[r.parent_revision_id]
        }
        return rows(...chain)
      }
      if (sql.startsWith('SELECT document_id,revision_id,payload_sha256 FROM email_design_revision_receipts'))
        return state.receipts[String(p[1])] ? rows(state.receipts[String(p[1])]) : rows()
      if (sql.startsWith('INSERT INTO edm_templates')) {
        const id = crypto.randomUUID()
        state.templates[id] = {
          id,
          name: p[0],
          subject: p[1],
          preview_text: p[2],
          body_source: JSON.parse(String(p[3])),
          body_html: p[4],
          template_kind: p[5],
          folder_name: p[6],
          client_id: p[7],
          created_by: p[8],
          email_design_revision_id: null
        }
        return rows({ id })
      }
      if (sql.startsWith('SELECT client_id FROM edm_templates source_record'))
        return state.templates[String(p[0])] ? rows(state.templates[String(p[0])]) : rows()
      if (
        sql.startsWith('SELECT * FROM email_design_documents WHERE template_id')
        || sql.startsWith('SELECT id FROM email_design_documents WHERE template_id')
      ) {
        const d = Object.values(state.documents).find(d => d.template_id === p[0])
        return d ? rows(d) : rows()
      }
      if (sql.startsWith('SELECT t.*,d.id AS document_id')) {
        const t = state.templates[String(p[0])],
          r = state.revisions[String(p[1])],
          d = state.documents[r?.document_id]
        return !t || !r || d?.template_id !== t.id
          ? rows()
          : rows({
              ...t,
              document_id: d.id,
              document_client_id: d.client_id,
              head_revision_id: d.head_revision_id,
              schema_version: r.schema_version,
              payload: r.payload,
              subject: r.subject ?? null,
              preview_text: r.preview_text ?? null
            })
      }
      if (sql.startsWith('UPDATE edm_templates SET subject=')) {
        const t = state.templates[String(p[0])],
          source = JSON.parse(String(p[3]))
        const d = Object.values(state.documents).find(d => d.template_id === t.id)
        if (
          t.template_kind !== 'draft'
          || d?.head_revision_id !== p[5]
          || JSON.stringify(state.revisions[String(p[5])].payload.blocks) !== JSON.stringify(source)
        )
          throw new Error('projection trigger')
        Object.assign(t, {
          subject: p[1],
          preview_text: p[2],
          body_source: source,
          body_html: p[4],
          email_design_revision_id: p[5]
        })
        return rows()
      }
      if (sql.startsWith('SELECT * FROM banner_assets'))
        return state.assets[String(p[0])] ? rows(state.assets[String(p[0])]) : rows()
      if (sql.startsWith('SELECT template_id,client_id'))
        return state.documents[String(p[0])] ? rows(state.documents[String(p[0])]) : rows()
      if (sql.startsWith('SELECT id FROM edm_templates')) return rows({ id: p[0] })
      if (sql.startsWith('SELECT head_revision_id')) return rows(state.documents[String(p[0])])
      if (sql.includes('FROM email_design_revision_receipts c')) {
        const receipt = state.receipts[String(p[1])]
        return receipt ? rows({ ...receipt, ...state.documents[receipt.document_id] }) : rows()
      }
      if (sql.includes('SELECT d.id AS document_id')) {
        const d = state.documents[String(p[0])],
          t = state.templates[d?.template_id],
          r = state.revisions[d?.head_revision_id]
        return !d || !t
          ? rows()
          : rows({
              document_id: d.id,
              template_id: t.id,
              document_client_id: d.client_id,
              template_client_id: t.client_id,
              template_kind: t.template_kind,
              head_revision_id: d.head_revision_id,
              schema_version: r.schema_version,
              payload: r.payload,
              projection_revision_id: t.email_design_revision_id,
              projection_source: t.body_source,
              legacy_changed: false
            })
      }
      if (sql.startsWith('INSERT INTO edm_custom_modules')) {
        const id = crypto.randomUUID()
        state.modules[id] = {
          id,
          name: p[0],
          description: p[1],
          category: p[2],
          blocks: JSON.parse(String(p[3])),
          preview_tone: p[4],
          client_id: p[5],
          created_by: p[6]
        }
        return rows({ id })
      }
      if (sql.startsWith('SELECT client_id FROM edm_custom_modules source_record'))
        return state.modules[String(p[0])] ? rows(state.modules[String(p[0])]) : rows()
      if (
        sql.startsWith('SELECT * FROM email_design_documents WHERE module_id')
        || sql.startsWith('SELECT id,head_revision_id FROM email_design_documents WHERE module_id')
      ) {
        const d = Object.values(state.documents).find(d => d.module_id === p[0])
        return d ? rows(d) : rows()
      }
      if (sql.startsWith('INSERT INTO email_design_documents')) {
        const id = crypto.randomUUID()
        state.documents[id] = {
          id,
          template_id: sql.includes('(template_id,') ? p[0] : null,
          module_id: sql.includes('(module_id,') ? p[0] : null,
          client_id: p[1],
          head_revision_id: null
        }
        return rows(state.documents[id])
      }
      if (sql.includes('INSERT INTO email_design_revisions')) {
        const id = crypto.randomUUID(),
          legacy = sql.includes('\'legacy\'')
        const document = state.documents[String(p[0])]
        if (legacy && document.head_revision_id) throw new Error('legacy parent guard')
        if (!legacy && document.head_revision_id !== p[1]) throw new Error('parent must be current head')
        state.revisions[id] = {
          id,
          document_id: p[0],
          schema_version: legacy ? 0 : 1,
          payload: legacy
            ? clone(document.template_id ? state.templates[String(p[2])] : state.modules[String(p[2])])
            : JSON.parse(String(p[2])),
          parent_revision_id: legacy ? null : p[1],
          subject: legacy ? null : p[4],
          preview_text: legacy ? null : p[5]
        }
        return rows({ id })
      }
      if (sql.startsWith('UPDATE email_design_documents')) {
        state.documents[String(p[0])].head_revision_id = p[1]
        return rows()
      }
      if (sql.startsWith('UPDATE edm_custom_modules')) {
        Object.assign(state.modules[String(p[0])], {
          name: p[1],
          description: p[2],
          category: p[3],
          preview_tone: p[4],
          blocks: JSON.parse(String(p[5]))
        })
        return rows()
      }
      if (sql.includes('INSERT INTO email_design_revision_receipts')) {
        state.receipts[String(p[1])] = { document_id: p[2], payload_sha256: p[3], revision_id: p[4] }
        return rows()
      }
      if (sql.startsWith('SELECT id,client_id FROM edm_custom_modules'))
        return state.modules[String(p[0])] ? rows(state.modules[String(p[0])]) : rows()
      if (sql.startsWith('SELECT m.id,m.client_id')) {
        const m = state.modules[String(p[0])],
          r = state.revisions[String(p[1])],
          d = state.documents[r?.document_id]
        return !m || !r || d?.module_id !== m.id
          ? rows()
          : rows({
              ...m,
              document_id: d.id,
              document_client_id: d.client_id,
              head_revision_id: d.head_revision_id,
              schema_version: r.schema_version,
              payload: r.payload
            })
      }
      if (sql.includes('SELECT d.client_id, m.client_id')) {
        const m = state.modules[String(p[0])],
          r = state.revisions[String(p[1])],
          d = state.documents[r?.document_id]
        return !m || !r || d?.module_id !== m.id
          ? rows()
          : rows({
              client_id: d.client_id,
              owner_client_id: m.client_id,
              schema_version: r.schema_version,
              payload: r.payload
            })
      }
      if (sql.startsWith('SELECT subject,preview_text')) return rows(state.templates[String(p[0])])
      if (sql.startsWith('UPDATE edm_templates')) {
        Object.assign(state.templates[String(p[0])], {
          body_source: JSON.parse(String(p[1])),
          body_html: p[2],
          email_design_revision_id: p[3]
        })
        return rows()
      }
      throw new Error(`Unhandled SQL: ${sql}`)
    }
  }
  const transaction: DesignTransaction = async (callback) => {
    const prior = queue
    let release!: () => void
    queue = new Promise<void>((resolve) => {
      release = resolve
    })
    await prior
    const before = clone(state)
    try {
      return await callback(db)
    } catch (error) {
      state = before

      throw error
    } finally {
      release()
    }
  }
  const run = (
    request: DesignModuleRequest,
    tx = transaction,
    renderer = testEmailRenderer,
    storage?: DesignAssetStorage
  ) => executeDesignModules(request, authority, renderer, storage, tx)
  const publish = (): DesignModuleRequest => ({
    version: 1,
    command: 'publish-module',
    operationId: crypto.randomUUID(),
    draftId,
    expectedDraftRevisionId: initial,
    rootBlockIds: ['heading'],
    includedOverridePaths: [],
    name: 'Hero',
    category: 'hero',
    description: null,
    previewTone: 'light'
  })
  return {
    run,
    publish,
    transaction,
    db,
    authority,
    queries,
    get state() {
      return state
    },
    revoke: () => {
      allowed = false
    }
  }
}
