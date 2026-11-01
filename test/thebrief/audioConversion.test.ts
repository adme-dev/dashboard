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

it('holds already-clipped exports with unresolved original offsets or fades instead of guessing', async () => {
  await expect(convertTheBriefHtml(audioSource({ startTime: 12.4, endTime: 18.4, duration: 130 }))).rejects.toThrow('source clip offset 12.4s requires exported-clip reconciliation')
  await expect(convertTheBriefHtml(audioSource({ buildOut: { type: 'fadeAudio', duration: 1 } }))).rejects.toThrow('source fades require exported-clip reconciliation')
  await expect(convertTheBriefHtml(audioSource({ soundOnHover: true }))).rejects.toThrow('hover playback')
  await expect(convertTheBriefHtml(audioSource({ buildIn: { type: 'instant', delay: 3 } }))).rejects.toThrow('source audio presence')
})

it.each([-1, 101, 'loud', null])('rejects invalid source volume %j', async (volume) => {
  await expect(convertTheBriefHtml(audioSource({ volume }))).rejects.toThrow('invalid source volume')
})

it('requires an explicit byte-reconciliation boundary before retaining a clipped faded soundtrack', async () => {
  const calls: unknown[] = []
  const html = audioSource({ startTime: 12.4, endTime: 16.2, duration: 130, buildIn: { type: 'fadeAudio', duration: 1, delay: 0.2 }, buildMid: { type: 'none', duration: 1.8 }, buildOut: { type: 'fadeAudio', duration: 1 } })
  const result = await convertTheBriefHtml(html, { reconcileAudio: async (value) => {
    calls.push(value)
  } })
  expect(calls).toEqual([{ src: './clip.mp3', offset: 12.4, clipEnd: 16.2, duration: 3.8, originalDuration: 130, fadeIn: 1, fadeOut: 1 }])
  expect(result.canvasData.custom_300x250.layers.find(layer => layer.type === 'audio')).toMatchObject({ startTime: 0.2, endTime: 4, src: './clip.mp3' })
  await expect(convertTheBriefHtml(html, { reconcileAudio: async () => {
    throw new Error('Clip length was not established')
  } })).rejects.toThrow('Clip length was not established')
})
