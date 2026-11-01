import { z } from 'zod'
import {
  validateEmailDesign,
  assertStaffDesignEdit,
  type EmailDesignDocument
} from '../../../shared/emailRendering/designContract'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { resolveStoredDesignDependencies } from './designDependencies'
import { designToRendererDocument } from '../../../shared/emailRendering/designAdapter'
import type { EmailRendererClient } from '../../../shared/emailRendering/contract'

export interface DesignDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>
}
type DocumentRow = {
  id: string
  template_id: string | null
  module_id: string | null
  campaign_id: string | null
  client_id: string | null
  head_revision_id: string | null
}
export type DesignTransaction = <T>(
  callback: (db: DesignDb) => Promise<T>
) => Promise<T>
export interface AppendDesignRevisionInput {
  documentId: string
  actorId: string
  operationId: string
  expectedRevisionId: string | null
  design: unknown
}
export interface DesignRevisionReceipt {
  documentId: string
  revisionId: string
}
export class DesignRevisionError extends Error {
  constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'SCOPE_MISMATCH'
      | 'KIND_MISMATCH'
      | 'REVISION_CONFLICT'
      | 'IDEMPOTENCY_CONFLICT'
      | 'CAMPAIGN_FROZEN'
      | 'LEGACY_SNAPSHOT_REQUIRED'
      | 'LEGACY_CONTENT_CHANGED'
      | 'STRUCTURED_REVISION_REQUIRED'
      | 'DEPENDENCY_AUTHORITY_REQUIRED'
      | 'TEMPLATE_DRAFT_REQUIRED'
      | 'RENDER_TIMEOUT'
  ) {
    super(code)
  }
}
const Identity = z
  .object({
    documentId: z.string().uuid(),
    actorId: z.string().uuid(),
    operationId: z.string().uuid(),
    expectedRevisionId: z.string().uuid().nullable()
  })
  .strict()
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(',')}}`
}
async function payloadDigest(
  documentId: string,
  expectedRevisionId: string | null,
  design: EmailDesignDocument,
  target: 'source' | 'template-draft'
): Promise<string> {
  const bytes = new TextEncoder().encode(
    canonical({ documentId, expectedRevisionId, design, target })
  )
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), value =>
    value.toString(16).padStart(2, '0')
  ).join('')
}

/** Append only to a pre-established document identity. The caller must derive
 * actorId from auth and supply fresh authority checks, not trust browser scope.
 * No automatic transaction retry: after unknown commit acknowledgement, callers
 * must reconcile with the SAME operation ID and payload. This is a saved-source
 * receipt, never a publish, render, send or asset-readiness certificate. */
interface DesignDependencyAuthority {
  authorizeModuleRead?: (
    moduleId: string,
    clientId: string | null
  ) => Promise<void>
}

/** Structural authoring boundary. authorize must grant designer authority,
 * not merely ordinary content editing. Never select it from a browser role. */
export function appendDesignRevision(
  input: AppendDesignRevisionInput,
  authorize: (clientId: string | null) => Promise<void>,
  runTransaction?: DesignTransaction,
  dependencies: DesignDependencyAuthority = {}
): Promise<DesignRevisionReceipt> {
  return appendRevision(input, authorize, runTransaction, dependencies, false)
}

/** Staff content boundary: compares against the locked persisted head, never
 * a browser-supplied baseline. First conversion from legacy requires a designer. */
export function appendStaffDesignRevision(
  input: AppendDesignRevisionInput,
  authorize: (clientId: string | null) => Promise<void>,
  runTransaction?: DesignTransaction,
  dependencies: DesignDependencyAuthority = {}
): Promise<DesignRevisionReceipt> {
  return appendRevision(input, authorize, runTransaction, dependencies, true)
}

/** Atomic projection into an existing template draft, never library publication.
 * The authoriser must grant structural designer access. Rendering remains private. */
export function saveTemplateDesignDraft(
  input: AppendDesignRevisionInput,
  authorize: (clientId: string | null) => Promise<void>,
  renderer: EmailRendererClient,
  runTransaction?: DesignTransaction,
  dependencies: DesignDependencyAuthority = {}
): Promise<DesignRevisionReceipt> {
  return appendRevision(
    input,
    authorize,
    runTransaction,
    dependencies,
    false,
    renderer
  )
}

/** Same atomic draft projection with persisted staff content-edit policy. */
export function saveStaffTemplateDesignDraft(
  input: AppendDesignRevisionInput,
  authorize: (clientId: string | null) => Promise<void>,
  renderer: EmailRendererClient,
  runTransaction?: DesignTransaction,
  dependencies: DesignDependencyAuthority = {}
): Promise<DesignRevisionReceipt> {
  return appendRevision(
    input,
    authorize,
    runTransaction,
    dependencies,
    true,
    renderer
  )
}

async function appendRevision(
  input: AppendDesignRevisionInput,
  authorize: (clientId: string | null) => Promise<void>,
  runTransaction: DesignTransaction = callback =>
    transactionWithoutRetry(db => callback(db)),
  dependencies: DesignDependencyAuthority,
  staffOnly: boolean,
  templateDraftRenderer?: EmailRendererClient
): Promise<DesignRevisionReceipt> {
  const identity = Identity.parse({
    documentId: input.documentId,
    actorId: input.actorId,
    operationId: input.operationId,
    expectedRevisionId: input.expectedRevisionId
  })
  const design = validateEmailDesign(input.design)
  const digest = await payloadDigest(
    identity.documentId,
    identity.expectedRevisionId,
    design,
    templateDraftRenderer ? 'template-draft' : 'source'
  )
  return runTransaction(async (db) => {
    // Serialise the operation identity even if conflicting calls target different
    // documents. A hash collision only adds contention, never shares authority.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `${identity.actorId}:${identity.operationId}`
    ])
    const document = (
      await db.query('SELECT * FROM email_design_documents WHERE id=$1', [
        identity.documentId
      ])
    ).rows[0] as DocumentRow | undefined
    if (!document) throw new DesignRevisionError('NOT_FOUND')
    if (design.scope.clientId !== document.client_id)
      throw new DesignRevisionError('NOT_FOUND')
    const kind = document.template_id
      ? 'template'
      : document.module_id
        ? 'module'
        : 'campaign-draft'
    // The allowlisted table comes from the immutable server identity, never input.
    const table = document.template_id
      ? 'edm_templates'
      : document.module_id
        ? 'edm_custom_modules'
        : 'campaigns'
    const ownerId
      = document.template_id ?? document.module_id ?? document.campaign_id
    const owner = (
      await db.query(
        `SELECT client_id${kind === 'campaign-draft' ? ', status' : kind === 'template' ? ', template_kind, subject, preview_text' : ''} FROM ${table} WHERE id=$1 FOR UPDATE`,
        [ownerId]
      )
    ).rows[0] as
    | {
      client_id: string | null
      status?: string
      template_kind?: string
      subject?: string | null
      preview_text?: string | null
    }
    | undefined
    if (!owner) throw new DesignRevisionError('NOT_FOUND')
    const locked = (
      await db.query(
        'SELECT head_revision_id FROM email_design_documents WHERE id=$1 FOR UPDATE',
        [identity.documentId]
      )
    ).rows[0] as { head_revision_id: string | null } | undefined
    if (!locked) throw new DesignRevisionError('NOT_FOUND')
    document.head_revision_id = locked.head_revision_id
    if (owner.client_id !== document.client_id)
      throw new DesignRevisionError('SCOPE_MISMATCH')
    if (design.kind !== kind) throw new DesignRevisionError('KIND_MISMATCH')
    // Revalidate authority after waiting for both database locks.
    await authorize(document.client_id)
    if (design.dependencies.length || design.moduleInstances.length) {
      if (!dependencies.authorizeModuleRead)
        throw new DesignRevisionError('DEPENDENCY_AUTHORITY_REQUIRED')
      await resolveStoredDesignDependencies(
        design,
        db,
        dependencies.authorizeModuleRead
      )
    }
    const prior = (
      await db.query(
        'SELECT document_id, revision_id, payload_sha256 FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2',
        [identity.actorId, identity.operationId]
      )
    ).rows[0] as
    | { document_id: string, revision_id: string, payload_sha256: string }
    | undefined
    if (prior) {
      if (
        prior.payload_sha256 !== digest
        || prior.document_id !== identity.documentId
      )
        throw new DesignRevisionError('IDEMPOTENCY_CONFLICT')
      return { documentId: prior.document_id, revisionId: prior.revision_id }
    }
    if (kind === 'campaign-draft' && owner.status !== 'draft')
      throw new DesignRevisionError('CAMPAIGN_FROZEN')
    if (
      templateDraftRenderer
      && (kind !== 'template' || owner.template_kind !== 'draft')
    )
      throw new DesignRevisionError('TEMPLATE_DRAFT_REQUIRED')
    if (!document.head_revision_id)
      throw new DesignRevisionError('LEGACY_SNAPSHOT_REQUIRED')
    if (document.head_revision_id !== identity.expectedRevisionId)
      throw new DesignRevisionError('REVISION_CONFLICT')
    const current = (
      await db.query(
        `SELECT r.schema_version, r.payload,
          CASE WHEN r.schema_version=0 THEN to_jsonb(source_record)=r.payload ELSE TRUE END AS legacy_unchanged
         FROM email_design_revisions r CROSS JOIN ${table} source_record
         WHERE r.document_id=$1 AND r.id=$2 AND source_record.id=$3`,
        [identity.documentId, document.head_revision_id, ownerId]
      )
    ).rows[0] as
    | { schema_version: number, payload: unknown, legacy_unchanged: boolean }
    | undefined
    if (!current) throw new DesignRevisionError('REVISION_CONFLICT')
    // A legacy editor can still write schema-0 owners. Head CAS alone cannot
    // detect those edits. Compare entirely in SQL to preserve numeric precision.
    if (current.schema_version === 0 && !current.legacy_unchanged)
      throw new DesignRevisionError('LEGACY_CONTENT_CHANGED')
    if (staffOnly) {
      if (current.schema_version !== 1)
        throw new DesignRevisionError('STRUCTURED_REVISION_REQUIRED')
      assertStaffDesignEdit(validateEmailDesign(current.payload), design)
    }
    let projection: { source: unknown, html: string } | undefined
    if (templateDraftRenderer) {
      const { document: source } = designToRendererDocument(design)
      let deadline: ReturnType<typeof setTimeout> | undefined
      const render = templateDraftRenderer.renderDocument(source, {
        ...(owner.subject != null ? { subjectLine: owner.subject } : {}),
        ...(owner.preview_text != null
          ? { previewText: owner.preview_text }
          : {})
      })
      let html: string
      try {
        html = await Promise.race([
          render,
          new Promise<never>((_, reject) => {
            deadline = setTimeout(
              () => reject(new DesignRevisionError('RENDER_TIMEOUT')),
              15_000
            )
          })
        ])
      } finally {
        clearTimeout(deadline)
      }
      // Rendering is asynchronous: access must still be valid at commit time.
      await authorize(document.client_id)
      if (dependencies.authorizeModuleRead)
        await resolveStoredDesignDependencies(
          design,
          db,
          dependencies.authorizeModuleRead
        )
      projection = { source, html }
    }
    const revision = (
      await db.query(
        `INSERT INTO email_design_revisions(document_id, parent_revision_id, schema_version, payload_text, created_by, subject, preview_text)
      VALUES ($1,$2,1,$3,$4,$5,$6) RETURNING id`,
        [
          identity.documentId,
          identity.expectedRevisionId,
          JSON.stringify(design),
          identity.actorId,
          owner.subject ?? null,
          owner.preview_text ?? null
        ]
      )
    ).rows[0] as { id: string }
    await db.query(
      'UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1',
      [identity.documentId, revision.id]
    )
    if (projection) {
      await db.query(
        'UPDATE edm_templates SET body_source=$2::jsonb, body_html=$3, email_design_revision_id=$4, updated_at=NOW() WHERE id=$1',
        [
          document.template_id,
          JSON.stringify(projection.source),
          projection.html,
          revision.id
        ]
      )
    }
    await db.query(
      `INSERT INTO email_design_revision_receipts(actor_id, operation_id, document_id, payload_sha256, revision_id)
      VALUES ($1,$2,$3,$4,$5)`,
      [
        identity.actorId,
        identity.operationId,
        identity.documentId,
        digest,
        revision.id
      ]
    )
    return { documentId: identity.documentId, revisionId: revision.id }
  })
}

/** Snapshot existing database content verbatim as JSONB with explicit legacy
 * provenance. No rendering, conversion, or update of the source row occurs.
 * Existing legacy records may exceed the new authoring envelope limits. */
export async function ensureLegacyDesignDocument(
  input: {
    kind: 'template' | 'module' | 'campaign-draft'
    ownerId: string
    actorId: string
  },
  authorize: (clientId: string | null) => Promise<void>,
  runTransaction: DesignTransaction = callback =>
    transactionWithoutRetry(db => callback(db))
): Promise<DesignRevisionReceipt> {
  const identity = z
    .object({
      kind: z.enum(['template', 'module', 'campaign-draft']),
      ownerId: z.string().uuid(),
      actorId: z.string().uuid()
    })
    .strict()
    .parse(input)
  const table
    = identity.kind === 'template'
      ? 'edm_templates'
      : identity.kind === 'module'
        ? 'edm_custom_modules'
        : 'campaigns'
  const column
    = identity.kind === 'template'
      ? 'template_id'
      : identity.kind === 'module'
        ? 'module_id'
        : 'campaign_id'
  return runTransaction(async (db) => {
    // Lock the source first, matching append's lock order, so concurrent first
    // opens cannot invent two independent revision histories for the same ID.
    const source = (
      await db.query(
        `SELECT client_id FROM ${table} source_record WHERE id=$1 FOR UPDATE`,
        [identity.ownerId]
      )
    ).rows[0] as { client_id: string | null } | undefined
    if (!source) throw new DesignRevisionError('NOT_FOUND')
    await authorize(source.client_id)
    if (identity.kind === 'campaign-draft' && !source.client_id)
      throw new DesignRevisionError('SCOPE_MISMATCH')
    let document = (
      await db.query(
        `SELECT * FROM email_design_documents WHERE ${column}=$1 FOR UPDATE`,
        [identity.ownerId]
      )
    ).rows[0] as DocumentRow | undefined
    if (document) {
      if (document.client_id !== source.client_id)
        throw new DesignRevisionError('SCOPE_MISMATCH')
      if (document.head_revision_id)
        return {
          documentId: document.id,
          revisionId: document.head_revision_id
        }
    } else {
      document = (
        await db.query(
          `INSERT INTO email_design_documents(${column},client_id) VALUES ($1,$2) RETURNING *`,
          [identity.ownerId, source.client_id]
        )
      ).rows[0] as DocumentRow
    }
    const revision = (
      await db.query(
        `INSERT INTO email_design_revisions(document_id, schema_version, origin, payload_text, created_by)
      SELECT $1,0,'legacy',to_jsonb(source_record)::text,$2 FROM ${table} source_record WHERE id=$3 RETURNING id`,
        [document.id, identity.actorId, identity.ownerId]
      )
    ).rows[0] as { id: string }
    await db.query(
      'UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1',
      [document.id, revision.id]
    )
    return { documentId: document.id, revisionId: revision.id }
  })
}
