import { describe, expect, it } from 'vitest'
import { composerToDesignDraft } from '../../shared/emailRendering/designComposer'
import { structuredDesign } from '../fixtures/email-design/structured'

describe('campaign design foundation conversion', () => {
  it('converts only with an explicit checked campaign target and retains the template default', () => {
    const source = structuredDesign()
    expect(composerToDesignDraft(source.blocks, source.scope.clientId).kind).toBe('template')
    expect(composerToDesignDraft(source.blocks, source.scope.clientId, 'campaign-draft').kind).toBe('campaign-draft')
  })
  it('refuses module or arbitrary conversion targets at runtime', () => {
    const source = structuredDesign()
    expect(() => composerToDesignDraft(source.blocks, source.scope.clientId, 'module' as 'template')).toThrow()
  })
})
