import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DesignReadError,
  getTemplateDesignDraft,
  type DesignDb
} from '../../server/utils/email-marketing/designReads'
import { structuredDesign } from '../fixtures/email-design/structured'

const documentId = 'd0000000-0000-4000-8000-000000000001'
const templateId = '20000000-0000-4000-8000-000000000002'
const headRevisionId = '30000000-0000-4000-8000-000000000003'
const otherRevisionId = '40000000-0000-4000-8000-000000000004'

type DraftRow = {
  document_id: string
  template_id: string
  document_client_id: string | null
  template_client_id: string | null
  template_kind: string
  head_revision_id: string | null
  schema_version: number | null
  payload: unknown
  payload_text: string | null
  projection_revision_id: string | null
  projection_source: unknown
  legacy_changed: boolean
}

function currentRow(): DraftRow {
  const design = structuredDesign()
  return {
    document_id: documentId,
    template_id: templateId,
    document_client_id: design.scope.clientId,
    template_client_id: design.scope.clientId,
    template_kind: 'draft',
    head_revision_id: headRevisionId,
    schema_version: 1,
    payload: design,
    payload_text: JSON.stringify(design),
    projection_revision_id: headRevisionId,
    projection_source: design.blocks,
    legacy_changed: false
  }
}

function database(rows: unknown[]): DesignDb {
  return { query: vi.fn(async () => ({ rows })) }
}

const allow = vi.fn(async (_clientId: string | null) => {})

