import { describe, expect, it } from 'vitest'
import { verifyRenderImage, renderContextHash } from '../../scripts/check-render-image.mjs'
import { readFileSync } from 'node:fs'

const image = `registry.cloudflare.com/a5b299b3ad15c1b5b895dc66f9357b17/xeroflow-render@sha256:${'a'.repeat(64)}`
const receipt = { qualificationStatus: 'qualified-full-sample', image, instanceType: 'standard-3', contextSha256: 'context', sourceCommit: 'b'.repeat(40), checks: ['packaged-http-service', 'real-media-13', 'sigterm-audio-and-chromium-drain', 'sigint-audio-and-chromium-drain', 'full-40s-composite-and-picture-timing'] }
const config = `name = "audio-jobs"\n[[containers]]\nclass_name = "RenderContainer"\nimage = "${image}"\ninstance_type = "standard-3"\n[[durable_objects.bindings]]\nname = "RENDER"`
const verify = (patch = {}) => verifyRenderImage({ config, receipt, contextHash: 'context', ...patch })
describe('qualified render image admission', () => {
  it('keeps the actual production configuration tied to the qualified context', () => {
    expect(() => verifyRenderImage({
      config: readFileSync('workers/audio-jobs/wrangler.toml', 'utf8'),
      receipt: JSON.parse(readFileSync('workers/audio-jobs/render-image.json', 'utf8')),
      contextHash: renderContextHash('workers/audio-jobs/container')
    })).not.toThrow()
  })
  it('admits the qualified image and source context', () => expect(() => verify()).not.toThrow())
  it('rejects context changes until a new image is qualified', () => expect(() => verify({ contextHash: 'changed' })).toThrow(/context changed/))
  it('rejects a different or missing qualified instance type', () => {
    expect(() => verify({ receipt: { ...receipt, instanceType: 'standard-2' } })).toThrow(/instance type/)
    expect(() => verify({ receipt: { ...receipt, instanceType: undefined } })).toThrow(/instance type/)
  })
  it('rejects mutable tags and a different Cloudflare account', () => {
    for (const altered of [image.replace(/@sha256:.*/, ':latest'), image.replace('a5b299b3ad15c1b5b895dc66f9357b17', 'another-account')]) {
      expect(() => verify({ receipt: { ...receipt, image: altered } })).toThrow(/immutable/)
    }
  })
  it('rejects another Worker, container or image', () => {
    for (const altered of [config.replace('audio-jobs', 'other'), config.replace('RenderContainer', 'OtherContainer'), config.replace(image, './container/Dockerfile')]) {
      expect(() => verify({ config: altered })).toThrow()
    }
  })
  it('rejects core-only qualification at the deployment boundary', () => {
    expect(() => verify({ receipt: { ...receipt, qualificationStatus: 'core-qualified-full-sample-pending' } })).toThrow(/full-sample/)
    expect(() => verify({ receipt: { ...receipt, checks: receipt.checks.filter(check => check !== 'full-40s-composite-and-picture-timing') } })).toThrow(/full-sample/)
  })
  it('rejects missing provenance', () => expect(() => verify({ receipt: { ...receipt, checks: [] } })).toThrow(/provenance/))
})
