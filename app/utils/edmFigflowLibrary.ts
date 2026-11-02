import { composerToDesignDraft } from '~~/shared/emailRendering/designComposer'
import type { EdmFlyhubDocument } from '~~/app/types/edm'

/** Source capability only. Opening still requires fresh server authorization and
 * the stored revision policy; this is never a permission or send-ready verdict. */
export function figflowTemplateCapability(source: unknown) {
  try {
    const document = typeof source === 'string' ? JSON.parse(source) : source
    const design = composerToDesignDraft(document, null)
    return {
      document: design.blocks as EdmFlyhubDocument,
      editableFields: design.policy.editableFields.length,
      canOpen: design.policy.editableFields.length > 0,
      label: design.policy.editableFields.length ? 'Content editing' : 'Composer editing only'
    }
  } catch {
    return { document: null, editableFields: 0, canOpen: false, label: 'Composer editing only' }
  }
}

export function figflowComposerQuery(id: string) {
  // No copy/starter parameters: creation has already been confirmed by the API.
  return { id, workspace: 'figflow', openDesign: '1' }
}
