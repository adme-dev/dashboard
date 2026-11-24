// Real-browser layout check for the Prepare workspace.
//
// The workspace lays out with container queries, which happy-dom does not evaluate. This
// renders the component, compiles the real Tailwind CSS for the classes it uses, and
// measures it in Chromium at the pane sizes the Video Studio gives it. The pane is short
// because the timeline stays docked under it: 1014 x 335 on a 1280 x 800 screen.
//
// It guards the regression where the picture stage collapsed at 1280 and 1440: its
// three-column classes were measured against the picture column, not the workspace.
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { compile } from '@tailwindcss/node'
import VideoStudioPrepareWorkspace from '~~/app/components/media/VideoStudioPrepareWorkspace.vue'

const stubs = {
  UIcon: { template: '<i />' },
  UBadge: { props: ['label'], template: '<span>{{ label }}</span>' },
  UButton: { props: ['label'], template: '<button style="height:32px;padding:0 10px;white-space:nowrap"><slot />{{ label }}</button>' },
  UFormField: { props: ['label'], template: '<label style="display:flex;gap:8px;align-items:center"><span style="white-space:nowrap">{{ label }}</span><slot /></label>' },
  USelectMenu: { template: '<select style="height:32px;width:100%" />' },
  UTextarea: { template: '<textarea rows="1" style="height:32px;width:100%;display:block" />' },
  USlider: { template: '<input type="range" style="width:96px">' },
  USkeleton: { template: '<div />' },
  VideoStudioAssetActivityPanel: { template: '<div style="height:120px" />' }
}

const tools = ['Erase and heal', 'Lift', 'Remove background', 'Separate layers', 'Mask only'].map((label, index) => ({
  label, value: index === 0 ? 'erase-fill' : `tool-${index}`, description: 'What this tool does to the picture.'
}))

const props = {
  assetOptions: [{ label: 'Showroom still', value: 'item-1' }],
  selectedItemId: 'item-1',
  selectedItemAssetId: 'asset-1',
  toolOptions: tools,
  selectedAction: 'erase-fill',
  toolPrompt: '',
  brushSize: 24,
  maskToolEnabled: true,
  previewImageUrl: null,
  previewVideoUrl: null,
  frameWidth: 1280,
  frameHeight: 720,
  hasMaskStroke: true,
  canUndoMask: true,
  selectedItemJobs: [],
  selectedDerivatives: [],
  recentJobs: []
}

// Pane sizes measured in the real editor at each screen size.
const PANES = [
  { screen: '1024 x 768', width: 758, height: 271, columns: 1 },
  { screen: '1280 x 800', width: 1014, height: 335, columns: 3 },
  { screen: '1440 x 900', width: 1174, height: 435, columns: 3 },
  { screen: '1920 x 1080', width: 1654, height: 615, columns: 3 }
]

describe('VideoStudioPrepareWorkspace layout in a real browser', () => {
  it('keeps the picture stage usable at every desktop pane size', async () => {
    const app = createSSRApp({ render: () => h(VideoStudioPrepareWorkspace, props) })
    Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
    const html = await renderToString(app)
    const classes = [...new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap(match => match[1]!.split(/\s+/)).filter(Boolean))]
    const compiler = await compile('@import "tailwindcss";', { base: process.cwd(), onDependency: () => {} })
    const css = compiler.build(classes)
    // The compiled CSS really contains the named container query: otherwise this test proves nothing.
    expect(css).toContain('@container prepare (width >= 56rem)')

    const { chromium } = await import('playwright')
    let browser: import('playwright').Browser | undefined
    try {
      try {
        browser = await chromium.launch({ headless: true })
      } catch (error) {
        if (!String(error).includes('Executable doesn\'t exist')) throw error
        browser = await chromium.launch({ channel: 'chrome', headless: true })
      }
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })

      for (const pane of PANES) {
        // The pane as the workbench renders it: fixed size, scrolls vertically.
        await page.setContent(`<style>${css}</style>
          <div data-pane style="width:${pane.width}px;height:${pane.height}px;overflow-y:auto">${html}</div>`)
        const measured = await page.evaluate(() => {
          const box = (selector: string) => {
            const element = document.querySelector<HTMLElement>(selector)!
            const rect = element.getBoundingClientRect()
            return { width: Math.round(rect.width), height: Math.round(rect.height), top: Math.round(rect.top), bottom: Math.round(rect.bottom) }
          }
          const paneElement = document.querySelector<HTMLElement>('[data-pane]')!
          const stageElement = document.querySelector<HTMLElement>('[data-prepare-stage]')!
          const column = stageElement.parentElement!
          const grid = document.querySelector<HTMLElement>('section[aria-label="Prepare asset"] > div')!
          return {
            columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
            stage: box('[data-prepare-stage]'),
            toolbar: box('[data-prepare-toolbar]'),
            stageGrows: getComputedStyle(stageElement).flexGrow,
            columnOverflows: column.scrollHeight > column.clientHeight + 1,
            paneScrolls: paneElement.scrollHeight > paneElement.clientHeight + 1,
            pageOverflowsSideways: paneElement.scrollWidth > paneElement.clientWidth + 1
          }
        })
        const where = `${pane.screen} screen (${pane.width} x ${pane.height} pane)`

        expect(measured.columns, where).toBe(pane.columns)
        expect(measured.pageOverflowsSideways, where).toBe(false)
        // The picture area is never squeezed away. It was 0-20px tall at 1024, 1280 and 1440.
        expect(measured.stage.height, where).toBeGreaterThanOrEqual(160)

        if (pane.columns === 3) {
          // Three columns: the stage takes the height the toolbar and instruction leave...
          expect(measured.stageGrows, where).toBe('1')
          expect(measured.stage.height, where).toBeGreaterThanOrEqual(Math.round(pane.height * 0.55))
          // ...and toolbar, picture and instruction all fit without scrolling the column.
          expect(measured.columnOverflows, where).toBe(false)
          expect(measured.paneScrolls, where).toBe(false)
          expect(measured.toolbar.bottom, where).toBeLessThanOrEqual(measured.stage.top)
          expect(measured.stage.bottom, where).toBeLessThanOrEqual(pane.height)
        } else {
          // Stacked: nothing is clamped to the pane height, so the pane scrolls to the picture.
          expect(measured.paneScrolls, where).toBe(true)
        }
      }
    } finally {
      await browser?.close()
    }
    // The budget is for a cold Chromium start on a loaded CI runner, not for the page.
  }, 90_000)
})
