import { createError } from 'h3'

const copyRequired = 'email_design_scope_copy_required'
const revisionRequired = 'email_design_revision_required'
export const DESIGN_REVISION_CONSTRAINTS = new Set([revisionRequired, 'email_design_campaign_revision_required', 'email_design_campaign_projection_consistent', 'email_design_campaign_frozen', 'email_design_base_template_required', 'email_design_base_template_immutable'])

/** Only translate constraints owned by the design migration. Never expose the
 * database detail (which can contain source values) in a client response. */
export function rethrowLegacyDesignConflict(error: unknown): never {
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && 'constraint' in error
  ) {
    if (error.code === '55000' && error.constraint === copyRequired)
      throw createError({ statusCode: 409, statusMessage: copyRequired })
    if (
      (error.code === '55000'
        && DESIGN_REVISION_CONSTRAINTS.has(String(error.constraint)))
      || (error.code === '23503'
        && error.constraint === 'email_design_documents_template_id_fkey')
    ) {
      throw createError({
        statusCode: 409,
        statusMessage: revisionRequired,
        message: 'Reload the saved canonical draft and correct its registered assets before retrying this edit.'
      })
    }
  }
  throw error
}
