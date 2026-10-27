import { describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'
import type { BannerProject, Layer } from '../../app/types/banner-studio'
import { exportLinuxProject, editLinuxWording, createLinuxTextMeasurer } from '../../workers/banner-engine/native/photocraft'
import { FONT_FACE, FONT_PIN, fontRuntimeRoot } from '../../workers/banner-engine/fonts/runtime.mjs'
import { validateBridgeApply } from '../../shared/bannerDocumentBridge'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 1000 })
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')
const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8'))
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')

describe('real Linux native lettering round trip', () => {
  it.skipIf(!process.env.BANNER_LINUX_NATIVE_PROOF_ROOT)(
    'returns selected native wording through one undo, redo, save/reopen and exact-font browser export',
    async () => {
      const root = resolve(process.env.BANNER_LINUX_NATIVE_PROOF_ROOT!)
      const json = (name: string, value: unknown) => writeFile(join(root, name), JSON.stringify(value, null, 2), { flag: 'wx' })
      const implementationPaths = [
        'workers/banner-engine/native/photocraft.ts', 'workers/banner-engine/fonts/runtime.mjs',
        'workers/banner-engine/runtime/render-preview.mjs', 'shared/bannerDocumentBridge.ts',
        'scripts/banner-studio/photocraft-read-archive.py', 'workers/banner-engine/native/inspect_archive.py',
        'app/composables/useBannerStudio.ts', 'app/utils/banner-constants.ts',
        'app/utils/banner-html-builder.ts', 'test/banner/linuxNativeRoundtrip.test.ts'
      ]
      const sourceHashes = Object.fromEntries(await Promise.all(implementationPaths.map(async path => [path, sha(await readFile(path))])))
      const manifestPath = join(fontRuntimeRoot, 'runtime.json')
      const manifestBytes = await readFile(manifestPath)
      const manifest = JSON.parse(manifestBytes.toString())
      const proofBytes = await readFile(join(fontRuntimeRoot, 'photocraft-capability-proof.json'))
      const capability = JSON.parse(proofBytes.toString())
      const acceptanceBytes = await readFile(capability.acceptancePath)
      expect(sha(proofBytes)).toBe(manifest.engines.photocraft.capabilityProofSha256)
      expect(sha(acceptanceBytes)).toBe(capability.acceptanceSha256)
      await writeFile(join(root, 'runtime.snapshot.json'), manifestBytes, { flag: 'wx' })
      await writeFile(join(root, 'capability.snapshot.json'), proofBytes, { flag: 'wx' })
      await writeFile(join(root, 'acceptance.snapshot.json'), acceptanceBytes, { flag: 'wx' })
      await json('source-hashes.json', sourceHashes)
      const original: BannerProject = await readJson('output/editable-artwork-pilot/project.json')
      const key = 'custom_2480x3508'
      expect(original.canvasData[key]!.layers).toHaveLength(124)
      const source = structuredClone(original)
      const heading: Layer = {
        id: 125, type: 'text', name: 'Linux supported heading proof',
        text: 'COME CELEBRATE OUR NEW HOME',
        fontFamily: FONT_FACE.family, fontWeight: FONT_FACE.weight,
        fontSize: 100, lineHeight: 1.2, color: '#071e46',
        x: 141, y: 650, w: 2233, h: 140, zIndex: 200, opacity: 1,
        animIn: 'none', animInDur: 0, startTime: 0, endTime: 5, animOut: 'none', outDur: 0
      }
      const qrSource = await readJson('output/editable-artwork-v2/managed-qr/saved-project.json')
      const qr = structuredClone((Object.values(qrSource.canvasData)[0] as { layers: Layer[] }).layers.find(layer => layer.platformQr)!)
      expect(qr?.platformQr).toBeDefined()
      qr.id = 9000
      source.canvasData[key]!.layers.push(heading, qr)
      const studio = useBannerStudio()
      studio.loadProject(source)
      const snapshot = () => JSON.parse(JSON.stringify({ ...studio.state.project, canvasData: studio.getCanvasData() })) as BannerProject
      const before = snapshot()
      // Loading a legacy project adds the editor's existing animation defaults.
      // Every supplied field remains exact; the bridge then preserves that
      // canonical editor snapshot byte-for-byte outside the selected wording.
      const loadDefaults = original.canvasData[key]!.layers.map((layer, index) => {
        const loaded = before.canvasData[key]!.layers[index]!
        expect(loaded).toMatchObject(layer)
        const added = Object.fromEntries(Object.entries(loaded).filter(([field]) => !(field in layer)))
        expect(Object.keys(added).every(field => ['animOut', 'animOutEase', 'delay', 'dur'].includes(field))).toBe(true)
        return { layerId: layer.id, added }
      })
      await json('legacy-load-defaults.json', loadDefaults)
      let saved = before
      vi.stubGlobal('$fetch', vi.fn(async (_url, options) => {
        expect(options.body.expectedRevision).toBe(saved.updatedAt)
        saved = { ...saved, canvasData: options.body.canvasData, updatedAt: new Date(Date.parse(saved.updatedAt) + 1000).toISOString() }
        return saved
      }))
      await json('source-project.json', before)
      const exportRoot = join(root, 'export'), editRoot = join(root, 'edit'), applyRoot = join(root, 'apply')
      for (const path of [exportRoot, editRoot, applyRoot]) await mkdir(path)
      const exported = await exportLinuxProject({ project: before, key, dimensions: { width: 2480, height: 3508 }, revision: 1, root: exportRoot })
      expect(exported.mappings.map(mapping => mapping.bannerId)).toEqual([125])
      const result = await editLinuxWording({
        sidecar: exported.sidecar, expectedSidecarHash: exported.sidecarHash,
        currentProject: before, currentRevision: 1, nativePath: exported.nativePath,
        root: editRoot, layerId: 125, text: 'COME CELEBRATE WITH US'
      })
      const validated = await validateBridgeApply({
        sidecar: exported.sidecar, expectedSidecarHash: exported.sidecarHash,
        currentProject: snapshot(), currentRevision: 1, returned: result.returned,
        measureText: createLinuxTextMeasurer({ root: applyRoot, expectedBinding: exported.sidecar.linuxBinding })
      }, result.plan)
      expect(studio.getCanvasData()).toEqual(before.canvasData)
      studio.applyAssistantCanvas(validated.canvasData)
      const after = studio.getCanvasData()
      expect(after[key]!.layers.filter(layer => layer.id !== 125)).toEqual(before.canvasData[key]!.layers.filter(layer => layer.id !== 125))
      expect(after[key]!.layers.find(layer => layer.id === 125)).toEqual({ ...before.canvasData[key]!.layers.find(layer => layer.id === 125), text: 'COME CELEBRATE WITH US' })
      studio.undo()
      expect(studio.getCanvasData()).toEqual(before.canvasData)
      expect(studio.canUndo.value).toBe(false)
      studio.redo()
      expect(studio.getCanvasData()).toEqual(after)
      await studio.saveProject()
      studio.loadProject(structuredClone(saved))
      expect(studio.getCanvasData()).toEqual(after)
      await json('saved-reopened-project.json', snapshot())

      // Existing production HTML exporter and exact pinned bytes, with every
      // browser request intercepted. This proves export rendering, not Nuxt UI.
      const fontBytes = await readFile(join(fontRuntimeRoot, 'downloads', FONT_PIN.file))
      expect(sha(fontBytes)).toBe(FONT_PIN.sha256)
      const selected = after[key]!.layers.find(layer => layer.id === 125)!
      const html = buildBannerHTML(key, [selected], {
        includeAnimations: false, bgColor: '#ffffff',
        customFonts: [{ family: FONT_FACE.family, weight: FONT_FACE.weight, format: 'truetype', url: 'http://banner-proof.local/pinned-font.ttf' }]
      })
      await writeFile(join(root, 'selected-heading.html'), html, { flag: 'wx' })
      const installedChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      const browser = await chromium.launch({ headless: true, ...(existsSync(installedChrome) ? { executablePath: installedChrome } : {}) })
      try {
        const page = await browser.newPage({ viewport: { width: 2480, height: 1000 }, deviceScaleFactor: 1 })
        const errors: string[] = [], unexpectedRequests: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        await page.route('**/*', (route) => {
          if (route.request().url() === 'http://banner-proof.local/pinned-font.ttf') return route.fulfill({ body: fontBytes, contentType: 'font/ttf', headers: { 'access-control-allow-origin': '*' } })
          unexpectedRequests.push(route.request().url())
          return route.abort()
        })
        await page.setContent(html)
        await page.evaluate(async () => {
          await document.fonts.ready
        })
        const metrics = await page.locator('[data-id="125"]').evaluate((element) => {
          const style = getComputedStyle(element), range = document.createRange()
          range.selectNodeContents(element)
          const box = element.getBoundingClientRect(), text = range.getBoundingClientRect()
          return { fontFamily: style.fontFamily, fontWeight: style.fontWeight, text: element.textContent, box: { width: box.width, height: box.height }, textWidth: text.width, textHeight: text.height, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight, fontLoaded: document.fonts.check('700 100px "Source Sans 3"') }
        })
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('DOM.enable')
        await cdp.send('CSS.enable')
        const dom = await cdp.send('DOM.getDocument')
        const node = await cdp.send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: '[data-id="125"]' })
        const usedFonts = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: node.nodeId })
        expect(metrics.text).toBe(selected.text)
        expect(metrics.fontLoaded).toBe(true)
        expect(metrics.fontWeight).toBe('700')
        expect(metrics.textWidth).toBeLessThanOrEqual(selected.w)
        expect(metrics.textHeight).toBeLessThanOrEqual(selected.h)
        expect(metrics.scrollWidth).toBeLessThanOrEqual(selected.w)
        expect(metrics.scrollHeight).toBeLessThanOrEqual(selected.h)
        expect(usedFonts.fonts).toHaveLength(1)
        expect(usedFonts.fonts[0]!.isCustomFont).toBe(true)
        expect(usedFonts.fonts[0]!.postScriptName).toBe(FONT_FACE.postscriptName)
        expect(errors).toEqual([])
        expect(unexpectedRequests).toEqual([])
        await page.locator('[data-id="125"]').screenshot({ path: join(root, 'selected-heading.png') })
        await json('browser-evidence.json', { metrics, usedFonts, fontSha256: sha(fontBytes), errors, unexpectedRequests, surface: 'Existing Banner HTML exporter; selected heading only' })
      } finally { await browser.close() }
      for (const [path, hash] of Object.entries(sourceHashes)) expect(sha(await readFile(path)), `Source changed during proof: ${path}`).toBe(hash)
      expect(sha(await readFile(manifestPath))).toBe(sha(manifestBytes))
      await json('evidence.json', {
        status: 'passed', sourceHash: exported.sidecar.sourceHash, sidecarHash: exported.sidecarHash,
        linuxBinding: exported.sidecar.linuxBinding,
        originalSuppliedFieldsPreserved: 124, unchangedCanonicalOriginalLayers: 124, managedQrPreserved: true, selectedLayerId: 125,
        nativeText: true, oneUndo: true, redo: true, savedReopened: true,
        browser: 'Exact pinned font rendered by existing HTML exporter',
        provenance: 'Runtime, capability, acceptance and source hashes retained beside sidecar; not added to Banner project metadata.',
        limitation: 'Local Linux helpers and actual Banner store; API persistence is a fixture. No hosted job, bridge UI or full artwork visual acceptance.'
      })
    }, 240_000
  )
})
