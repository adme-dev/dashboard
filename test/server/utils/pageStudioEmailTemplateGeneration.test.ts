import { describe, expect, it, vi } from 'vitest'
import { generateEmailTemplateProposal } from '../../../server/utils/pageStudio/emailTemplateGeneration'
import { starterEmailTemplate } from '../../../shared/pageStudio/emailTemplates'
import type { TrustedFormContext } from '../../../server/utils/pageStudio/formAuthority'

function setup() {
  const scope = { tenantId: 'tenant', clientId: 'client', businessId: 'client', siteId: '30000000-0000-4000-8000-000000000001', environment: 'staging' as const }
  const authority = { scope, actorId: 'editor', authorityKey: 'native-session', canEdit: true }
  const body = { operationId: '40000000-0000-4000-8000-000000000001', modelId: 'configured-model', prompt: 'Shorten the heading', checkpointId: 'checkpoint', expectedRevision: 0, pageId: 'contact', formId: 'enquiry', customised: true, template: starterEmailTemplate('team') }
  const output = { summary: 'A shorter subject', warnings: [], template: { ...starterEmailTemplate('team'), subject: 'New enquiry | {{site.name}}' } }
  const document = { id: scope.siteId, site: { id: scope.siteId, clientId: scope.clientId, name: 'Example business' }, studio: { checkpointId: 'checkpoint', pages: [{ id: 'contact', title: 'Contact', route: '/contact', forms: [{ id: 'enquiry', name: 'Contact form', fields: [{ id: 'name', name: 'Name', type: 'text', defaultValue: 'Private answer must not leak' }] }] }] } }
  const context = {
    authorize: vi.fn().mockResolvedValue(authority), readDocument: vi.fn().mockResolvedValue(document),
    service: { readEmailTemplateDraft: vi.fn().mockResolvedValue(null), writeEmailTemplateDraft: vi.fn() },
    resolveMedia: vi.fn().mockResolvedValue({ images: {}, warnings: [] }), renderEmailPreview: vi.fn()
  } as unknown as TrustedFormContext
  const invoke = vi.fn().mockResolvedValue(JSON.stringify(output))
  const execution = {
    resolveModel: vi.fn().mockResolvedValue({ id: body.modelId, invoke }),
    reserve: vi.fn().mockImplementation(async ({ operationId, fingerprint }) => ({ operationId, fingerprint, kind: 'model', scope, admitted: true, charged: true, state: 'reserved' })),
    settle: vi.fn().mockImplementation(async ({ operationId, fingerprint, outcome }) => ({ operationId, fingerprint, kind: 'model', scope, admitted: false, charged: true, state: outcome }))
  }
  const target = { apiAudience: 'customer' as const, audience: 'team' }
  return { scope, authority, body, output, document, context, execution, invoke, target,
    run: () => generateEmailTemplateProposal(context, target, body, execution) }
}

