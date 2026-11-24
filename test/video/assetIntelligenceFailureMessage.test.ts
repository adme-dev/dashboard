import { describe, expect, it } from 'vitest'
import { SAFETY_FILTER_BLOCKED_MESSAGE, assetIntelligenceFailureMessage, isSafetyFilterBlock } from '~~/shared/video/assetIntelligenceFailureMessage'

describe('asset intelligence failure messages', () => {
  it('recognises a Workers AI safety filter block', () => {
    expect(isSafetyFilterBlock('3030: Your output has been flagged. Please choose another prompt / input image combination')).toBe(true)
    expect(isSafetyFilterBlock('AiError: 3030: Your input has been flagged.')).toBe(true)
    expect(isSafetyFilterBlock('InferenceUpstreamError: error code 3030')).toBe(true)
    expect(isSafetyFilterBlock('Your output has been flagged')).toBe(true)
  })

  it('does not mistake other failures for a block', () => {
    expect(isSafetyFilterBlock('5006: Error: Additional or unevaluated properties')).toBe(false)
    expect(isSafetyFilterBlock('R2 object video-assets/130301/a.jpg not found')).toBe(false)
    expect(isSafetyFilterBlock('The picture could not be read.')).toBe(false)
    expect(isSafetyFilterBlock('')).toBe(false)
    expect(isSafetyFilterBlock(null)).toBe(false)
  })

  it('replaces a block with a sentence the editor can act on and leaves everything else alone', () => {
    expect(SAFETY_FILTER_BLOCKED_MESSAGE).toBe('The AI safety filter blocked this edit. Try a different area or instruction.')
    expect(assetIntelligenceFailureMessage('3030: Your output has been flagged.')).toBe(SAFETY_FILTER_BLOCKED_MESSAGE)
    expect(assetIntelligenceFailureMessage('Lift needs a painted area.')).toBe('Lift needs a painted area.')
    expect(assetIntelligenceFailureMessage(null)).toBeNull()
    expect(assetIntelligenceFailureMessage(undefined)).toBeNull()
  })
})
