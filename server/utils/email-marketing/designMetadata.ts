import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { validateEmailDesign } from '../../../shared/emailRendering/designContract'
import { designToRendererDocument } from '../../../shared/emailRendering/designAdapter'
import type { EmailRendererClient } from '../../../shared/emailRendering/contract'
import { resolveStoredDesignDependencies } from './designDependencies'
import { lockDesignDraftOwner, assertDesignDraftMutable, writeDesignDraftProjection } from './designDraftOwners'
import {
  DesignRevisionError,
  digestDesignRequest,
  digestDesignHtml,
  type CampaignDesignWriteOptions,
  type DesignTransaction,
  type DesignRevisionReceipt
} from './designRevisions'

const Input = z.object({
  documentId: z.string().uuid(),
  actorId: z.string().uuid(),
  operationId: z.string().uuid(),
  expectedRevisionId: z.string().uuid(),
  expectedClientId: z.string().uuid().nullable(),
  subject: z.string().max(300).nullable(),
  previewText: z.string().max(300).nullable()
}).strict()
export type SaveTemplateDraftMetadataInput = z.infer<typeof Input>

/** Compatibility wrapper: never interprets a campaign as a template draft. */
export function saveTemplateDraftMetadata(
  input: SaveTemplateDraftMetadataInput,
  authorize: (clientId: string | null) => Promise<void>,
  renderer: EmailRendererClient,
  runTransaction?: DesignTransaction,
  authorizeModuleRead?: (moduleId: string, clientId: string | null) => Promise<void>
): Promise<DesignRevisionReceipt> {
  return saveDesignDraftMetadata(input, authorize, renderer, runTransaction, { authorizeModuleRead }, 'template')
}

export function saveCampaignDraftMetadata(
  input: SaveTemplateDraftMetadataInput,
  authorize: (clientId: string | null) => Promise<void>,
  renderer: EmailRendererClient,
  runTransaction?: DesignTransaction,
  options: CampaignDesignWriteOptions = {}
): Promise<DesignRevisionReceipt> {
  return saveDesignDraftMetadata(input, authorize, renderer, runTransaction, options, 'campaign')
}

/** A metadata-only successor copies saved canonical bytes and shares the same
 * locks/CAS/projection/receipt owner. Combined campaign content+metadata writes
 * use saveStaffCampaignDesignDraft, never two independent saves. */
