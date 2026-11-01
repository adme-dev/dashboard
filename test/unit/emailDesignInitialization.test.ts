import { describe, expect, it, vi } from 'vitest'
import { initializeTemplateDesignDraft } from '../../server/utils/email-marketing/designInitialization'
import {
  DesignRevisionError,
  type DesignDb,
  type DesignTransaction
} from '../../server/utils/email-marketing/designRevisions'

const templateId = '20000000-0000-4000-8000-000000000002'
const actorId = '60000000-0000-4000-8000-000000000006'
const clientId = '10000000-0000-4000-8000-000000000001'
const otherClientId = '50000000-0000-4000-8000-000000000005'
const documentId = 'd0000000-0000-4000-8000-000000000001'
const revisionId = '30000000-0000-4000-8000-000000000003'

const input = { templateId, actorId, expectedClientId: clientId }

type DocumentState = {
  id: string
  template_id: string
  module_id: null
  campaign_id: null
  client_id: string | null
  head_revision_id: string | null
}
type State = {
  template: { client_id: string | null, template_kind: string } | null
  document: DocumentState | null
  revisions: string[]
  schemaVersion?: 0 | 1
  origin?: 'legacy' | 'design'
  legacyChanged?: boolean
  failRevisionInsert?: boolean
}

function state(overrides: Partial<State> = {}): State {
  return {
    template: { client_id: clientId, template_kind: 'draft' },
    document: null,
    revisions: [],
    ...overrides
  }
}

function database(current: State) {
  const query = vi.fn<DesignDb['query']>(async (sql, params = []) => {
    const statement = sql.replace(/\s+/g, ' ').trim()
    if (statement.startsWith('SELECT r.schema_version,'))
      return { rows: [{
        schema_version: current.schemaVersion ?? 0,
        origin: current.origin ?? 'legacy',
        legacy_unchanged: !current.legacyChanged
      }] }
    if (statement === 'SELECT client_id, template_kind FROM edm_templates WHERE id=$1 FOR UPDATE')
      return { rows: current.template ? [current.template] : [] }
    if (statement === 'SELECT client_id FROM edm_templates source_record WHERE id=$1 FOR UPDATE')
      return { rows: current.template ? [{ client_id: current.template.client_id }] : [] }
    if (statement === 'SELECT * FROM email_design_documents WHERE template_id=$1 FOR UPDATE')
      return { rows: current.document ? [current.document] : [] }
    if (statement.startsWith('INSERT INTO email_design_documents(template_id,client_id)')) {
      current.document = {
        id: documentId,
        template_id: templateId,
        module_id: null,
        campaign_id: null,
        client_id: params[1] as string | null,
        head_revision_id: null
      }
      return { rows: [current.document] }
    }
    if (statement.startsWith('INSERT INTO email_design_revisions(')) {
      if (current.failRevisionInsert) throw new Error('revision insert failed')
      current.revisions.push(revisionId)
      return { rows: [{ id: revisionId }] }
    }
    if (statement === 'UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1') {
      current.document!.head_revision_id = params[1] as string
      return { rows: [] }
    }
    throw new Error(`Unexpected query: ${statement}`)
  })
  return { db: { query }, query }
}

function transaction(db: DesignDb, count = { calls: 0 }) {
  const runTransaction: DesignTransaction = async (callback) => {
    count.calls++
    return callback(db)
  }
  return { runTransaction, count }
}

