import { expect, it } from 'vitest'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { source } from './fixture'

// The fixture's element-1 is a 200×80 box at (10,20) that appears at 0.2s on a 4s slide.
function videoSource(config: Record<string, unknown> = {}, { attributes = 'muted autoplay playsinline', videoCss = 'width:100%;height:100%;object-fit:cover;object-position:center' } = {}) {
  return source.replace('customAnimations:[]', `customAnimations:[],videoElements:[${JSON.stringify({ elementId: 1, slideId: 1, volume: 0, startTime: 0, endTime: 8, soundOnHover: false, delay: 0.2, autoplay: true, loop: false, keepPlayingPastSlide: false, src: './media/clip.mp4', ...config })}]`)
    .replace('.row{', `#v1{${videoCss}}.row{`)
    .replace('data-eltype="text"', 'data-eltype="video"')
    .replace('<div id="effIn1"><div class="row">Hello world</div></div>', `<div id="effIn1"><video id="v1" src="./media/clip.mp4" ${attributes}></video></div>`)
}

const videoLayer = async (html: string) => (await convertTheBriefHtml(html)).canvasData.custom_300x250.layers.find(layer => layer.type === 'video')
const videoComposition = (css: string) => videoSource().replace('#v1{', `#composition{${css}}#v1{`).replace('<video ', '<div id="composition"><video ').replace('</video>', '</video></div>')

it('preserves nested video opacity and colour filtering with its outer blend mode', async () => {
  const html = videoComposition('opacity:.5;filter:brightness(1.12) contrast(1.12) saturate(1.12) hue-rotate(0deg)').replace('#v1{', '#element-1{mix-blend-mode:screen}#v1{')
  const layer = await videoLayer(html)
  expect(layer).toMatchObject({ opacity: 0.5, mixBlendMode: 'screen', visualFilter: 'brightness(1.12) contrast(1.12) saturate(1.12) hue-rotate(0deg)' })
  expect(Math.max(...layer.keyframes.opacity.map(frame => frame.value))).toBe(0.5)
  expect(layer.keyframes.opacity.at(-1).value).toBe(0.5)
})

it.each([
  ['mix-blend-mode:overlay', 'nested blend mode'],
  ['filter:url(https://example.com/filter.svg)', 'unsupported static filter'],
  ['filter:blur(2px)', 'spatial or nested filters'],
  ['opacity:.5;animation-name:fadeIn;animation-duration:1s', 'animated underlying opacity']
])('holds video composition that cannot be flattened: %s', async (css, reason) => {
  await expect(videoLayer(videoComposition(css))).rejects.toThrow(reason)
})

it('converts a muted autoplay clip into an editable video layer with its media clock', async () => {
  expect(await videoLayer(videoSource())).toMatchObject({ type: 'video', src: './media/clip.mp4', fit: 'cover', focalX: 50, focalY: 50, mediaStart: 0, mediaEnd: 8, startTime: 0.2, endTime: 4, x: 10, y: 20, w: 200, h: 80 })
  expect((await videoLayer(videoSource())).mediaLoop).toBeUndefined()
  expect(await videoLayer(videoSource({ loop: true, endTime: 1.5 }))).toMatchObject({ mediaEnd: 1.5, mediaLoop: true })
})

it('maps TheBrief cover-crop framing to a native focal point and records the expected aspect', async () => {
  // 200×80 frame; the clip is sized 200×112.5 (16:9) and shifted up by 16.25px: centred vertically.
  const result = await convertTheBriefHtml(videoSource({}, { videoCss: 'width:200px;height:112.5px;object-fit:cover;object-position:center;transform:translate(0px,-16.25px) rotate(0)' }))
  const layer = result.canvasData.custom_300x250.layers.find(item => item.type === 'video')
  expect(layer).toMatchObject({ fit: 'cover', focalX: 50, focalY: 50 })
  expect(result.videoFrames).toEqual([{ layerId: layer.id, src: './media/clip.mp4', aspect: 200 / 112.5 }])
  const top = await videoLayer(videoSource({}, { videoCss: 'width:200px;height:112.5px;object-fit:cover;transform:translate(0px,0px) rotate(0)' }))
  expect(top).toMatchObject({ focalX: 50, focalY: 0 })
})

it.each([
  [{ startTime: 2 }, {}, 'source clip start 2s requires exported-clip reconciliation'],
  [{ soundOnHover: true }, {}, 'hover playback'],
  [{ keepPlayingPastSlide: true }, {}, 'playback past its slide'],
  [{ autoplay: false }, {}, 'click-to-play'],
  [{}, { attributes: 'muted autoplay playsinline controls' }, 'player controls'],
  [{ volume: 60 }, { attributes: 'autoplay playsinline' }, 'audible video requires an audio adapter'],
  [{ delay: 1.5 }, {}, 'source video start requires reconciliation'],
  [{ endTime: 0 }, {}, 'invalid source clip end'],
  [{ src: './media/other.mp4' }, {}, 'missing or mismatched source video settings'],
  [{}, { videoCss: 'width:100%;height:100%;object-fit:cover;transform:rotate(12deg)' }, 'transformed video'],
  [{}, { videoCss: 'width:300px;height:168.75px;object-fit:cover;transform:translate(-50px,-44px)' }, 'cropped video framing'],
  [{}, { videoCss: 'width:100%;height:100%;object-fit:scale-down' }, 'unsupported video fit']
])('holds unsupported video settings %j %j', async (config, options, message) => {
  await expect(convertTheBriefHtml(videoSource(config, options))).rejects.toThrow(message)
})

it('holds a video without source player settings', async () => {
  await expect(convertTheBriefHtml(videoSource().replace(/videoElements:\[[^\]]*\]/, 'videoElements:[]'))).rejects.toThrow('missing or mismatched source video settings')
})
