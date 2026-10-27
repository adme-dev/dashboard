import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref, watch } from 'vue'
import { chromium, type Browser } from 'playwright'
import { PNG } from 'pngjs'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as buildServerHTML } from '../../server/utils/banner/htmlBuilder'
import approvedCopy from '../fixtures/banner/lifestyle-letter-copy.json'
import type { BannerProject } from '../../app/types/banner-studio'

const out = resolve('output/editable-artwork-pilot')
const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const enabled = process.env.RUN_REAL_BROWSER_TESTS === 'true' && existsSync(chrome) && existsSync(`${out}/project.json`)
let browser: Browser
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('watch', watch)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 1000 })
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')
const { useBannerCopyProposal } = await import('../../app/composables/useBannerCopyProposal')

describe.skipIf(!enabled)('Lifestyle letter native browser proof (local persistence, fixture copy response)', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ executablePath: chrome, headless: true })
  })
  afterAll(async () => {
    await browser?.close()
    vi.unstubAllGlobals()
  }, 30000)
  it('saves/reopens every native text block, previews/applies/undoes heading, renders A4 and exposes clean paper', async () => {
    const studio = useBannerStudio()
    const project = JSON.parse(readFileSync(`${out}/project.json`, 'utf8')) as BannerProject
    studio.loadProject(project)
    const key = studio.state.activeKey
    const original = studio.getCanvasData()
    const metadata = original[key]!.reconstruction!
    const page = await browser.newPage({ viewport: { width: 2480, height: 3508 }, deviceScaleFactor: 1 })
    await page.route('https://**/*', route => route.abort())
    const render = async (filename: string) => {
      const board = studio.getCanvasData()[key]!
      const options = { includeAnimations: false, bgColor: board.bgColor }
      const html = buildBannerHTML(key, board.layers, options)
      expect(buildServerHTML(key, board.layers, options)).toBe(html)
      await page.setContent(html)
      await page.evaluate(async () => {
        await document.fonts.ready
        await Promise.all([...document.images].map(i => i.decode()))
      })
      await page.screenshot({ path: `${out}/${filename}.png` })
      writeFileSync(`${out}/${filename}.html`, html)
    }
    // This file-backed test adapter exercises the real saveProject payload, not a hosted DB.
    vi.stubGlobal('$fetch', async (_url: string, options: { body: { name: string, canvasData: BannerProject['canvasData'] } }) => {
      writeFileSync(`${out}/saved-project.json`, JSON.stringify({ ...project, ...options.body }, null, 2))
      return {}
    })
    await studio.saveProject()
    studio.loadProject(JSON.parse(readFileSync(`${out}/saved-project.json`, 'utf8')))
    expect(createHash('sha256').update(JSON.stringify(studio.getCanvasData())).digest('hex')).toBe(createHash('sha256').update(JSON.stringify(original)).digest('hex'))
    await render('reopened')
    for (const [role, expected] of Object.entries(approvedCopy)) {
      const id = metadata.elements.find(e => e.role === role)!.layerId
      expect(studio.activeLayers.value.find(l => l.id === id)?.text).toBe(expected)
      expect(await page.locator(`[data-id="${id}"]`).textContent()).toBe(expected)
    }
    const textIds = studio.activeLayers.value.filter(l => l.type === 'text').map(l => l.id)
    const overflow = await page.evaluate(ids => ids.flatMap((id) => {
      const e = document.querySelector(`[data-id="${id}"]`)!
      return e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2 ? [id] : []
    }), textIds)
    writeFileSync(`${out}/text-fit.json`, JSON.stringify({ overflow }, null, 2))
    expect(overflow).toEqual([])
    const heading = metadata.elements.find(e => e.role === 'headline')!.layerId
    studio.selectLayer(heading)
    const proposal = useBannerCopyProposal(async () => ({ suggestions: [{ text: 'A NEW HOME.\nA WARM WELCOME.', tone: 'inviting', charCount: 27 }], evidence: { provider: 'test-fixture', model: 'not-live-inference' } }))
    await proposal.generate()
    proposal.preview(proposal.suggestions.value[0]!)
    expect(createHash('sha256').update(JSON.stringify(studio.getCanvasData())).digest('hex')).toBe(createHash('sha256').update(JSON.stringify(original)).digest('hex'))
    expect(proposal.apply()).toBe(true)
    await render('heading-applied')
    for (const layer of original[key]!.layers.filter(l => l.id !== heading)) expect(studio.activeLayers.value.find(l => l.id === layer.id)).toEqual(layer)
    studio.undo()
    expect(createHash('sha256').update(JSON.stringify(studio.getCanvasData())).digest('hex')).toBe(createHash('sha256').update(JSON.stringify(original)).digest('hex'))
    await render('heading-undone')
    expect(readFileSync(`${out}/heading-undone.html`, 'utf8')).toBe(readFileSync(`${out}/reopened.html`, 'utf8'))
    const restored = PNG.sync.read(readFileSync(`${out}/heading-undone.png`))
    const initial = PNG.sync.read(readFileSync(`${out}/reopened.png`))
    let maxChannelDifference = 0, differentChannels = 0
    for (let i = 0; i < initial.data.length; i++) {
      const difference = Math.abs(initial.data[i]! - restored.data[i]!)
      maxChannelDifference = Math.max(maxChannelDifference, difference)
      if (difference) differentChannels++
    }
    // Chromium glyph antialiasing varies by one channel level despite identical HTML.
    expect(maxChannelDifference).toBeLessThanOrEqual(1)
    expect(differentChannels / initial.data.length).toBeLessThan(0.0001)
    studio.redo()
    expect(studio.activeLayers.value.find(l => l.id === heading)?.text).toBe('A NEW HOME.\nA WARM WELCOME.')
    await studio.saveProject()
    const changedSaved = JSON.parse(readFileSync(`${out}/saved-project.json`, 'utf8'))
    expect(changedSaved.canvasData[key].layers.find((l: { id: number }) => l.id === heading).text).toBe('A NEW HOME.\nA WARM WELCOME.')
    studio.loadProject(changedSaved)
    expect(studio.activeLayers.value.find(l => l.id === heading)?.text).toBe('A NEW HOME.\nA WARM WELCOME.')
    await render('changed-project-reopened')
    studio.loadProject(project)
    studio.updateLayer(heading, { hidden: true })
    await render('headline-hidden')
    const png = PNG.sync.read(readFileSync(`${out}/headline-hidden.png`))
    let dark = 0, count = 0
    for (let y = 800; y < 1160; y++) for (let x = 145; x < 2360; x++) {
      const i = (y * png.width + x) * 4
      count++
      if (Math.min(png.data[i]!, png.data[i + 1]!, png.data[i + 2]!) < 225) dark++
    }
    expect(dark / count).toBeLessThan(0.001)
    studio.undo()
    expect(createHash('sha256').update(JSON.stringify(studio.getCanvasData())).digest('hex')).toBe(createHash('sha256').update(JSON.stringify(original)).digest('hex'))
    studio.withCanvasUndo(() => {
      for (const layer of studio.activeLayers.value) {
        if (layer.type === 'text' || layer.isLogo) studio.updateLayer(layer.id, { hidden: true })
      }
    })
    await render('all-text-hidden')
    const bare = PNG.sync.read(readFileSync(`${out}/all-text-hidden.png`))
    let voucherResidual = 0
    for (let y = 3060; y < 3250; y++) {
      for (let x = 140; x < 1280; x++) {
        const i = (y * bare.width + x) * 4
        if (Math.abs(bare.data[i]! - 7) > 2 || Math.abs(bare.data[i + 1]! - 30) > 2 || Math.abs(bare.data[i + 2]! - 70) > 2) voucherResidual++
      }
    }
    expect(voucherResidual).toBe(0)
    studio.undo()
    expect(createHash('sha256').update(JSON.stringify(studio.getCanvasData())).digest('hex')).toBe(createHash('sha256').update(JSON.stringify(original)).digest('hex'))
    proposal.dispose()
    await page.close()
    writeFileSync(`${out}/browser-evidence.json`, JSON.stringify({ browser: 'Chromium', canvas: [2480, 3508], nativeTextBlocks: Object.keys(approvedCopy).length, exactCopy: true, saveReload: 'file-backed real saveProject payload', headingResponse: 'deterministic test fixture, not live AI', undoHtmlIdentical: true, undoMaxChannelDifference: maxChannelDifference, undoDifferentChannels: differentChannels, headlineHiddenDarkPixelRatio: dark / count, offerResidualPixels: voucherResidual, providerAcceptance: false }, null, 2))
  }, 60000)
})
