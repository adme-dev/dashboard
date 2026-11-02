import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import type { Page } from 'playwright'

/** Prepared 08a acceptance driver, NOT executed by the implementation worker.
 * Caller supplies an isolated full-builder page, synthetic Worker/PG/R2 fixture,
 * intercepted matching native package and read-only canonical/owner readback.
 * All edits/selections below use visible controls; there is no Session shortcut.
 * Keep unknown network requests/page errors fatal in the caller's fixture. */
export async function exerciseNativeLibraryAcceptance(page: Page, options: {
  wasmSha256: string
  sectionAt: { x: number, y: number }
  imageAt: { x: number, y: number }
  moduleName: string
  imageName: string
  readDraft(): Promise<{ documentId: string, templateId: string, revisionId: string, blocks: Record<string, unknown>, moduleInstances: Array<{ instanceId: string, revisionId: string }>, assets: Array<{ id: string }>, locks: unknown }>
}) {
  assert(/^[a-f0-9]{64}$/.test(options.wasmSha256))
  // Install BEFORE opening the new native iframe; never accept caller metadata
  // alone as proof of the bytes actually served to this browser.
  let servedWasm: string | null = null
  const responses: Promise<void>[] = []
  const onResponse = (response: import('playwright').Response) => {
    if (new URL(response.url()).pathname.endsWith('.wasm')) responses.push(response.body().then((bytes) => {
      servedWasm = createHash('sha256').update(bytes).digest('hex')
      assert.equal(servedWasm, options.wasmSha256)
    }))
  }
  page.on('response', onResponse)
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const select = async (point: { x: number, y: number }) => {
    await page.getByTitle('FigFlow email design', { exact: true }).contentFrame().locator('canvas').click({ position: point })
  }
  const library = async (name: string) => {
    await button(name).click()
    await page.getByTitle('Captured email preview', { exact: true }).waitFor()
    await button('Use saved design in library').click()
    await button('Return to design').waitFor()
  }
  try {
    const before = await options.readDraft()
    await button('Edit in FigFlow').click()
    await select(options.sectionAt)
    await button('Library').click()
    await page.getByTitle('Captured email preview', { exact: true }).waitFor()
    await button('Continue editing').click()
    assert.deepEqual(await options.readDraft(), before, 'Picker cancellation changed the canonical draft')

    await library('Save selected section')
    await page.getByLabel('Library name', { exact: true }).fill(options.moduleName)
    await button('Publish module').click()
    await button('Library').waitFor()
    assert.deepEqual(await options.readDraft(), before, 'Module publication changed its source draft')

    for (let i = 0; i < 2; i++) {
      await select(options.sectionAt)
      await library('Library')
      await page.getByRole('combobox').click()
      await page.getByRole('option', { name: options.moduleName, exact: true }).click()
      await button('Insert selected version').click()
      await button('Library').waitFor()
    }
    const inserted = await options.readDraft()
    assert.equal(inserted.documentId, before.documentId)
    assert.equal(inserted.templateId, before.templateId)
    assert.equal(inserted.moduleInstances.length, before.moduleInstances.length + 2)
    assert.equal(new Set(inserted.moduleInstances.map(i => i.instanceId)).size, inserted.moduleInstances.length)

    await select(options.imageAt)
    await library('Images')
    await button('Choose or upload an image').click()
    await page.getByText(options.imageName, { exact: true }).click()
    await button('Replace selected image').click()
    await button('Library').waitFor()
    const replaced = await options.readDraft()
    assert.equal(replaced.documentId, before.documentId)
    assert.deepEqual(replaced.locks, before.locks)
    assert.deepEqual(replaced.moduleInstances, inserted.moduleInstances)
    for (const asset of before.assets) assert(replaced.assets.some(candidate => candidate.id === asset.id), 'Old asset reference lost')
    assert.notEqual(replaced.revisionId, inserted.revisionId)
    await Promise.all(responses)
    assert.equal(servedWasm, options.wasmSha256, 'No matching actual WASM response observed')
    return { before, inserted, replaced, servedWasm }
  } finally {
    page.off('response', onResponse)
  }
}
