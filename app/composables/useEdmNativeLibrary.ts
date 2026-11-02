import { ref } from 'vue'
import { parseNativeLibraryContext, stableDesignJson, type NativeLibraryContext } from '~~/shared/emailRendering/designModules'
import { applyDesignerOperations } from '~~/shared/emailRendering/designDesigner'
import type { DesignHandoff } from '~~/shared/emailRendering/designRoundtrip'
import type { TemplateDesignDraftRead } from '~~/server/utils/email-marketing/designReads'

export type NativeLibraryIntent = 'library' | 'images' | 'section' | 'template'
/** Captured native hints survive proposal/Apply, but never authorize another
 * owner, a later local edit, or a different canonical head. No writes here. */
export function useEdmNativeLibrary() {
  const state = ref<{
    documentId: string
    templateId: string
    context: NativeLibraryContext
    expected: string
    intent: NativeLibraryIntent
    reopenRequired: boolean
    ready: boolean
    revisionId: string | null
  } | null>(null)
  function capture(handoff: DesignHandoff, input: unknown, operationId: string, intent: NativeLibraryIntent) {
    if (handoff.state !== 'open')
      throw new Error('Open the current design before choosing library content.')
    const context = parseNativeLibraryContext(handoff.source, input, operationId)
    state.value = { documentId: handoff.draftId, templateId: handoff.templateId, context,
      expected: stableDesignJson(applyDesignerOperations(handoff.source, context.operations, operationId)),
      intent, ready: false, reopenRequired: false, revisionId: null }
    return context
  }
  function saved(draft: TemplateDesignDraftRead | null, revisionId: string) {
    const current = state.value
    if (!current || draft?.state !== 'structured' || draft.documentId !== current.documentId
      || draft.templateId !== current.templateId || draft.headRevisionId !== revisionId
      || draft.projection.state !== 'current' || stableDesignJson(draft.source) !== current.expected)
      throw new Error('The saved design changed. Reopen FigFlow before using this selection.')
    current.ready = true
    current.revisionId = revisionId
  }
  function requireReopen() {
    if (!state.value) return
    state.value.reopenRequired = true
    state.value.context.selectedBlockIds = []
    delete state.value.context.insertionTarget
  }
  return { state, capture, saved, requireReopen, clear: () => {
    state.value = null
  } }
}
