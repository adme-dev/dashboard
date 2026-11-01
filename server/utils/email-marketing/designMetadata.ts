import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { validateEmailDesign } from '../../../shared/emailRendering/designContract'
import { designToRendererDocument } from '../../../shared/emailRendering/designAdapter'
import type { EmailRendererClient } from '../../../shared/emailRendering/contract'
import { resolveStoredDesignDependencies } from './designDependencies'
import {
  DesignRevisionError,
  type DesignTransaction,
  type DesignRevisionReceipt
} from './designRevisions'

const Input = z
  .object({
    documentId: z.string().uuid(),
    actorId: z.string().uuid(),
    operationId: z.string().uuid(),
    expectedRevisionId: z.string().uuid(),
    expectedClientId: z.string().uuid().nullable(),
    subject: z.string().max(300).nullable(),
    previewText: z.string().max(300).nullable()
  })
  .strict()
export type SaveTemplateDraftMetadataInput = z.infer<typeof Input>

/** Staff metadata is separate from structural design editing. Caller supplies
 * fresh scoped write authority; this operation never accepts replacement blocks. */
export async function saveTemplateDraftMetadata(
  input: SaveTemplateDraftMetadataInput,
  authorize: (clientId: string | null) => Promise<void>,
  renderer: EmailRendererClient,
  runTransaction: DesignTransaction = callback =>
    transactionWithoutRetry(db => callback(db)),
  authorizeModuleRead?: (
    moduleId: string,
    clientId: string | null
  ) => Promise<void>
): Promise<DesignRevisionReceipt> {
  const request = Input.parse(input)
  const digestBytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      JSON.stringify({
        target: 'template-metadata',
        documentId: request.documentId,
        expectedRevisionId: request.expectedRevisionId,
        expectedClientId: request.expectedClientId,
        subject: request.subject,
        previewText: request.previewText
      })
    )
  )
  const digest = Array.from(new Uint8Array(digestBytes), n =>
    n.toString(16).padStart(2, '0')
  ).join('')
  return runTransaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `${request.actorId}:${request.operationId}`
    ])
    const document = (
      await db.query(
        'SELECT template_id, client_id FROM email_design_documents WHERE id=$1',
        [request.documentId]
      )
    ).rows[0] as
      { template_id: string | null, client_id: string | null } | undefined
    if (
      !document
      || document.client_id !== request.expectedClientId
      || !document.template_id
    )
      throw new DesignRevisionError('NOT_FOUND')
    const owner = (
      await db.query(
        'SELECT client_id, template_kind FROM edm_templates WHERE id=$1 FOR UPDATE',
        [document.template_id]
      )
    ).rows[0] as { client_id: string | null, template_kind: string } | undefined
    if (!owner || owner.client_id !== document.client_id)
      throw new DesignRevisionError('NOT_FOUND')
    const locked = (
      await db.query(
        'SELECT head_revision_id FROM email_design_documents WHERE id=$1 FOR UPDATE',
        [request.documentId]
      )
    ).rows[0] as { head_revision_id: string | null } | undefined
    if (!locked) throw new DesignRevisionError('NOT_FOUND')
    await authorize(document.client_id)
    if (owner.template_kind !== 'draft')
      throw new DesignRevisionError('TEMPLATE_DRAFT_REQUIRED')
    const prior = (
      await db.query(
        'SELECT document_id, revision_id, payload_sha256 FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2',
        [request.actorId, request.operationId]
      )
    ).rows[0] as
    | { document_id: string, revision_id: string, payload_sha256: string }
    | undefined
    if (
      prior
      && (prior.document_id !== request.documentId
        || prior.payload_sha256 !== digest)
    )
      throw new DesignRevisionError('IDEMPOTENCY_CONFLICT')
    if (!prior && locked.head_revision_id !== request.expectedRevisionId)
      throw new DesignRevisionError('REVISION_CONFLICT')
    const head = (
      await db.query(
        'SELECT schema_version, payload, payload_text FROM email_design_revisions WHERE document_id=$1 AND id=$2',
        [request.documentId, prior?.revision_id ?? locked.head_revision_id]
      )
    ).rows[0] as
    | { schema_version: number, payload: unknown, payload_text: string }
    | undefined
    if (!head || head.schema_version !== 1)
      throw new DesignRevisionError('STRUCTURED_REVISION_REQUIRED')
    const design = validateEmailDesign(head.payload)
    if (
      design.kind !== 'template'
      || design.scope.clientId !== document.client_id
    )
      throw new DesignRevisionError('SCOPE_MISMATCH')
    const checkDependencies = async () => {
      if (!design.dependencies.length && !design.moduleInstances.length) return
      if (!authorizeModuleRead)
        throw new DesignRevisionError('DEPENDENCY_AUTHORITY_REQUIRED')
      await resolveStoredDesignDependencies(design, db, authorizeModuleRead)
    }
    await checkDependencies()
    if (prior)
      return { documentId: prior.document_id, revisionId: prior.revision_id }
    const { document: source } = designToRendererDocument(design)
    let deadline: ReturnType<typeof setTimeout> | undefined
    let html: string
    try {
      html = await Promise.race([
        renderer.renderDocument(source, {
          ...(request.subject !== null ? { subjectLine: request.subject } : {}),
          ...(request.previewText !== null
            ? { previewText: request.previewText }
            : {})
        }),
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
    await authorize(document.client_id)
    await checkDependencies()
    const revision = (
      await db.query(
        `INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,payload_text,created_by,subject,preview_text)
       VALUES ($1,$2,1,$3,$4,$5,$6) RETURNING id`,
        [
          request.documentId,
          request.expectedRevisionId,
          head.payload_text,
          request.actorId,
          request.subject,
          request.previewText
        ]
      )
    ).rows[0] as { id: string }
    await db.query(
      'UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1',
      [request.documentId, revision.id]
    )
    await db.query(
      'UPDATE edm_templates SET subject=$2, preview_text=$3, body_source=$4::jsonb, body_html=$5, email_design_revision_id=$6, updated_at=NOW() WHERE id=$1',
      [
        document.template_id,
        request.subject,
        request.previewText,
        JSON.stringify(source),
        html,
        revision.id
      ]
    )
    await db.query(
      'INSERT INTO email_design_revision_receipts(actor_id,operation_id,document_id,payload_sha256,revision_id) VALUES ($1,$2,$3,$4,$5)',
      [
        request.actorId,
        request.operationId,
        request.documentId,
        digest,
        revision.id
      ]
    )
    return { documentId: request.documentId, revisionId: revision.id }
  })
}