describe('getTemplateDesignDraft', () => {
  beforeEach(() => allow.mockClear())
  it('checks read authority before disclosing draft kind or missing-head state', async () => {
    const denied = async () => {
      throw new Error('access denied')
    }
    await expect(getTemplateDesignDraft(documentId, denied, database([{ ...currentRow(), template_kind: 'template' }]))).rejects.toThrow('access denied')
    await expect(getTemplateDesignDraft(documentId, denied, database([{ ...currentRow(), head_revision_id: null }]))).rejects.toThrow('access denied')
  })
  it('requires a UUID before reading or authorizing', async () => {
    const db = database([])
    await expect(
      getTemplateDesignDraft('template-id', allow, db)
    ).rejects.toMatchObject({
      code: 'INVALID_DOCUMENT_ID'
    })
    expect(db.query).not.toHaveBeenCalled()
    expect(allow).not.toHaveBeenCalled()
  })

  it('distinguishes a missing target from a missing head', async () => {
    await expect(
      getTemplateDesignDraft(documentId, allow, database([]))
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const row = {
      ...currentRow(),
      head_revision_id: null,
      schema_version: null,
      payload: null,
      payload_text: null
    }
    await expect(
      getTemplateDesignDraft(documentId, allow, database([row]))
    ).rejects.toMatchObject({ code: 'HEAD_NOT_FOUND' })
  })

  it('does not return private content when access is denied', async () => {
    const denied = vi.fn(async (_clientId: string | null) => {
      throw new Error('denied')
    })
    await expect(
      getTemplateDesignDraft(documentId, denied, database([currentRow()]))
    ).rejects.toThrow('denied')
    expect(denied).toHaveBeenCalledWith(structuredDesign().scope.clientId)
  })

  it('accepts only template drafts with consistent actual owner scope', async () => {
    await expect(
      getTemplateDesignDraft(
        documentId,
        allow,
        database([{ ...currentRow(), template_kind: 'template' }])
      )
    ).rejects.toMatchObject({ code: 'TEMPLATE_DRAFT_REQUIRED' })

    await expect(
      getTemplateDesignDraft(
        documentId,
        allow,
        database([{ ...currentRow(), template_client_id: null }])
      )
    ).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' })
    expect(allow).toHaveBeenCalledTimes(2)
  })

  it('reads the exact joined current head and returns canonical structured source', async () => {
    const row = currentRow()
    const db = database([row])
    const result = await getTemplateDesignDraft(documentId, allow, db)

    expect(result).toEqual({
      state: 'structured',
      documentId,
      templateId,
      headRevisionId,
      projectionRevisionId: headRevisionId,
      projection: { state: 'current' },
      source: row.payload
    })
    expect(result).not.toHaveProperty('html')
    expect(db.query).toHaveBeenCalledTimes(1)
    const [sql, params] = vi.mocked(db.query).mock.calls[0]
    expect(sql).toContain('r.id=d.head_revision_id')
    expect(sql).toContain('r.document_id=d.id')
    expect(params).toEqual([documentId])
  })

  it('returns the raw legacy snapshot without structured validation or precision loss', async () => {
    const legacySource
      = '{"id":"20000000-0000-4000-8000-000000000002","legacy_number":9007199254740993,"body_html":"<p>frozen</p>"}'
    const row = {
      ...currentRow(),
      schema_version: 0,
      payload: { legacy_number: 9007199254740992 },
      payload_text: legacySource,
      projection_revision_id: null,
      projection_source: { legacy: true }
    }
    const result = await getTemplateDesignDraft(
      documentId,
      allow,
      database([row])
    )
    expect(result).toEqual({
      state: 'legacy',
      ownerChangedSinceSnapshot: false,
      documentId,
      templateId,
      headRevisionId,
      projectionRevisionId: null,
      projection: { state: 'unverified' },
      source: legacySource
    })
  })

  it('reports live legacy changes without replacing the immutable snapshot', async () => {
    const source = '{"body_html":"original snapshot"}'
    const result = await getTemplateDesignDraft(
      documentId,
      allow,
      database([
        {
          ...currentRow(),
          schema_version: 0,
          payload_text: source,
          legacy_changed: true
        }
      ])
    )
    expect(result).toMatchObject({
      state: 'legacy',
      source,
      ownerChangedSinceSnapshot: true
    })
  })

  it('rejects invalid stored structured payloads only after authorization', async () => {
    const authorized = vi.fn(async (_clientId: string | null) => {})
    await expect(
      getTemplateDesignDraft(
        documentId,
        authorized,
        database([{ ...currentRow(), payload: { invalid: true } }])
      )
    ).rejects.toMatchObject({ code: 'INVALID_STORED_DESIGN' })
    expect(authorized).toHaveBeenCalledTimes(1)
  })

  it('rejects a canonical kind or scope that disagrees with the persisted owner', async () => {
    const wrongKind = structuredDesign()
    wrongKind.kind = 'campaign-draft'
    await expect(
      getTemplateDesignDraft(
        documentId,
        allow,
        database([{ ...currentRow(), payload: wrongKind }])
      )
    ).rejects.toMatchObject({ code: 'KIND_MISMATCH' })

    const wrongScope = structuredDesign()
    wrongScope.scope.clientId = '50000000-0000-4000-8000-000000000005'
    await expect(
      getTemplateDesignDraft(
        documentId,
        allow,
        database([{ ...currentRow(), payload: wrongScope }])
      )
    ).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' })
  })

  it('keeps canonical source available but marks a stale projection', async () => {
    const result = await getTemplateDesignDraft(
      documentId,
      allow,
      database([{ ...currentRow(), projection_revision_id: otherRevisionId }])
    )
    expect(result).toMatchObject({
      state: 'structured',
      headRevisionId,
      projectionRevisionId: otherRevisionId,
      projection: { state: 'stale' }
    })
    expect(result).not.toHaveProperty('html')
  })

  it('detects source drift even when the projection marker names the current head', async () => {
    const row = currentRow()
    row.projection_source = {
      root: { type: 'EmailLayout', data: { childrenIds: [] } }
    }
    const result = await getTemplateDesignDraft(
      documentId,
      allow,
      database([row])
    )
    expect(result).toMatchObject({ projection: { state: 'stale' } })
  })

  it('distinguishes an unprojected canonical head from send-ready HTML', async () => {
    const result = await getTemplateDesignDraft(
      documentId,
      allow,
      database([{ ...currentRow(), projection_revision_id: null }])
    )
    expect(result).toMatchObject({
      state: 'structured',
      projectionRevisionId: null,
      projection: { state: 'unprojected' }
    })
    expect(result).not.toHaveProperty('html')
  })

  it('uses stable content-free service errors for invalid stored state', async () => {
    const error = await getTemplateDesignDraft(
      documentId,
      allow,
      database([{ ...currentRow(), schema_version: 2 }])
    ).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(DesignReadError)
    expect(error).toMatchObject({ code: 'INVALID_STORED_DESIGN' })
  })
})
