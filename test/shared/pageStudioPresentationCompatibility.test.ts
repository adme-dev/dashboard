import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { collectionCanonical } from '../../shared/pageStudio/collectionApi'
import * as dashboard from '../../shared/pageStudio/generated/builderGraphVerifier.mjs'
import * as management from '../../workers/page-studio-management/src/generated/builderGraphVerifier.mjs'

const fixtures = JSON.parse(await readFile(new URL('../../shared/pageStudio/generated/builderGraphFixtures.json', import.meta.url), 'utf8'))
const baseline = fixtures.find((item: { name: string }) => item.name === 'ordinary page edit keeps current graph').input
const presentation = { 'color.background': '#ffffff', 'color.text': '#05141f' }

function checkpoint(change: (manifest: typeof baseline.nextCheckpoint.manifest) => void) {
  const input = structuredClone(baseline)
  change(input.nextCheckpoint.manifest)
  const digest = createHash('sha256').update(collectionCanonical(input.nextCheckpoint.manifest)).digest('hex')
  input.nextCheckpoint.digest = digest
  input.request.nextCheckpoint.digest = digest
  return input
}

describe.each([['Dashboard', dashboard], ['Management', management]] as const)('%s actual generated checkpoint compatibility', (_name, verifier) => {
  it('accepts page presentation and explicit footer together without changing the CMS graph or authority pins', async () => {
    const input = checkpoint((manifest) => {
      manifest.pages[0].presentation = presentation
      manifest.shell.footer.contentPolicy = 'explicit'
    })
    const original = structuredClone(input)
    const result = await verifier.verifyBuilderApplicationCheckpoint(input)
    expect(result.nextCheckpoint).toEqual(input.request.nextCheckpoint)
    expect(result.expectedApplication).toEqual(input.request.expectedApplication)
    expect(result.expectedContent).toEqual(input.request.expectedContent)
    expect(result.components).toEqual(input.base.application.manifest.components)
    expect(result.actions).toEqual(input.base.application.manifest.actions)
    expect(input).toEqual(original)
  })

  it.each([
    ['presentation', (manifest: typeof baseline.nextCheckpoint.manifest) => { manifest.pages[0].presentation = presentation }],
    ['explicit footer', (manifest: typeof baseline.nextCheckpoint.manifest) => { manifest.shell.footer.contentPolicy = 'explicit' }]
  ] as const)('accepts a standalone %s change', async (_name, change) => {
    const input = checkpoint(change)
    expect((await verifier.verifyBuilderApplicationCheckpoint(input)).nextCheckpoint).toEqual(input.request.nextCheckpoint)
  })

  it.each([
    ['unsafe colour', (manifest: typeof baseline.nextCheckpoint.manifest) => { manifest.pages[0].presentation = { 'color.background': 'url(https://invalid.example)' } }],
    ['unknown presentation key', (manifest: typeof baseline.nextCheckpoint.manifest) => { manifest.pages[0].presentation = { ...presentation, css: 'body{display:none}' } }],
    ['unknown footer policy', (manifest: typeof baseline.nextCheckpoint.manifest) => { manifest.shell.footer.contentPolicy = 'unknown' }],
    ['unknown footer field', (manifest: typeof baseline.nextCheckpoint.manifest) => { manifest.shell.footer.unsafeHtml = '<script>invalid</script>' }]
  ] as const)('rejects %s even with a matching digest', async (_name, change) => {
    await expect(verifier.verifyBuilderApplicationCheckpoint(checkpoint(change))).rejects.toMatchObject({ code: 'GRAPH_CHECKPOINT' })
  })

  it.each([
    ['columns', { columns: '2', legacyCustom: true }],
    ['spacer', { size: 'large', legacyCustom: true }],
    ['hero', { layout: 'fullbleed', backgroundSrc: '/assets/owned-hero.webp', height: 'viewport', overlay: 'subtle' }]
  ])('retains generic saved %s props; typed component auditing remains advisory', async (type, props) => {
    const input = checkpoint((manifest) => {
      manifest.pages[0].components = [{ id: 'compatibility_section', type, props, children: [] }]
    })
    const original = structuredClone(input.nextCheckpoint)
    expect((await verifier.verifyBuilderApplicationCheckpoint(input)).nextCheckpoint).toEqual(input.request.nextCheckpoint)
    expect(input.nextCheckpoint).toEqual(original)
  })

  it('still rejects mismatched checkpoint digests and scope', async () => {
    const input = checkpoint((manifest) => {
      manifest.pages[0].presentation = presentation
    })
    input.nextCheckpoint.digest = '0'.repeat(64)
    await expect(verifier.verifyBuilderApplicationCheckpoint(input)).rejects.toThrow()
    const foreign = checkpoint((manifest) => {
      manifest.pages[0].presentation = presentation
    })
    foreign.request.scope.siteId = 'another_site'
    await expect(verifier.verifyBuilderApplicationCheckpoint(foreign)).rejects.toThrow()
  })
})

it('keeps the Dashboard and Management generated exports identical', () => {
  expect(Object.keys(management).sort()).toEqual(Object.keys(dashboard).sort())
})