export async function saveDesignDraftMetadata(
  input: SaveTemplateDraftMetadataInput,
  authorize: (clientId: string | null) => Promise<void>,
  renderer: EmailRendererClient,
  runTransaction: DesignTransaction = callback => transactionWithoutRetry(db => callback(db)),
  options: CampaignDesignWriteOptions = {},
  expectedKind?: 'template' | 'campaign'
): Promise<DesignRevisionReceipt> {
  const request = Input.parse(input)
  // Metadata cannot select/update a base template.
  if (options.baseTemplateRevisionId !== undefined) throw new DesignRevisionError('BASE_TEMPLATE_REVISION_CONFLICT')
  return runTransaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${request.actorId}:${request.operationId}`])
    const locked = await lockDesignDraftOwner(db, request.documentId)
    const { owner, document } = locked
    if (document.client_id !== request.expectedClientId || (expectedKind && owner.kind !== expectedKind)) throw new DesignRevisionError('NOT_FOUND')
    await authorize(document.client_id)
    // Read the originally expected parent even on replay after a later head.
    const parent = (await db.query(`SELECT schema_version, payload, payload_text, to_jsonb(r)->>'base_template_revision_id' AS base_template_revision_id
      FROM email_design_revisions r WHERE document_id=$1 AND id=$2`, [request.documentId, request.expectedRevisionId])).rows[0] as {
      schema_version: number
      payload: unknown
      payload_text: string
      base_template_revision_id: string | null
    } | undefined
    const basePin = parent?.base_template_revision_id ?? null
    // Keep existing template receipt digests byte-for-byte compatible.
    const digest = owner.kind === 'template'
      ? await digestDesignHtml(JSON.stringify({
          target: 'template-metadata', documentId: request.documentId, expectedRevisionId: request.expectedRevisionId,
          expectedClientId: request.expectedClientId, subject: request.subject, previewText: request.previewText
        }))
      : await digestDesignRequest({ owner, command: 'draft-metadata', documentId: request.documentId,
          expectedRevisionId: request.expectedRevisionId, expectedClientId: request.expectedClientId,
          subject: request.subject, previewText: request.previewText, baseTemplateRevisionId: basePin })
    const prior = (await db.query('SELECT document_id, revision_id, payload_sha256 FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2',
      [request.actorId, request.operationId])).rows[0] as { document_id: string, revision_id: string, payload_sha256: string } | undefined
    if (prior && (prior.document_id !== request.documentId || prior.payload_sha256 !== digest)) throw new DesignRevisionError('IDEMPOTENCY_CONFLICT')
    if (!parent || parent.schema_version !== 1) throw new DesignRevisionError('STRUCTURED_REVISION_REQUIRED')
    const design = validateEmailDesign(parent.payload)
    if (design.kind !== (owner.kind === 'template' ? 'template' : 'campaign-draft') || design.scope.clientId !== document.client_id) throw new DesignRevisionError('SCOPE_MISMATCH')
    const checkDependencies = async () => {
      if (design.dependencies.length || design.moduleInstances.length) {
        if (!options.authorizeModuleRead) throw new DesignRevisionError('DEPENDENCY_AUTHORITY_REQUIRED')
        await resolveStoredDesignDependencies(design, db, options.authorizeModuleRead)
      }
      if (basePin) {
        const pin = (await db.query(`SELECT d.template_id, d.client_id FROM email_design_revisions r JOIN email_design_documents d ON d.id=r.document_id
          WHERE r.id=$1 AND r.schema_version=1 AND d.template_id IS NOT NULL`, [basePin])).rows[0] as { template_id: string, client_id: string | null } | undefined
        if (!pin || (pin.client_id !== null && pin.client_id !== document.client_id)) throw new DesignRevisionError('SCOPE_MISMATCH')
        if (!options.authorizeTemplateRead) throw new DesignRevisionError('DEPENDENCY_AUTHORITY_REQUIRED')
        await options.authorizeTemplateRead(pin.template_id, pin.client_id)
      }
      await authorize(document.client_id)
    }
    await checkDependencies()
    // A confirmed historical receipt remains readable after freeze.
    if (prior) return { documentId: prior.document_id, revisionId: prior.revision_id }
    assertDesignDraftMutable(locked)
    if (document.head_revision_id !== request.expectedRevisionId) throw new DesignRevisionError('REVISION_CONFLICT')
    const { document: source } = designToRendererDocument(design)
    let deadline: ReturnType<typeof setTimeout> | undefined
    let html: string
    try {
      html = await Promise.race([
        renderer.renderDocument(source, {
          ...(request.subject !== null ? { subjectLine: request.subject } : {}),
          ...(request.previewText !== null ? { previewText: request.previewText } : {})
        }),
        new Promise<never>((_, reject) => {
          deadline = setTimeout(() => reject(new DesignRevisionError('RENDER_TIMEOUT')), 15_000)
        })
      ])
    } finally { clearTimeout(deadline) }
    const htmlHash = owner.kind === 'campaign' ? await digestDesignHtml(html) : null
    await checkDependencies()
    const revision = (await db.query(`INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,payload_text,created_by,subject,preview_text${owner.kind === 'campaign' ? ',base_template_revision_id,rendered_html_sha256' : ''})
      VALUES ($1,$2,1,$3,$4,$5,$6${owner.kind === 'campaign' ? ',$7,$8' : ''}) RETURNING id`,
    [request.documentId, request.expectedRevisionId, parent.payload_text, request.actorId, request.subject, request.previewText,
      ...(owner.kind === 'campaign' ? [basePin, htmlHash] : [])])).rows[0] as { id: string }
    await db.query('UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1', [request.documentId, revision.id])
    await writeDesignDraftProjection(db, locked, revision.id, design, html, { subject: request.subject, previewText: request.previewText })
    await db.query('INSERT INTO email_design_revision_receipts(actor_id,operation_id,document_id,payload_sha256,revision_id) VALUES ($1,$2,$3,$4,$5)',
      [request.actorId, request.operationId, request.documentId, digest, revision.id])
    return { documentId: request.documentId, revisionId: revision.id }
  })
}
