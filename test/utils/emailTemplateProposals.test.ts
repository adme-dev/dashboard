import { describe, expect, it } from 'vitest'
import { starterEmailTemplate } from '../../shared/pageStudio/emailTemplates'
import { applyEmailTemplateProposal, captureEmailTemplateDraft, decodeEmailTemplateProposalOutput, EmailTemplateProposalSchema, type EmailTemplateProposalDraft } from '../../shared/pageStudio/emailTemplateProposals'

const draft = (): EmailTemplateProposalDraft => ({
  siteId: '30000000-0000-4000-8000-000000000001', apiAudience: 'customer', audience: 'team',
  checkpointId: 'checkpoint_one', expectedRevision: 3, pageId: 'contact', formId: 'enquiry',
  customised: true, template: starterEmailTemplate('team')
})
const output = () => ({ summary: 'Make the heading shorter', warnings: [], template: { ...starterEmailTemplate('team'), subject: 'New enquiry | {{site.name}}' } })
async function setup() {
  const current = draft()
  const snapshot = await captureEmailTemplateDraft(current)
  const proposal = { schemaVersion: 1 as const, id: '40000000-0000-4000-8000-000000000001', baseDigest: snapshot.digest, modelId: 'configured-model', operationId: 'email:model:one', ...output() }
  return { current, snapshot, proposal }
}

describe('email template AI proposal review', () => {
  it('returns a detached draft only after an explicit apply, without changing the current template', async () => {
    const s = await setup()
    const before = structuredClone(s.current)
    expect(EmailTemplateProposalSchema.parse(s.proposal).template.subject).toBe(output().template.subject)
    expect(s.current).toEqual(before)
    const applied = applyEmailTemplateProposal(s.proposal, s.snapshot, s.current)
    expect(applied.subject).toBe(output().template.subject)
    applied.blocks[0]!.id = 'changed-after-apply'
    expect(s.current).toEqual(before)
    expect(s.proposal.template.blocks[0]!.id).toBe('heading')
  })

  it.each([
    ['site', (d: EmailTemplateProposalDraft) => { d.siteId = '30000000-0000-4000-8000-000000000002' }],
    ['native versus invited session', (d: EmailTemplateProposalDraft) => { d.apiAudience = 'portal' }],
    ['email audience', (d: EmailTemplateProposalDraft) => { d.audience = 'customer' }],
    ['form override', (d: EmailTemplateProposalDraft) => { d.definitionId = 'another_form' }],
    ['checkpoint', (d: EmailTemplateProposalDraft) => { d.checkpointId = 'new_checkpoint' }],
    ['saved revision', (d: EmailTemplateProposalDraft) => { d.expectedRevision++ }],
    ['preview page', (d: EmailTemplateProposalDraft) => { d.pageId = 'bookings' }],
    ['preview form', (d: EmailTemplateProposalDraft) => { d.formId = 'booking' }],
    ['inheritance', (d: EmailTemplateProposalDraft) => { d.customised = false }],
    ['manual text', (d: EmailTemplateProposalDraft) => { d.template.subject = 'My unsaved subject' }],
    ['manual style', (d: EmailTemplateProposalDraft) => { d.template.accentColor = '#123456' }]
  ])('preserves edits and withholds a proposal after a change to %s', async (_, change) => {
    const s = await setup()
    change(s.current)
    const before = structuredClone(s.current)
    expect(() => applyEmailTemplateProposal(s.proposal, s.snapshot, s.current)).toThrow(/changed/i)
    expect(s.current).toEqual(before)
  })

  it('captures before asynchronous hashing, and ignores property insertion order', async () => {
    const current = draft()
    const pending = captureEmailTemplateDraft(current)
    current.template.subject = 'Typed while hashing'
    const captured = await pending
    const original = draft()
    const reordered = Object.fromEntries(Object.entries(original).reverse())
    expect(await captureEmailTemplateDraft(reordered)).toEqual(captured)
    expect((await captureEmailTemplateDraft(current)).digest).not.toBe(captured.digest)
  })

  it('matches the JSON transport when optional properties are explicitly undefined', async () => {
    const current = { ...draft(), definitionId: undefined, template: { ...draft().template, identity: undefined } }
    expect(await captureEmailTemplateDraft(current)).toEqual(await captureEmailTemplateDraft(JSON.parse(JSON.stringify(current))))
  })

  it('rejects a proposal returned for a different base', async () => {
    const s = await setup()
    expect(() => applyEmailTemplateProposal({ ...s.proposal, baseDigest: '0'.repeat(64) }, s.snapshot, s.current)).toThrow(/changed/i)
  })

  it('permits rearranging an existing image but rejects invented or foreign media references', async () => {
    const s = await setup()
    const image = { id: 'photo', type: 'image' as const, assetId: '50000000-0000-4000-8000-000000000001', alt: 'Vehicle', width: 520, alignment: 'center' as const }
    s.current.template.blocks.push(image)
    s.snapshot = await captureEmailTemplateDraft(s.current)
    s.proposal.baseDigest = s.snapshot.digest
    s.proposal.template.blocks.push({ ...image, id: 'photo-moved', width: 400 })
    expect(applyEmailTemplateProposal(s.proposal, s.snapshot, s.current).blocks.at(-1)).toMatchObject({ assetId: image.assetId, width: 400 })
    s.proposal.template.blocks.push({ ...image, id: 'foreign', assetId: '50000000-0000-4000-8000-000000000002' })
    expect(() => applyEmailTemplateProposal(s.proposal, s.snapshot, s.current)).toThrow(/image/i)
  })

  it('rejects model-owned authority, delivery fields, unknown variables and executable blocks', () => {
    const valid = output()
    for (const invalid of [
      { ...valid, recipients: ['injected@example.test'] },
      { ...valid, baseDigest: '0'.repeat(64) },
      { ...valid, template: { ...valid.template, sendingEnabled: true } },
      { ...valid, template: { ...valid.template, subject: '{{answers.email}}' } },
      { ...valid, template: { ...valid.template, subject: 'Subject\nBcc: injected@example.test' } },
      { ...valid, template: { ...valid.template, blocks: [{ id: 'html', type: 'html', text: '<script>bad()</script>' }] } },
      { ...valid, template: { ...valid.template, blocks: [{ id: 'button', type: 'button', text: 'Open', url: 'javascript:bad()' }] } }
    ]) expect(() => decodeEmailTemplateProposalOutput(JSON.stringify(invalid))).toThrow()
  })

  it('bounds UTF-8 output and accepts only an exact JSON object, without markdown repair or silent truncation', () => {
    expect(decodeEmailTemplateProposalOutput(JSON.stringify(output()))).toEqual(output())
    for (const raw of ['```json\n' + JSON.stringify(output()) + '\n```', 'null', '[]', 'false', '{', ' '.repeat(300_001), '🙂'.repeat(75_001)]) {
      expect(() => decodeEmailTemplateProposalOutput(raw)).toThrow()
    }
  })

  it('rejects malformed or unbounded proposal metadata and duplicate blocks', async () => {
    const s = await setup()
    for (const extra of [
      { id: 'not-a-uuid' }, { operationId: '' }, { modelId: '' }, { summary: 'a'.repeat(2001) },
      { warnings: Array(6).fill('Warning') }, { charged: true }, { template: { ...s.proposal.template, blocks: [s.proposal.template.blocks[0], s.proposal.template.blocks[0]] } }
    ]) expect(EmailTemplateProposalSchema.safeParse({ ...s.proposal, ...extra }).success).toBe(false)
  })
})
