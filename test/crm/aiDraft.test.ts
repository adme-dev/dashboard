import { describe, it, expect } from 'vitest'
import { buildDraftPrompt, type DraftContext } from '~~/server/utils/crm/aiDraft'

const ctx: DraftContext = {
  contactName: 'Jane Doe',
  companyName: 'Acme Co',
  oppTitle: 'Q3 Retainer',
  stageName: 'Proposal',
  amount: 12000,
  daysSinceLastActivity: 21,
  daysSinceLastComm: 30,
  senderName: 'Paul',
}

describe('buildDraftPrompt', () => {
  it('includes the supplied facts', () => {
    const p = buildDraftPrompt(ctx)
    expect(p).toContain('Jane Doe')
    expect(p).toContain('Acme Co')
    expect(p).toContain('Q3 Retainer')
    expect(p).toContain('Proposal')
    expect(p).toContain('21')
  })

  it('instructs the model not to fabricate and to return JSON', () => {
    const p = buildDraftPrompt(ctx)
    expect(p.toLowerCase()).toContain('do not invent')
    expect(p).toContain('JSON')
  })

  it('degrades gracefully with no context', () => {
    const p = buildDraftPrompt({
      contactName: null, companyName: null, oppTitle: null, stageName: null,
      amount: null, daysSinceLastActivity: null, daysSinceLastComm: null, senderName: null,
    })
    expect(p).toContain('minimal context')
    expect(p).toContain('JSON')
  })
})
