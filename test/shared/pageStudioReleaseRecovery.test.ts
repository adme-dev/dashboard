import { describe, expect, it } from 'vitest'
import { verifyBuilderReleaseRecovery, verifyBuilderPublishedFormInput } from '../../shared/pageStudio/generated/builderGraphVerifier.mjs'
import golden from '../fixtures/pageStudioReleaseRecovery.json'

describe('single-source release recovery facade', () => {
  it('validates public form inputs against the same sealed finite action and digests', async () => {
    const bundle = golden.typed.bundle
    const form = JSON.parse(bundle.checkpoint.bytes).pages[0].forms[0]
    const artifact = bundle.artifacts.find(item => item.pin.kind === 'action')!
    const result = await verifyBuilderPublishedFormInput({ scope: bundle.contentScope, actionPin: artifact.pin, artifactBytes: artifact.bytes, form, fields: { title: 'New enquiry' } })
    expect(result.input).toEqual({ title: 'New enquiry' })
    expect(result.formDigest).toBe(golden.typed.forms[0]!.formDigest)
    expect(result.bindingDigest).toBe(golden.typed.forms[0]!.bindingDigest)
    expect(result.collections).toEqual([])
    await expect(verifyBuilderPublishedFormInput({ scope: bundle.contentScope, actionPin: artifact.pin, artifactBytes: artifact.bytes, form, fields: { title: 'New enquiry', actorId: 'publisher' } })).rejects.toThrow()
  })
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
