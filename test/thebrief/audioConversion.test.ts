import { expect, it } from 'vitest'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { source } from './fixture'

function audioSource(config: Record<string, unknown> = {}, attributes = '') {
  return source.replace('customAnimations:[]', `customAnimations:[],audioElements:[${JSON.stringify({ slideId: 1, elementId: 1, startTime: 0, volume: 100, shouldPlay: false, ...config })}]`)
    .replace('data-eltype="text"', 'data-eltype="audio"')
    .replace('<div id="effIn1"><div class="row">Hello world</div></div>', `<audio ${attributes}><source src="./clip.mp3" type="audio/mpeg"></audio>`)
}

it('does not mistake the source autoplay-retry flag for an intentional mute', async () => {
  for (const shouldPlay of [false, true]) {
    const result = await convertTheBriefHtml(audioSource({ shouldPlay, volume: 35 }))
    const track = result.canvasData.custom_300x250.layers.find(layer => layer.type === 'audio')
    expect(track).toMatchObject({ volume: 0.35, startTime: 0.2, endTime: 4, src: './clip.mp3' })
    expect(track.muted).not.toBe(true)
  }
})

it('preserves explicit mute and zero volume', async () => {
  for (const html of [audioSource({}, 'muted'), audioSource({ muted: true })]) {
    const result = await convertTheBriefHtml(html)
    expect(result.canvasData.custom_300x250.layers.find(layer => layer.type === 'audio').muted).toBe(true)
  }
  const zero = await convertTheBriefHtml(audioSource({ volume: 0 }))
  expect(zero.canvasData.custom_300x250.layers.find(layer => layer.type === 'audio').volume).toBe(0)
})

it('uses the authored clip trim when the generic audio element duration is stale', async () => {
  const html = audioSource({ endTime: 3.8, duration: 3.8 })
    .replace('{id:1,from:200}', '{id:1,from:200,duration:2000}')
  const result = await convertTheBriefHtml(html)
  const track = result.canvasData.custom_300x250.layers.find(layer => layer.type === 'audio')
  expect(track).toMatchObject({ startTime: 0.2, endTime: 4 })
  expect(track.keyframes.opacity.at(-1)).toMatchObject({ time: 4, value: 1 })
})

it('keeps a verified original audio trim when TheBrief uses a delayed instant exit', async () => {
  const config = {
    endTime: 4, duration: 121,
    buildIn: { duration: 1, delay: 0, type: 'instant' },
    buildMid: { duration: 2, delay: 0, type: 'none' },
    buildOut: { duration: 1, delay: 2, type: 'instant' }
  }
  const input = (options: Record<string, unknown>) => audioSource(options).replace('{id:1,from:200}', '{id:1,from:0}')
  const result = await convertTheBriefHtml(input(config))
  const track = result.canvasData.custom_300x250.layers.find(layer => layer.type === 'audio')
  expect(track).toMatchObject({ startTime: 0, endTime: 4, src: './clip.mp3' })
  expect(result.audioTransforms).toContainEqual({ layerId: track.id, duration: 4, fadeIn: 0, fadeOut: 0 })
  const fade = await convertTheBriefHtml(input({ ...config, buildOut: { ...config.buildOut, type: 'fadeAudio' } }))
  expect(fade.audioTransforms).toContainEqual({ layerId: track.id, duration: 4, fadeIn: 0, fadeOut: 1 })
  await expect(convertTheBriefHtml(input({ ...config, buildOut: { ...config.buildOut, delay: 3 } }))).rejects.toThrow('clip duration requires reconciliation')
})

it('holds inconsistent clip duration metadata rather than guessing the audio end', async () => {
  await expect(convertTheBriefHtml(audioSource({ endTime: 3, duration: 2 }))).rejects.toThrow('clip duration requires reconciliation')
})

it('keeps full soundtrack fades when a short looping slide stops playback first', async () => {
  const config = {
    startTime: 15.7, endTime: 23.7, duration: 153.887325,
    buildIn: { duration: 1, delay: 0, type: 'instant' },
    buildMid: { duration: 6, delay: 0, type: 'audio' },
    buildOut: { duration: 1, delay: 0, type: 'fadeAudio' }
  }
  const input = (options: Record<string, unknown>) => audioSource(options).replace('{id:1,from:200}', '{id:1,from:0}')
  const result = await convertTheBriefHtml(input(config))
  const track = result.canvasData.custom_300x250.layers.find(layer => layer.type === 'audio')
  expect(track).toMatchObject({ startTime: 0, endTime: 4, src: './clip.mp3' })
  expect(result.audioTransforms).toContainEqual({ layerId: track.id, duration: 8, fadeIn: 0, fadeOut: 1 })
  await expect(convertTheBriefHtml(input({ ...config, endTime: 24.7 }))).rejects.toThrow('requires exported-clip reconciliation')
})

it('holds already-clipped exports with unresolved original offsets or fades instead of guessing', async () => {
  await expect(convertTheBriefHtml(audioSource({ startTime: 12.4, endTime: 18.4, duration: 130 }))).rejects.toThrow('source clip offset 12.4s requires exported-clip reconciliation')
  await expect(convertTheBriefHtml(audioSource({ buildOut: { type: 'fadeAudio', duration: 1 } }))).rejects.toThrow('source fades require exported-clip reconciliation')
  await expect(convertTheBriefHtml(audioSource({ soundOnHover: true }))).rejects.toThrow('hover playback')
  await expect(convertTheBriefHtml(audioSource({ buildIn: { type: 'instant', delay: 3 } }))).rejects.toThrow('source audio presence')
})

it.each([-1, 101, 'loud', null])('rejects invalid source volume %j', async (volume) => {
  await expect(convertTheBriefHtml(audioSource({ volume }))).rejects.toThrow('invalid source volume')
})
