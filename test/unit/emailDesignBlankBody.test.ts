import { describe, expect, it } from 'vitest'
import { createEmptyDocument } from '../../app/types/edm'
import { composerToDesignDraft, isExactBlankBody } from '../../shared/emailRendering/designComposer'
import { nonBlankBodies } from '../fixtures/email-design/blank'

describe('raw exact persisted blank predicate', () => {
  it('matches composer defaults without adding editable fields or assets', () => {
    expect(isExactBlankBody(createEmptyDocument())).toBe(true)
    const design = composerToDesignDraft(createEmptyDocument(), null)
    expect(design.policy.editableFields).toEqual([])
    expect(design.assets).toEqual([])
    expect(design.source.nativeArtifact).toBeNull()
  })
  it('ignores object key order', () => {
    expect(isExactBlankBody({ root: { data: { childrenIds: [], props: { fontFamily: 'MODERN_SANS', textColor: '#262626', canvasColor: '#FFFFFF', backdropColor: '#F5F5F5' } }, type: 'EmailLayout' } })).toBe(true)
  })
  it.each(nonBlankBodies())('refuses %s before conversion', (_name, body) => {
    expect(isExactBlankBody(body)).toBe(false)
  })
})
