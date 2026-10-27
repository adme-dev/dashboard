import { existsSync, mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref, watch } from 'vue'
import { chromium, type Browser } from 'playwright'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import type { BannerProject } from '../../app/types/banner-studio'

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const enabled
  = process.env.RUN_REAL_BROWSER_TESTS === 'true' && existsSync(chrome)
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('watch', watch)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 1000 })
const { useBannerStudio }
  = await import('../../app/composables/useBannerStudio')
const { useBannerLettering }
  = await import('../../app/composables/useBannerLettering')
let browser: Browser

describe.skipIf(!enabled)(
  'Selected lettering real Chromium composition (fixture provider)',
  () => {
    beforeAll(async () => {
      browser = await chromium.launch({
        executablePath: chrome,
        headless: true
      })
      mkdirSync('output/lettering-workflow', { recursive: true })
    })
    afterAll(async () => {
      await browser?.close()
    })
    it('compares preview, applies, saves/reopens and moves/hides only native lettering', async () => {
      const studio = useBannerStudio(),
        revision = '2026-10-26T00:00:00.000Z'
      const project = {
        id: 'lettering-browser',
        updatedAt: revision,
        canvasData: {
          mrec: {
            bgColor: '#ffffff',
            layers: [
              {
                id: 1,
                type: 'text',
                text: 'RELOCATION SALE',
                name: 'Lettering',
                x: 20,
                y: 30,
                w: 260,
                h: 100,
                fontSize: 32,
                fontFamily: 'Arial',
                color: '#123456',
                zIndex: 1,
                opacity: 1
              },
              {
                id: 2,
                type: 'rect',
                name: 'Protected block',
                x: 20,
                y: 150,
                w: 100,
                h: 50,
                fillColor: '#ffff00',
                zIndex: 0,
                opacity: 1
              }
            ]
          }
        }
      } as BannerProject
      studio.loadProject(project)
      studio.selectLayer(1)
      studio.state.isDirty = false
      const original = studio.getCanvasData()
      const api = useBannerLettering(
        vi
          .fn()
          .mockResolvedValue({
            proposalId: 'fixture',
            projectId: project.id,
            sourceRevision: revision,
            formatKey: 'mrec',
            layerId: 1,
            mode: 'native',
            wording: 'GRAND OPENING',
            nativeStyle: { fontFamily: 'Arial', fontSize: 32 },
            evidence: {
              provider: 'fixture',
              model: 'not-live-inference',
              cost: null
            },
            warnings: [],
            verification: 'review-required'
          }) as unknown as typeof $fetch
      )
      api.discard()
      api.mode.value = 'native'
      api.wording.value = 'GRAND OPENING'
      await api.generate()
      const page = await browser.newPage({
        viewport: { width: 300, height: 250 }
      })
      const render = async (name: string, preview = false) => {
        const board = studio.getCanvasData().mrec!
        await page.setContent(
          buildBannerHTML(
            'mrec',
            board.layers.map(l =>
              preview && l.id === 1 ? api.previewLayer.value || l : l
            ),
            { includeAnimations: false, bgColor: board.bgColor }
          )
        )
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({
          path: `output/lettering-workflow/${name}.png`
        })
      }
      await render('before')
      expect(await page.locator('[data-id="1"]').textContent()).toBe(
        'RELOCATION SALE'
      )
      await render('preview', true)
      expect(await page.locator('[data-id="1"]').textContent()).toBe(
        'GRAND OPENING'
      )
      expect(studio.getCanvasData()).toEqual(original)
      api.showOriginal.value = true
      await render('comparison-original', true)
      expect(await page.locator('[data-id="1"]').textContent()).toBe(
        'RELOCATION SALE'
      )
      api.showOriginal.value = false
      api.reviewed.value = true
      expect(api.apply()).toBe(true)
      await render('applied')
      expect(studio.activeLayers.value[1]).toEqual(original.mrec!.layers[1])
      let saved: BannerProject | undefined
      vi.stubGlobal('$fetch', async (_url: string, opts: { body: Partial<BannerProject> }) => {
        saved = { ...project, ...opts.body }
        return { ...saved, updatedAt: revision }
      })
      await studio.saveProject()
      studio.loadProject(saved!)
      await render('reopened')
      expect(studio.activeLayers.value[0]?.letteringRecipe?.wording).toBe(
        'GRAND OPENING'
      )
      expect(await page.locator('[data-id="1"]').textContent()).toBe(
        'GRAND OPENING'
      )
      studio.updateLayer(1, { x: 30 })
      await render('moved')
      expect(
        await page
          .locator('[data-id="1"]')
          .evaluate(e => e.getBoundingClientRect().x)
      ).toBe(30)
      studio.updateLayer(1, { hidden: true })
      await render('hidden')
      expect(await page.locator('[data-id="1"]').isVisible()).toBe(false)
      expect(studio.activeLayers.value[1]).toEqual(original.mrec!.layers[1])
      api.dispose()
      await page.close()
    })
  }
)
