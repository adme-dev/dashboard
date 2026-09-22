import { describe, expect, it } from 'vitest'
import fixture from '../../fixtures/pageStudio/builder-action-invocation-v1.json'
import { BuilderActionResultEnvelopeSchema, builderActionResultKey } from '~~/shared/pageStudio/actionInvocation'

describe('native and Studio action invocation wire compatibility', () => {
  it('derives the same deterministic result key', async () => {
    expect(await builderActionResultKey(fixture.identity)).toBe(fixture.resultKey)
  })
  it.each(fixture.cases)('$name', (sample) => {
    expect(BuilderActionResultEnvelopeSchema.safeParse(sample.envelope).success).toBe(sample.valid)
  })
})
