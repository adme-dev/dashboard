import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { applyEmailTemplateProposal, captureEmailTemplateDraft, EmailTemplateProposalRequestSchema, EmailTemplateProposalSchema, type EmailTemplateDraftSnapshot, type EmailTemplateProposal, type EmailTemplateProposalDraft } from '~~/shared/pageStudio/emailTemplateProposals'

/** Proposals never write to the editor. Apply returns one detached, unsaved
 * template for its existing history mechanism; transport retries stay disabled. */
export function useEmailTemplateProposal(
  current: () => EmailTemplateProposalDraft | null,
  allowed: () => boolean,
  request: (body: ReturnType<typeof EmailTemplateProposalRequestSchema.parse>) => Promise<unknown>
) {
  const prompt = ref(''), modelId = ref(''), pending = ref(false), error = ref('')
  const proposal = shallowRef<EmailTemplateProposal | null>(null)
  const requested = shallowRef<EmailTemplateDraftSnapshot | null>(null)
  let active = true
  const dirty = computed(() => pending.value || Boolean(prompt.value || proposal.value || error.value))
  const canGenerate = computed(() => active && allowed() && Boolean(current()) && Boolean(modelId.value && prompt.value.trim())
    && prompt.value.trim().length <= 4000 && !pending.value && !proposal.value && !error.value)
  const canApply = computed(() => {
    if (!active || !allowed() || !proposal.value || !requested.value || pending.value) return false
    try {
      applyEmailTemplateProposal(proposal.value, requested.value, current())
      return true
    } catch { return false }
  })
  async function generate() {
    if (!canGenerate.value) return
    const selectedModel = modelId.value
    const instruction = prompt.value
    pending.value = true
    try {
      const snapshot = await captureEmailTemplateDraft(current())
      if (!active || !allowed()) return
      const draft: EmailTemplateProposalDraft = JSON.parse(snapshot.canonical)
      const body = EmailTemplateProposalRequestSchema.parse({ template: draft.template, checkpointId: draft.checkpointId,
        expectedRevision: draft.expectedRevision, customised: draft.customised, pageId: draft.pageId, formId: draft.formId,
        operationId: crypto.randomUUID(), modelId: selectedModel, prompt: instruction })
      const response = await request(body)
      if (!active) return
      const parsed = EmailTemplateProposalSchema.parse(response)
      if (parsed.operationId !== body.operationId || parsed.modelId !== body.modelId || parsed.baseDigest !== snapshot.digest) throw new Error('Mismatched proposal')
      // Validate selected images as well as schema before presenting the result.
      applyEmailTemplateProposal(parsed, snapshot, draft)
      requested.value = snapshot
      proposal.value = parsed
    } catch {
      if (active) error.value = 'No proposal could be confirmed. Your draft is unchanged. This request may have used an AI operation. Discard this attempt before starting another.'
    } finally {
      if (active) pending.value = false
    }
  }
  function discard() {
    if (pending.value) return
    proposal.value = null
    requested.value = null
    prompt.value = ''
    error.value = ''
  }
  function apply() {
    if (!canApply.value || !proposal.value || !requested.value) return null
    const template = applyEmailTemplateProposal(proposal.value, requested.value, current())
    discard()
    return template
  }
  onScopeDispose(() => {
    active = false
  })
  return { prompt, modelId, pending, error, proposal, requested, dirty, canGenerate, canApply, generate, discard, apply }
}