describe('authenticated email template proposal generation orchestration', () => {
  it('reserves once, passes only design and field schema, settles and returns a reviewable proposal without saving', async () => {
    const s = setup()
    const result = await s.run()
    expect(result).toMatchObject({ modelId: s.body.modelId, operationId: s.body.operationId, summary: s.output.summary, template: s.output.template })
    expect(s.execution.reserve).toHaveBeenCalledTimes(1)
    expect(s.invoke).toHaveBeenCalledTimes(1)
    expect(s.execution.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'succeeded' }))
    expect(s.invoke.mock.invocationCallOrder[0]).toBeGreaterThan(s.execution.reserve.mock.invocationCallOrder[0]!)
    expect(JSON.stringify(s.invoke.mock.calls)).not.toContain('Private answer must not leak')
    expect(JSON.stringify(s.invoke.mock.calls)).not.toContain('native-session')
    expect(s.invoke).toHaveBeenCalledWith(expect.objectContaining({ fields: [{ id: 'name', name: 'Name', type: 'text' }], siteName: 'Example business', formName: 'Contact form' }))
    expect(s.context.service?.writeEmailTemplateDraft).not.toHaveBeenCalled()
  })

  it('offers exact selected-form keys for validated field-bound designs', async () => {
    const s = setup()
    Object.assign(s.output.template, { schemaVersion: 2, subject: 'Hello {{field.contact:enquiry.name}}', fieldBindings: [{ formKey: 'contact:enquiry', fieldId: 'name', type: 'text', fallback: 'there' }] })
    s.invoke.mockResolvedValue(JSON.stringify(s.output))
    expect((await s.run()).template.schemaVersion).toBe(2)
    expect(s.invoke).toHaveBeenCalledWith(expect.objectContaining({ formKey: 'contact:enquiry' }))
  })
  it.each(['unknown', 'hidden', 'unoffered-form'])('rejects %s model field bindings and settles the attempt as failed', async (scenario) => {
    const s = setup()
    let formKey = 'contact:enquiry'
    let fieldId = 'name'
    if (scenario === 'unknown') fieldId = 'missing'
    if (scenario === 'hidden') s.document.studio.pages[0].forms[0].fields[0].type = 'hidden'
    if (scenario === 'unoffered-form') {
      s.document.studio.pages.push({ ...structuredClone(s.document.studio.pages[0]), id: 'other' })
      formKey = 'other:enquiry'
    }
    Object.assign(s.output.template, { schemaVersion: 2, subject: `Hello {{field.${formKey}.${fieldId}}}`, fieldBindings: [{ formKey, fieldId, type: 'text', fallback: 'there' }] })
    s.invoke.mockResolvedValue(JSON.stringify(s.output))
    await expect(s.run()).rejects.toMatchObject({ statusCode: 502 })
    expect(s.execution.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }))
  })
  it('rejects a stale manually bound input before reserving paid usage', async () => {
    const s = setup()
    Object.assign(s.body.template, { schemaVersion: 2, subject: '{{field.contact:enquiry.missing}}', fieldBindings: [{ formKey: 'contact:enquiry', fieldId: 'missing', type: 'text', fallback: '' }] })
    await expect(s.run()).rejects.toMatchObject({ statusCode: 409 })
    expect(s.execution.reserve).not.toHaveBeenCalled()
  })
  it('withholds a proposal when another owned form schema changes during inference', async () => {
    const s = setup()
    s.document.studio.pages.push({ ...structuredClone(s.document.studio.pages[0]), id: 'other' })
    s.invoke.mockImplementation(async () => {
      s.document.studio.pages[1].forms[0].fields[0].type = 'email'
      return JSON.stringify(s.output)
    })
    await expect(s.run()).rejects.toMatchObject({ statusCode: 409 })
  })

  it.each(['viewer', 'foreign-document', 'stale-checkpoint', 'missing-form', 'wrong-override', 'missing-storage', 'stale-template', 'foreign-record', 'media-unavailable', 'model-unavailable', 'model-mismatch'])('rejects %s before charging or invoking', async (scenario) => {
    const s = setup()
    if (scenario === 'viewer') s.authority.canEdit = false
    if (scenario === 'foreign-document') s.document.site.clientId = 'foreign'
    if (scenario === 'stale-checkpoint') s.body.checkpointId = 'stale'
    if (scenario === 'missing-form') s.body.formId = 'missing'
    if (scenario === 'wrong-override') Object.assign(s.target, { definitionId: 'foreign' })
    if (scenario === 'missing-storage') s.context.service = undefined
    if (scenario === 'stale-template') s.body.expectedRevision = 5
    if (scenario === 'foreign-record') vi.mocked(s.context.service!.readEmailTemplateDraft!).mockResolvedValue({ scope: { ...s.scope, siteId: 'foreign' }, audience: 'team', revision: 1, checkpointId: 'checkpoint', actorId: 'other', updatedAt: '2026-10-08T00:00:00Z', template: s.body.template })
    if (scenario === 'media-unavailable') vi.mocked(s.context.resolveMedia).mockResolvedValue({ images: {}, warnings: ['Missing image'] })
    if (scenario === 'model-unavailable') s.execution.resolveModel.mockResolvedValue(null)
    if (scenario === 'model-mismatch') s.execution.resolveModel.mockResolvedValue({ id: 'other', invoke: s.invoke })
    await expect(s.run()).rejects.toThrow()
    expect(s.execution.reserve).not.toHaveBeenCalled()
    expect(s.invoke).not.toHaveBeenCalled()
  })

  it('requires strict request fields and refuses caller-owned authority or real answers', async () => {
    for (const extra of [{ siteId: 'foreign' }, { audience: 'customer' }, { answers: { name: 'Real visitor' } }, { prompt: '' }, { operationId: 'bad' }]) {
      const s = setup()
      Object.assign(s.body, extra)
      await expect(s.run()).rejects.toMatchObject({ statusCode: 400 })
      expect(s.invoke).not.toHaveBeenCalled()
      expect(s.execution.reserve).not.toHaveBeenCalled()
    }
  })

  it('rejects quota exhaustion and non-admitted or foreign reservation receipts without a model call', async () => {
    for (const bad of [{ admitted: false }, { scope: { siteId: 'foreign' } }, { fingerprint: '0'.repeat(64) }, { charged: false }, { state: 'succeeded' }, { kind: 'action-test' }]) {
      const s = setup()
      s.execution.reserve.mockImplementation(async ({ operationId, fingerprint }) => ({ operationId, fingerprint, kind: 'model', scope: s.scope, admitted: true, charged: true, state: 'reserved', ...bad }))
      await expect(s.run()).rejects.toThrow()
      expect(s.invoke).not.toHaveBeenCalled()
    }
    const s = setup()
    s.execution.reserve.mockRejectedValue(Object.assign(new Error('Monthly allowance reached'), { statusCode: 429 }))
    await expect(s.run()).rejects.toMatchObject({ statusCode: 429 })
    expect(s.invoke).not.toHaveBeenCalled()
  })

  it('rechecks authority after reservation before inference', async () => {
    const s = setup()
    s.execution.reserve.mockImplementation(async ({ operationId, fingerprint }) => {
      vi.mocked(s.context.authorize).mockRejectedValue(new Error('Revoked'))
      return { operationId, fingerprint, kind: 'model', scope: s.scope, admitted: true, charged: true, state: 'reserved' }
    })
    await expect(s.run()).rejects.toThrow('Revoked')
    expect(s.invoke).not.toHaveBeenCalled()
  })

  it('sanitizes uncertain reservation failures without inference or settlement', async () => {
    const s = setup()
    s.execution.reserve.mockRejectedValue(new Error('secret accounting response'))
    const error = await s.run().catch(error => error)
    expect(error).toMatchObject({ code: 'EMAIL_AI_UNCERTAIN', statusCode: 503 })
    expect(error.message).not.toContain('secret')
    expect(s.execution.reserve).toHaveBeenCalledTimes(1)
    expect(s.invoke).not.toHaveBeenCalled()
    expect(s.execution.settle).not.toHaveBeenCalled()
  })

  it.each(['checkpoint', 'template', 'authority'])('withholds a generated proposal after %s changes during inference', async (change) => {
    const s = setup()
    s.invoke.mockImplementation(async () => {
      if (change === 'checkpoint') s.document.studio.checkpointId = 'new_checkpoint'
      if (change === 'template') vi.mocked(s.context.service!.readEmailTemplateDraft!).mockResolvedValue({ scope: s.scope, audience: 'team', revision: 1, checkpointId: 'checkpoint', actorId: 'other', updatedAt: '2026-10-08T00:00:00Z', template: s.body.template })
      if (change === 'authority') vi.mocked(s.context.authorize).mockRejectedValue(new Error('Revoked'))
      return JSON.stringify(s.output)
    })
    await expect(s.run()).rejects.toThrow()
    expect(s.invoke).toHaveBeenCalledTimes(1)
    expect(s.context.service?.writeEmailTemplateDraft).not.toHaveBeenCalled()
  })

  it('keeps provider uncertainty reserved and never retries or exposes provider details', async () => {
    const s = setup()
    s.invoke.mockRejectedValue(new Error('secret provider response'))
    await expect(s.run()).rejects.toMatchObject({ code: 'EMAIL_AI_UNCERTAIN', statusCode: 503 })
    expect(s.invoke).toHaveBeenCalledTimes(1)
    expect(s.execution.settle).not.toHaveBeenCalled()
  })

  it('marks known invalid output failed while keeping the allowance charge', async () => {
    const s = setup()
    s.invoke.mockResolvedValue(JSON.stringify({ ...s.output, recipients: ['bad@example.test'] }))
    await expect(s.run()).rejects.toMatchObject({ code: 'EMAIL_AI_OUTPUT_INVALID' })
    expect(s.execution.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }))
    expect(s.invoke).toHaveBeenCalledTimes(1)
  })

  it('does not return success after an uncertain or foreign settlement', async () => {
    const s = setup()
    s.execution.settle.mockRejectedValue(new Error('secret settlement response'))
    await expect(s.run()).rejects.toMatchObject({ code: 'EMAIL_AI_UNCERTAIN' })
    const foreign = setup()
    foreign.execution.settle.mockResolvedValue({ operationId: foreign.body.operationId, fingerprint: '0'.repeat(64), kind: 'model', scope: foreign.scope, admitted: false, charged: true, state: 'succeeded' })
    await expect(foreign.run()).rejects.toMatchObject({ code: 'EMAIL_AI_UNCERTAIN' })
  })

  it.each(['media', 'model', 'settle'])('withholds inference or output when access is revoked during %s', async (stage) => {
    const s = setup()
    const revoke = () => vi.mocked(s.context.authorize).mockRejectedValue(new Error('Revoked'))
    if (stage === 'media') vi.mocked(s.context.resolveMedia).mockImplementation(async () => {
      revoke()
      return { images: {}, warnings: [] }
    })
    if (stage === 'model') s.execution.resolveModel.mockImplementation(async () => {
      revoke()
      return { id: s.body.modelId, invoke: s.invoke }
    })
    if (stage === 'settle') s.execution.settle.mockImplementation(async ({ operationId, fingerprint, outcome }) => {
      revoke()
      return { operationId, fingerprint, kind: 'model', scope: s.scope, admitted: false, charged: true, state: outcome }
    })
    await expect(s.run()).rejects.toThrow('Revoked')
    expect(s.invoke).toHaveBeenCalledTimes(stage === 'settle' ? 1 : 0)
  })

  it('rejects a form schema change during inference even if the checkpoint was not advanced', async () => {
    const s = setup()
    s.invoke.mockImplementation(async () => {
      s.document.studio.pages[0]!.forms[0]!.fields[0]!.name = 'Changed label'
      return JSON.stringify(s.output)
    })
    await expect(s.run()).rejects.toMatchObject({ statusCode: 409 })
    expect(s.context.service?.writeEmailTemplateDraft).not.toHaveBeenCalled()
  })

  it('detaches request input before asynchronous reads', async () => {
    const s = setup()
    const originalSubject = s.body.template.subject
    s.execution.resolveModel.mockImplementation(async () => {
      s.body.template.subject = 'Mutated during lookup'
      s.body.prompt = 'Unexpected prompt'
      return { id: s.body.modelId, invoke: s.invoke }
    })
    await s.run()
    expect(s.invoke).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Shorten the heading', template: expect.objectContaining({ subject: originalSubject }) }))
  })

  it.each(['oversize', 'invented-image'])('charges but rejects %s provider output', async (scenario) => {
    const s = setup()
    if (scenario === 'oversize') s.invoke.mockResolvedValue(' '.repeat(300_001))
    else s.invoke.mockResolvedValue(JSON.stringify({ ...s.output, template: { ...s.output.template, blocks: [{ id: 'image', type: 'image', assetId: '50000000-0000-4000-8000-000000000001', alt: 'Invented asset', width: 300, alignment: 'center' }] } }))
    await expect(s.run()).rejects.toMatchObject({ code: 'EMAIL_AI_OUTPUT_INVALID' })
    expect(s.execution.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }))
  })
})
