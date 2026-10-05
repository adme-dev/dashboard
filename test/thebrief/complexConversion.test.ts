import { expect, it } from 'vitest'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { source } from './fixture'

export const twoSlides = source.replace('animations:[', 'animations:[{type:"slide",id:2,duration:59000,effInDuration:0,effOutDuration:0,crossTypeOut:"hide",elements:[]},')
  .replace('<div id="slide-1">', '<div id="slide-2"><div id="element-2" data-eltype="text" style="left:0px;top:0px;width:200px;height:40px"><div class="row">Static first slide</div></div></div><div id="slide-1">')

it('preserves DOM-only static layers, absolute slide timing and a 63 second cycle', async () => {
  const result = await convertTheBriefHtml(twoSlides)
  const board = result.canvasData.custom_300x250
  expect(board.playback.duration).toBe(63)
  expect(board.layers.find(l => l.text === 'Static first slide')).toMatchObject({ startTime: 0, endTime: 59, clipToPresence: true })
  const animated = board.layers.find(l => l.text === 'Hello world')
  expect(animated).toMatchObject({ startTime: 59.2, endTime: 63, clipToPresence: true })
  expect(animated.keyframes.x[0].time).toBe(59.2)
  expect(result.sourceElements.map(e => e.slideId)).toEqual([2, 1])
})

it('imports an editable CTA with its border and typography', async () => {
  const html = source.replace('data-eltype="text"', 'data-eltype="button"').replace('<div class="row">Hello world</div>', '<button style="background:#eb0a1e;border:4px solid #fff;border-radius:50px;padding:0px"><label style="font-family:Poppins;font-size:32px;font-weight:600;color:#fff;line-height:1.4;letter-spacing:0px">FIND OUT MORE</label></button>')
  const result = await convertTheBriefHtml(html)
  expect(result.canvasData.custom_300x250.layers.find(l => l.type === 'button')).toMatchObject({ text: 'FIND OUT MORE', borderWidth: 4, borderColor: '#fff', borderRadius: 50, fontFamily: 'Poppins', fontSize: 32, fontWeight: 600, lineHeight: 1.4, letterSpacing: '0px', textTransform: 'none' })
})

it('preserves superscripts as editable text runs and rejects unsupported mixed colours', async () => {
  const html = source.replace('Hello world', 'Saturday 2<sup style="position:relative;top:-5px;vertical-align:baseline"><span style="font-size:14px">nd</span></sup> Dec')
  const result = await convertTheBriefHtml(html)
  expect(result.canvasData.custom_300x250.layers.find(l => l.type === 'text')).toMatchObject({ text: 'Saturday 2nd Dec', textRuns: [{ text: 'Saturday 2' }, { text: 'nd', fontSize: 14, top: -5 }, { text: ' Dec' }] })
  await expect(convertTheBriefHtml(source.replace('Hello world', '<span style="color:red">Red</span><span style="color:blue">Blue</span>'))).rejects.toThrow(/Mixed styled/)
})

it('round-trips 63 second timing and inline text through the import contract', async () => {
  const { parseTheBriefPackage, sameImportedCanvas } = await import('../../app/utils/thebrief-import')
  const candidate = await convertTheBriefHtml(twoSlides)
  const input = { kind: 'xeroflow-thebrief-import', version: 1, name: 'Multi-slide test', source: { designHash: 'test', sha256: 'a'.repeat(64), folder: 'Tests', duration: 63, loopCount: 0 }, canvasData: candidate.canvasData, warnings: [], assets: [], fonts: [] }
  const saved = JSON.parse(JSON.stringify(parseTheBriefPackage(input)))
  expect(sameImportedCanvas(saved.canvasData, candidate.canvasData)).toBe(true)
})
