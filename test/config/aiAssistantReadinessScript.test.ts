import { describe, expect, it } from 'vitest'
import { parseAiAssistantReadinessArgs } from '../../scripts/ai-assistant-readiness'

describe('AI assistant readiness CLI arguments', () => {
  it('accepts only pilot or enforced gates and an optional JSON output flag', () => {
    expect(parseAiAssistantReadinessArgs(['--gate', 'pilot', '--json'])).toEqual({ gate: 'pilot', json: true })
    expect(parseAiAssistantReadinessArgs(['--gate', 'enforced'])).toEqual({ gate: 'enforced', json: false })
    expect(() => parseAiAssistantReadinessArgs(['--gate', 'active'])).toThrow('Usage:')
  })
})
