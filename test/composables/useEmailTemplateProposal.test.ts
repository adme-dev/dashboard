import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useEmailTemplateProposal } from '../../app/composables/useEmailTemplateProposal'
import { captureEmailTemplateDraft, type EmailTemplateProposalDraft } from '../../shared/pageStudio/emailTemplateProposals'
import { starterEmailTemplate } from '../../shared/pageStudio/emailTemplates'

const scopes: ReturnType<typeof effectScope>[] = []
function fixture(): EmailTemplateProposalDraft {
  return { siteId: '30000000-0000-4000-8000-000000000001', apiAudience: 'portal', audience: 'team', checkpointId: 'checkpoint', expectedRevision: 0, pageId: 'contact', formId: 'enquiry', customised: false, template: starterEmailTemplate('team') }
}
function setup() {
  const draft = ref<EmailTemplateProposalDraft | null>(fixture()), allowed = ref(true)
  const request = vi.fn(async body => ({ schemaVersion: 1, id: crypto.randomUUID(), operationId: body.operationId, modelId: body.modelId,
    baseDigest: (await captureEmailTemplateDraft({ ...fixture(), template: body.template })).digest,
    summary: 'A clearer subject', warnings: [], template: { ...body.template, subject: 'Improved' } }))
  const scope = effectScope()
  scopes.push(scope)
  const state = scope.run(() => useEmailTemplateProposal(() => draft.value, () => allowed.value, request))!
  state.prompt.value = 'Improve the subject'
  state.modelId.value = 'groq/model'
  return { draft, allowed, request, scope, state }
}
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))
describe('email template proposal interaction', () => {
  it('captures before asynchronous work and never mutates the draft until explicit Apply', async () => {
    const s = setup()
    const work = s.state.generate()
    s.state.modelId.value = 'changed/model'
    s.state.prompt.value = 'A different instruction'
    await work
    expect(s.request.mock.calls[0]![0]).toMatchObject({ modelId: 'groq/model', prompt: 'Improve the subject' })
    expect(s.draft.value!.template.subject).not.toBe('Improved')
    expect(s.state.canApply.value).toBe(true)
    const applied = s.state.apply()
    expect(applied?.subject).toBe('Improved')
    expect(s.draft.value!.template.subject).not.toBe('Improved')
    expect(s.state.dirty.value).toBe(false)
  })
  it('keeps manual edits and refuses stale proposals after edits, form switches or lost permission', async () => {
    for (const change of ['text', 'form', 'access']) {
      const s = setup()
      await s.state.generate()
      if (change === 'text') s.draft.value!.template.subject = 'Manual edit'
      if (change === 'form') s.draft.value!.formId = 'another'
      if (change === 'access') s.allowed.value = false
      expect(s.state.canApply.value).toBe(false)
      expect(s.state.apply()).toBeNull()
      expect(s.state.proposal.value).not.toBeNull()
      expect(s.state.dirty.value).toBe(true)
    }
  })
  it('suppresses duplicate requests, refuses replacement until discard and never retries uncertain work', async () => {
    const s = setup()
    let reject!: (error: Error) => void
    s.request.mockImplementation(() => new Promise((_, no) => {
      reject = no
    }))
    const work = s.state.generate()
    await vi.waitFor(() => expect(s.request).toHaveBeenCalledTimes(1))
    await s.state.generate()
    reject(new Error('private upstream response'))
    await work
    expect(s.state.error.value).not.toContain('private upstream')
    await s.state.generate()
    expect(s.request).toHaveBeenCalledTimes(1)
    expect(s.state.dirty.value).toBe(true)
    s.state.discard()
    expect(s.state.dirty.value).toBe(false)
  })
  it('validates response identity and ignores completion after leaving', async () => {
    const s = setup()
    const original = s.request.getMockImplementation()!
    s.request.mockImplementation(async body => ({ ...await original(body), operationId: crypto.randomUUID() }))
    await s.state.generate()
    expect(s.state.proposal.value).toBeNull()
    expect(s.state.error.value).not.toBe('')
    const t = setup()
    let finish!: (value: unknown) => void
    t.request.mockImplementation(() => new Promise((resolve) => {
      finish = resolve as typeof finish
    }))
    const work = t.state.generate()
    await vi.waitFor(() => expect(t.request).toHaveBeenCalledTimes(1))
    t.scope.stop()
    finish({})
    await work
    expect(t.state.proposal.value).toBeNull()
  })
  it('does not dispatch after access changes while capturing a snapshot', async () => {
    const s = setup()
    const work = s.state.generate()
    s.allowed.value = false
    await work
    expect(s.request).not.toHaveBeenCalled()
  })
})
