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

it('preserves an audible video as editable video and a synchronized soundtrack', async () => {
  const result = await convertTheBriefHtml(videoSource({ volume: 60, loop: true }, { attributes: 'autoplay playsinline' }))
  const layers = result.canvasData.custom_300x250.layers
  const video = layers.find(layer => layer.type === 'video')
  const audio = layers.find(layer => layer.type === 'audio')
  expect(audio).toMatchObject({ src: video.src, volume: 0.6, loopAudio: true, mediaStart: video.mediaStart, mediaEnd: video.mediaEnd, startTime: video.startTime, endTime: video.endTime })
})

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

it('keeps an asymmetric crop and centred mirror editable without changing the media source', async () => {
  const html = videoSource({}, { videoCss: 'width:200px;height:112.5px;object-fit:cover;transform:translate(0,-25px) rotate(0)' })
    .replace('<div id="effIn1">', '<div style="width:100%;height:100%;transform:rotate(0) scale(-1,-1)"><div id="effIn1">')
    .replace('</video></div>', '</video></div></div>')
  const result = await convertTheBriefHtml(html)
  const layer = result.canvasData.custom_300x250.layers.find(layer => layer.type === 'video')
  expect(layer).toMatchObject({ flipX: true, flipY: true, focalX: 50, focalY: 76.92, src: './media/clip.mp4', mediaStart: 0, mediaEnd: 8 })
  expect(layer.keyframes.x).toHaveLength(2)
  expect(result.videoFrames).toEqual([{ layerId: layer.id, src: './media/clip.mp4', aspect: 200 / 112.5 }])
  await expect(videoLayer(html.replace('rotate(0) scale', 'rotate(90deg) scale'))).rejects.toThrow('transformed video')
})

it('keeps a full viewport quarter-turn as editable rotation', async () => {
  const html = videoSource()
    .replace('<div id="effIn1">', '<div style="width:100%;height:100%;transform:rotate(90deg)"><div id="effIn1">')
    .replace('</video></div>', '</video></div></div>')
  expect(await videoLayer(html)).toMatchObject({ rotation: 90, x: 10, y: 20, w: 200, h: 80, src: './media/clip.mp4' })
  await expect(videoLayer(html.replace('rotate(90deg)', 'rotate(12deg)'))).rejects.toThrow('transformed video')
})

it('stores a zoom beyond cover as the clipped source rectangle', async () => {
  const html = videoSource({}, { videoCss: 'width:320px;height:180px;object-fit:cover;transform:translate(-10px,-35px) rotate(0)' })
    .replace('<video ', '<div style="width:100%;height:100%;overflow:hidden"><video ')
    .replace('</video>', '</video></div>')
  const layer = await videoLayer(html)
  expect(layer).toMatchObject({ src: './media/clip.mp4', videoCrop: { x: 10 / 320, y: 35 / 180, w: 200 / 320, h: 80 / 180 } })
  await expect(videoLayer(html.replace('translate(-10px', 'translate(0.5px'))).rejects.toThrow('cropped video framing')
})

it.each([
  [{ startTime: 2 }, {}, 'source clip start 2s requires exported-clip reconciliation'],
  [{ soundOnHover: true }, {}, 'hover playback'],
  [{ keepPlayingPastSlide: true }, {}, 'playback past its slide'],
  [{ autoplay: false }, {}, 'click-to-play'],
  [{}, { attributes: 'muted autoplay playsinline controls' }, 'player controls'],
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

it('preserves the reviewed top fade on an editable video and rejects other media masks', async () => {
  const gradient = 'linear-gradient(0deg,rgba(0,0,0,1) 45%,rgba(0,0,0,0.8) 78%,rgba(0,0,0,0) 100%)'
  const html = videoSource().replace('<video ', '<div class="sourceFade"><video ').replace('</video>', '</video></div>') + `<style>.sourceFade{mask-image:${gradient};mask-repeat:no-repeat;mask-position:center;mask-size:100% 100%;mask-origin:content-box}</style>`
  expect(await videoLayer(html)).toMatchObject({ type: 'video', mediaMask: 'fadeTop' })
  await expect(videoLayer(html.replace(' 45%', ' 10%'))).rejects.toThrow('unsupported media mask composition')
})
