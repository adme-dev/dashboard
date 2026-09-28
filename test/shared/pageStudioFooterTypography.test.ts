import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { collectionCanonical } from '../../shared/pageStudio/collectionApi'
import { verifyBuilderApplicationCheckpoint } from '../../shared/pageStudio/generated/builderGraphVerifier.mjs'

const fixtures = JSON.parse(await readFile(new URL('../../shared/pageStudio/generated/builderGraphFixtures.json', import.meta.url), 'utf8'))
const typography = { headingSize: 22, headingMobileSize: 20, headingWeight: 800, linkSize: 20, linkMobileSize: 18, linkWeight: 600 }

function checkpoint(value: unknown) {
  const fixture = fixtures.find((item: { name: string }) => item.name === 'ordinary page edit keeps current graph')
  const input = structuredClone(fixture.input)
  input.nextCheckpoint.manifest.shell.footer.typography = value
  const digest = createHash('sha256').update(collectionCanonical(input.nextCheckpoint.manifest)).digest('hex')
  input.nextCheckpoint.digest = digest
  input.request.nextCheckpoint.digest = digest
  return input
}

describe('native footer typography compatibility', () => {
  it('accepts a reviewed footer edit without changing the existing CMS graph', async () => {
    const input = checkpoint(typography)
    const proof = await verifyBuilderApplicationCheckpoint(input)
    expect(proof.nextCheckpoint).toEqual(input.request.nextCheckpoint)
    expect(proof.components).toEqual(input.base.application.manifest.components)
    expect(proof.expectedApplication).toEqual(input.request.expectedApplication)
    expect(proof.expectedContent).toEqual(input.request.expectedContent)
  })

  it.each([{ ...typography, linkSize: 100 }, { ...typography, headingWeight: 999 }, { ...typography, css: 'body{display:none}' }])('rejects invalid typography even with a matching checkpoint digest', async (value) => {
    await expect(verifyBuilderApplicationCheckpoint(checkpoint(value))).rejects.toMatchObject({ code: 'GRAPH_CHECKPOINT' })
  })
})
