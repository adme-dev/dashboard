import { createError } from 'h3'

const copyRequired = 'email_design_scope_copy_required'
const revisionRequired = 'email_design_revision_required'

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
        && error.constraint === revisionRequired)
      || (error.code === '23503'
        && error.constraint === 'email_design_documents_template_id_fkey')
    ) {
      throw createError({
        statusCode: 409,
        statusMessage: revisionRequired
      })
    }
  }
  throw error
}
