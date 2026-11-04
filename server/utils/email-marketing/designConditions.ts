import { queryOneFresh } from '~~/server/utils/db'
import {
  ConditionActionSchema,
  applyConditionAction
} from '~~/shared/emailRendering/conditionActions'
import { validateEmailDesign } from '~~/shared/emailRendering/designContract'
import { EmailConditionError } from '~~/shared/emailRendering/conditions'
import {
  DesignRevisionError,
  saveDerivedTemplateDesignDraft,
  type DesignDb
} from './designRevisions'
import { designDigest } from '~~/shared/emailRendering/designModules'
import type { EmailRendererClient } from '~~/shared/emailRendering/contract'

export interface ConditionAuthority {
  actorId: string
  authorize(
    clientId: string | null,
    access: 'read' | 'write'
  ): Promise<'staff' | 'designer'>
}
export async function saveDesignCondition(
  input: unknown,
  authority: ConditionAuthority,
  renderer: EmailRendererClient,
  read: DesignDb['query'] = async (sql, params) => ({
    rows: [await queryOneFresh(sql, params)].filter(Boolean)
  }),
  save = saveDerivedTemplateDesignDraft
) {
  const action = ConditionActionSchema.parse(input)
  // Read the IMMUTABLE requested baseline, not current head. Unknown commit
  // acknowledgements replay the exact same derived source and receipt digest.
  const row = (
    await read(
      `SELECT r.payload, r.schema_version, d.client_id, t.client_id AS owner_client_id, t.template_kind
    FROM email_design_documents d JOIN edm_templates t ON t.id=d.template_id
    JOIN email_design_revisions r ON r.document_id=d.id AND r.id=$2
    WHERE d.id=$1`,
      [action.documentId, action.expectedRevisionId]
    )
  ).rows[0] as
  | {
    payload: unknown
    schema_version: number
    client_id: string | null
    owner_client_id: string | null
    template_kind: string
  }
  | undefined
  if (!row) throw new DesignRevisionError('NOT_FOUND')
  const authorize = async (clientId: string | null) => {
    if ((await authority.authorize(clientId, 'write')) !== 'designer')
      throw Object.assign(new Error('DESIGNER_REQUIRED'), {
        statusCode: 403,
        statusMessage: 'DESIGNER_REQUIRED'
      })
  }
  await authorize(row.client_id)
  if (
    row.client_id !== row.owner_client_id
    || row.template_kind !== 'draft'
    || row.schema_version !== 1
  )
    throw new DesignRevisionError('TEMPLATE_DRAFT_REQUIRED')
  const baseline = validateEmailDesign(row.payload)
  if (baseline.scope.clientId !== row.client_id || baseline.kind !== 'template')
    throw new DesignRevisionError('SCOPE_MISMATCH')
  let design
  try {
    design = applyConditionAction(baseline, action)
  } catch (error) {
    if (
      error instanceof Error
      && error.message === 'PROTECTED_CONDITION_TARGET'
    )
      throw new EmailConditionError('PROTECTED_CONDITION_TARGET')
    throw error
  }
  return save(
    {
      documentId: action.documentId,
      actorId: authority.actorId,
      operationId: action.operationId,
      expectedRevisionId: action.expectedRevisionId,
      design
    },
    authorize,
    renderer,
    await designDigest({ boundary: 'email-condition-action-v1', action }),
    undefined,
    {
      authorizeModuleRead: async (_moduleId, clientId) => {
        await authority.authorize(clientId, 'read')
      }
    }
  )
}
