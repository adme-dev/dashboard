import { describe, expect, it } from 'vitest'
import { rethrowLegacyDesignConflict } from '../../server/utils/email-marketing/designConflict'

describe('legacy versioned template conflict responses', () => {
  it('maps versioned scope moves to an explicit copy-required conflict', () => {
    expect(() => rethrowLegacyDesignConflict({ code: '55000', constraint: 'email_design_scope_copy_required', detail: 'private source' })).toThrow(expect.objectContaining({ statusCode: 409, statusMessage: 'email_design_scope_copy_required' }))
  })
  it.each([
    { code: '55000', constraint: 'email_design_revision_required' },
    { code: '23503', constraint: 'email_design_documents_template_id_fkey' }
  ])('returns a content-free conflict for guarded writes/deletes', (error) => {
    expect(() =>
      rethrowLegacyDesignConflict({ ...error, detail: 'private content' })
    ).toThrow(
      expect.objectContaining({
        statusCode: 409,
        statusMessage: 'email_design_revision_required'
      })
    )
  })
  it('preserves unrelated failures rather than disguising them as conflicts', () => {
    const error = new Error('unrelated')
    expect(() => rethrowLegacyDesignConflict(error)).toThrow(error)
  })
})
