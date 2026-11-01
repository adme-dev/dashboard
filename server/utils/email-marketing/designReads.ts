import { z } from 'zod'
import {
  validateEmailDesign,
  type EmailDesignDocument
} from '../../../shared/emailRendering/designContract'

export interface DesignDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>
}

export type DesignReadErrorCode
  = | 'INVALID_DOCUMENT_ID'
    | 'NOT_FOUND'
    | 'HEAD_NOT_FOUND'
    | 'SCOPE_MISMATCH'
    | 'KIND_MISMATCH'
    | 'TEMPLATE_DRAFT_REQUIRED'
    | 'INVALID_STORED_DESIGN'

export class DesignReadError extends Error {
  constructor(public readonly code: DesignReadErrorCode) {
    super(code)
  }
}

interface TemplateDesignDraftIdentity {
  documentId: string
  templateId: string
  headRevisionId: string
  projectionRevisionId: string | null
}

export type TemplateDesignDraftRead = TemplateDesignDraftIdentity
  & (
    | {
      state: 'structured'
      source: EmailDesignDocument
      projection: { state: 'current' | 'stale' | 'unprojected' }
    }
    | {
      state: 'legacy'
      source: string
      ownerChangedSinceSnapshot: boolean
      projection: { state: 'unverified' }
    }
  )

type TemplateDraftRow = {
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

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (
    left === null
    || right === null
    || typeof left !== 'object'
    || typeof right !== 'object'
  )
    return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameJson(value, right[index]))
    )
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return (
    leftKeys.length === rightKeys.length
    && leftKeys.every(
      key =>
        Object.hasOwn(rightRecord, key)
        && sameJson(leftRecord[key], rightRecord[key])
    )
  )
}

/** Reads only an existing template draft and its exact current head. Projection
 * state is not a publication, preflight or send-readiness certificate. */
export async function getTemplateDesignDraft(
  documentId: string,
  authorize: (clientId: string | null) => Promise<void>,
  db: DesignDb
): Promise<TemplateDesignDraftRead> {
  if (!z.string().uuid().safeParse(documentId).success)
    throw new DesignReadError('INVALID_DOCUMENT_ID')

  const row = (
    await db.query(
      `SELECT d.id AS document_id, d.template_id,
        d.client_id AS document_client_id, t.client_id AS template_client_id,
        t.template_kind, d.head_revision_id,
        r.schema_version, r.payload, r.payload_text,
        t.email_design_revision_id AS projection_revision_id,
        t.body_source AS projection_source,
        CASE WHEN r.schema_version=0 THEN to_jsonb(t) IS DISTINCT FROM r.payload ELSE FALSE END AS legacy_changed
       FROM email_design_documents d
       JOIN edm_templates t ON t.id=d.template_id
       LEFT JOIN email_design_revisions r
         ON r.document_id=d.id AND r.id=d.head_revision_id
       WHERE d.id=$1`,
      [documentId]
    )
  ).rows[0] as TemplateDraftRow | undefined

  if (!row) throw new DesignReadError('NOT_FOUND')
  await authorize(row.document_client_id)
  if (row.template_kind !== 'draft')
    throw new DesignReadError('TEMPLATE_DRAFT_REQUIRED')
  if (row.document_client_id !== row.template_client_id)
    throw new DesignReadError('SCOPE_MISMATCH')
  if (!row.head_revision_id || row.schema_version === null)
    throw new DesignReadError('HEAD_NOT_FOUND')

  const identity: TemplateDesignDraftIdentity = {
    documentId: row.document_id,
    templateId: row.template_id,
    headRevisionId: row.head_revision_id,
    projectionRevisionId: row.projection_revision_id
  }
  if (row.schema_version === 0) {
    if (typeof row.payload_text !== 'string')
      throw new DesignReadError('INVALID_STORED_DESIGN')
    return {
      ...identity,
      state: 'legacy',
      source: row.payload_text,
      ownerChangedSinceSnapshot: row.legacy_changed,
      projection: { state: 'unverified' }
    }
  }
  if (row.schema_version !== 1)
    throw new DesignReadError('INVALID_STORED_DESIGN')

  let source: EmailDesignDocument
  try {
    source = validateEmailDesign(row.payload)
  } catch {
    throw new DesignReadError('INVALID_STORED_DESIGN')
  }
  if (source.kind !== 'template') throw new DesignReadError('KIND_MISMATCH')
  if (source.scope.clientId !== row.document_client_id)
    throw new DesignReadError('SCOPE_MISMATCH')

  const projection
    = row.projection_revision_id === null
      ? { state: 'unprojected' as const }
      : row.projection_revision_id !== row.head_revision_id
        || !sameJson(row.projection_source, source.blocks)
        ? { state: 'stale' as const }
        : { state: 'current' as const }
  return { ...identity, state: 'structured', source, projection }
}
