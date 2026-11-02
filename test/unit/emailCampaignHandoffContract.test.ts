import { describe, expect, it } from 'vitest'
import { parseRoundtripRequest } from '../../shared/emailRendering/designRoundtrip'
import { parseDesignerRoundtripRequest } from '../../shared/emailRendering/designDesigner'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'

const id = '10000000-0000-4000-8000-000000000001'
describe('persisted campaign handoff request contracts', () => {
  it('admits explicit campaign and template targets while retaining legacy template requests', () => {
    for (const owner of [{ kind: 'campaign', id }, { kind: 'template', id }]) {
      const request = { command: 'start', operationId: id, owner, clientId: id }
      expect(parseRoundtripRequest(request)).toEqual(request)
      expect(parseDesignerRoundtripRequest(request)).toEqual(request)
      expect(parseRoundtripRequest({ command: 'lookup', owner })).toEqual({ command: 'lookup', owner })
    }
    expect(parseRoundtripRequest({ command: 'lookup', templateId: id })).toEqual({ command: 'lookup', templateId: id })
    expect(() => parseRoundtripRequest({ command: 'lookup', templateId: id, owner: { kind: 'campaign', id } })).toThrow()
    expect(() => parseRoundtripRequest({ command: 'lookup', owner: { kind: 'module', id } })).toThrow()
  })
  it('parses campaign content proposals without admitting module payloads or source replacement', () => {
    const design = validateEmailDesign({ ...structuredDesign(), kind: 'campaign-draft' })
    const request = { command: 'propose', handoffId: id, action: { version: 1, action: 'propose-return', operationId: id, scope: design.scope, draftId: id, baseRevisionId: id, design } }
    expect(parseRoundtripRequest(request)).toEqual(request)
    expect(() => parseRoundtripRequest({ ...request, action: { ...request.action, design: { ...design, kind: 'module' } } })).toThrow()
  })
  it('reuses the explicit saved-proposal recovery action and rejects recipient/status payloads', () => {
    const request = { command: 'save-proposal-as-new-draft', handoffId: id, action: { version: 1, action: 'save-proposal-as-new-draft', operationId: id, scope: { clientId: id }, proposalId: id, expectedProposalRevisionId: id, name: 'Recovered campaign' } }
    expect(parseDesignerRoundtripRequest(request)).toEqual(request)
    expect(() => parseRoundtripRequest({ ...request, action: { ...request.action, status: 'scheduled' } })).toThrow()
  })
})
