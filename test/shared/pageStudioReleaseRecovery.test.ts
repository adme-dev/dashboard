import { describe, expect, it } from 'vitest'
import { verifyBuilderReleaseRecovery } from '../../shared/pageStudio/generated/builderGraphVerifier.mjs'
import golden from '../fixtures/pageStudioReleaseRecovery.json'

describe('single-source release recovery facade', () => {
  it.each([golden, golden.typed])('matches immutable golden recovery bytes and form eligibility', async (value) => {
    const proof = await verifyBuilderReleaseRecovery(value.bundle)
    expect(proof.digest).toBe(value.digest)
    expect(proof.forms).toEqual(value.forms)
    expect(proof.bundle).toEqual(value.bundle)
  })
  it('rejects changed private artifact bytes', async () => {
    const bundle = structuredClone(golden.bundle)
    bundle.artifacts[0]!.bytes += ' '
    await expect(verifyBuilderReleaseRecovery(bundle)).rejects.toThrow()
  })
})