describe('initializeTemplateDesignDraft', () => {
  it('rejects invalid or non-strict identities before opening a transaction', async () => {
    const invalidInputs = [
      { ...input, templateId: 'not-a-uuid' },
      { ...input, actorId: 'not-a-uuid' },
      { ...input, expectedClientId: 'not-a-uuid' },
      { ...input, unexpected: true }
    ]
    for (const candidate of invalidInputs) {
      const runTransaction = vi.fn<DesignTransaction>()
      const authorize = vi.fn()
      await expect(initializeTemplateDesignDraft(
        candidate as typeof input,
        authorize,
        runTransaction
      )).rejects.toThrow()
      expect(runTransaction).not.toHaveBeenCalled()
      expect(authorize).not.toHaveBeenCalled()
    }
  })

  it('maps both a missing template and wrong expected scope to NOT_FOUND', async () => {
    for (const current of [
      state({ template: null }),
      state({ template: { client_id: otherClientId, template_kind: 'draft' } })
    ]) {
      const { db } = database(current)
      const { runTransaction } = transaction(db)
      const authorize = vi.fn()
      await expect(initializeTemplateDesignDraft(input, authorize, runTransaction))
        .rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(authorize).not.toHaveBeenCalled()
      expect(current.document).toBeNull()
    }
  })

  it('authorizes under the owner lock before rejecting a library template', async () => {
    const current = state({ template: { client_id: clientId, template_kind: 'template' } })
    const { db, query } = database(current)
    const { runTransaction } = transaction(db)
    const authorize = vi.fn(async () => {})
    await expect(initializeTemplateDesignDraft(input, authorize, runTransaction))
      .rejects.toMatchObject({ code: 'TEMPLATE_DRAFT_REQUIRED' })
    expect(authorize).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledTimes(1)
    expect(current.document).toBeNull()
  })

  it('propagates revoked authority on a library row before kind classification', async () => {
    const current = state({ template: { client_id: clientId, template_kind: 'template' } })
    const { db, query } = database(current)
    const { runTransaction } = transaction(db)
    const authorize = vi.fn(async () => {
      throw new Error('revoked library access')
    })
    await expect(initializeTemplateDesignDraft(input, authorize, runTransaction))
      .rejects.toThrow('revoked library access')
    expect(authorize).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledTimes(1)
    expect(current.document).toBeNull()
  })

  it('propagates denied authority without initializing a document', async () => {
    const current = state()
    const { db } = database(current)
    const { runTransaction } = transaction(db)
    await expect(initializeTemplateDesignDraft(
      input,
      async () => { throw new Error('denied') },
      runTransaction
    )).rejects.toThrow('denied')
    expect(current.document).toBeNull()
    expect(current.revisions).toEqual([])
  })

  it('propagates revocation on the nested fresh authorization check', async () => {
    const current = state()
    const { db, query } = database(current)
    const { runTransaction } = transaction(db)
    const authorize = vi.fn(async () => {
      if (authorize.mock.calls.length === 2) throw new Error('revoked')
    })
    await expect(initializeTemplateDesignDraft(input, authorize, runTransaction))
      .rejects.toThrow('revoked')
    expect(authorize).toHaveBeenCalledTimes(2)
    expect(query).toHaveBeenCalledTimes(2)
    expect(current.document).toBeNull()
  })

  it('locks the owner first and reuses one transaction for the legacy snapshot', async () => {
    const current = state()
    const originalTemplate = { ...current.template! }
    const { db, query } = database(current)
    const { runTransaction, count } = transaction(db)
    const authorize = vi.fn(async (_actualClientId: string | null) => {})

    await expect(initializeTemplateDesignDraft(input, authorize, runTransaction))
      .resolves.toEqual({
        documentId,
        revisionId,
        schemaVersion: 0,
        origin: 'legacy'
      })

    expect(count.calls).toBe(1)
    expect(query.mock.calls[0][0]).toContain('SELECT client_id, template_kind FROM edm_templates')
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE')
    expect(authorize).toHaveBeenCalledTimes(2)
    expect(authorize).toHaveBeenNthCalledWith(1, clientId)
    expect(authorize).toHaveBeenNthCalledWith(2, clientId)
    expect(current.template).toEqual(originalTemplate)
    expect(query.mock.calls.every(([sql]) => !sql.includes('UPDATE edm_templates'))).toBe(true)
  })

  it('does not duplicate identity or history on repeated initialization', async () => {
    const current = state()
    const { db, query } = database(current)
    const { runTransaction, count } = transaction(db)
    const authorize = async () => {}

    const first = await initializeTemplateDesignDraft(input, authorize, runTransaction)
    const originalHead = current.document!.head_revision_id
    const second = await initializeTemplateDesignDraft(input, authorize, runTransaction)

    expect(second).toEqual(first)
    expect(count.calls).toBe(2)
    expect(current.revisions).toEqual([revisionId])
    expect(current.document!.head_revision_id).toBe(originalHead)
    expect(query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO email_design_revisions'))).toHaveLength(1)
  })

  it('returns exact structured head metadata without resetting or appending history', async () => {
    const existingRevisionId = '40000000-0000-4000-8000-000000000004'
    const current = state({
      document: {
        id: documentId,
        template_id: templateId,
        module_id: null,
        campaign_id: null,
        client_id: clientId,
        head_revision_id: existingRevisionId
      },
      revisions: [existingRevisionId],
      schemaVersion: 1,
      origin: 'design'
    })
    const { db, query } = database(current)
    const { runTransaction } = transaction(db)

    await expect(initializeTemplateDesignDraft(input, async () => {}, runTransaction))
      .resolves.toEqual({
        documentId,
        revisionId: existingRevisionId,
        schemaVersion: 1,
        origin: 'design'
      })
    expect(current.document!.head_revision_id).toBe(existingRevisionId)
    expect(current.revisions).toEqual([existingRevisionId])
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false)
    const headQuery = query.mock.calls.find(([sql]) => sql.includes('FROM email_design_revisions'))
    expect(headQuery?.[0]).toContain('r.origin')
    expect(headQuery?.[1]).toEqual([documentId, existingRevisionId, templateId])
  })

  it('propagates snapshot failure so the injected transaction can roll back', async () => {
    const current = state({ failRevisionInsert: true })
    const { db } = database(current)
    const snapshot = structuredClone(current)
    const runTransaction: DesignTransaction = async (callback) => {
      try {
        return await callback(db)
      } catch (error) {
        Object.assign(current, snapshot)
        throw error
      }
    }

    await expect(initializeTemplateDesignDraft(input, async () => {}, runTransaction))
      .rejects.toThrow('revision insert failed')
    expect(current).toEqual(snapshot)
    expect(current.document).toBeNull()
    expect(current.revisions).toEqual([])
  })

  it('uses the existing revision error contract', async () => {
    const current = state({ template: null })
    const { db } = database(current)
    const { runTransaction } = transaction(db)
    const error = await initializeTemplateDesignDraft(input, async () => {}, runTransaction)
      .catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(DesignRevisionError)
    expect(error).toMatchObject({ code: 'NOT_FOUND' })
  })
  it('rejects changed legacy content on repeat without replacing the snapshot', async () => {
    const current = state()
    const { db } = database(current)
    const { runTransaction } = transaction(db)
    const first = await initializeTemplateDesignDraft(input, async () => {}, runTransaction)
    current.legacyChanged = true
    await expect(initializeTemplateDesignDraft(input, async () => {}, runTransaction))
      .rejects.toMatchObject({ code: 'LEGACY_CONTENT_CHANGED' })
    expect(current.document!.head_revision_id).toBe(first.revisionId)
    expect(current.revisions).toEqual([first.revisionId])
  })
})
