import { expect, it } from 'vitest'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { parseTheBriefPackage } from '../../app/utils/thebrief-import'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import { source } from './fixture'
it('retains never-visible source content hidden without extending the source loop', async () => {
  const c = await convertTheBriefHtml(source.replace('{id:1,from:200}', '{id:1,from:5000}'))
  const layer = c.canvasData.custom_300x250.layers.find(l => l.type === 'text')
  expect(layer).toMatchObject({ hidden: true, text: 'Hello world', startTime: 0, endTime: 4, sourceInactiveTiming: { start: 5, loopEnd: 4 } })
  expect(c.sourceElements[0]).toMatchObject({ start: 5, end: 4 })
  const pkg = { kind: 'xeroflow-thebrief-import', version: 1, name: 'Inactive source', source: { designHash: 'inactive', sha256: 'a'.repeat(64), folder: '', duration: 4, loopCount: 0 }, canvasData: c.canvasData, warnings: c.warnings, assets: [], fonts: [] }
  expect(parseTheBriefPackage(pkg).canvasData.custom_300x250.layers).toHaveLength(2)
  const html = buildBannerHTML('mrec', [layer], { playback: { duration: 4, loopCount: 0 } })
  expect(html).toContain('display:none!important')
  expect(html).toContain('Hello world')
  layer.hidden = false
  expect(() => parseTheBriefPackage(pkg)).toThrow()
})
it('keeps malformed or ambiguous future intervals held', async () => {
  for (const timing of ['{id:1,from:5000,duration:-1}', '{id:1,from:5000,duration:1000}', '{id:1,from:301000}']) await expect(convertTheBriefHtml(source.replace('{id:1,from:200}', timing))).rejects.toThrow('Invalid element presence')
})
