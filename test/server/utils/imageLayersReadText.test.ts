import { describe, expect, it, vi } from 'vitest'
import { LAYER_VISION_MODEL } from '~~/server/utils/image-layers/decompose'
import {
  buildTextReadPrompt,
  dominantInkColor,
  isTextCandidate,
  parseTextRead,
  readLayerTexts
} from '~~/server/utils/image-layers/readText'

const size = { width: 1000, height: 500 }
const elements = [
  { id: 1, name: 'headline', kind: 'text', bbox: { x: 100, y: 50, width: 400, height: 100 } },
  { id: 2, name: 'dealer logo', kind: 'logo', bbox: { x: 800, y: 20, width: 150, height: 60 } },
  { id: 3, name: 'price badge', kind: 'badge', bbox: { x: 600, y: 300, width: 200, height: 150 } }
]

const reply = (list: unknown[]) => ({ choices: [{ message: { content: JSON.stringify({ elements: list }) } }], usage: { prompt_tokens: 1000, total_tokens: 1200 } })

describe('asking the vision model for the words', () => {
  it('lists each element with its box on the 0-1000 scale', () => {
    const prompt = buildTextReadPrompt(elements, size)
    expect(prompt).toContain('- id 1: "headline" (text), box_2d [100, 100, 300, 500]')
    expect(prompt).toContain('- id 3: "price badge" (badge), box_2d [600, 600, 900, 800]')
    expect(prompt).toMatch(/lettering and nothing else/)
  })

  it('never offers a logo for rebuilding', () => {
    expect(isTextCandidate('logo')).toBe(false)
    expect(isTextCandidate(' Logo ')).toBe(false)
    expect(isTextCandidate('text')).toBe(true)
    expect(isTextCandidate('badge')).toBe(true)
  })
})

describe('reading the reply', () => {
  it('keeps lettering-only elements and normalises what the model said', () => {
    const texts = parseTextRead(reply([
      { id: 1, text_only: true, text: ' SUMMER \r\n SALE ', font_guess: 'Montserrat', font_category: 'SANS', font_weight: 760, italic: false, uppercase: true, align: 'center', color: '#FC0', letter_spacing: 'wide' },
      { id: 3, text_only: false }
    ]), [1, 3])
    expect([...texts.keys()]).toEqual([1])
    expect(texts.get(1)).toEqual({
      text: 'SUMMER\nSALE', lines: 2, fontGuess: 'Montserrat', fontCategory: 'sans', fontWeight: 800, italic: false,
      uppercase: true, align: 'center', color: '#ffcc00', letterSpacing: 'wide'
    })
  })

  it('reads a fenced reply and falls back to safe values for anything odd', () => {
    const fenced = '```json\n{"elements":[{"id":1,"text_only":true,"text":"From $99 a week","font_guess":"unknown","font_category":"grotesque","font_weight":"bold","color":"red","align":"justify"}]}\n```'
    expect(parseTextRead(fenced, [1]).get(1)).toEqual({
      text: 'From $99 a week', lines: 1, fontGuess: null, fontCategory: 'sans', fontWeight: 400, italic: false,
      uppercase: false, align: 'left', color: null, letterSpacing: 'normal'
    })
  })

  it('drops ids it did not ask about, repeats, and lettering with no words', () => {
    const texts = parseTextRead(reply([
      { id: 9, text_only: true, text: 'Not ours' },
      { id: 1, text_only: true, text: '   ' },
      { id: 3, text_only: true, text: 'First' },
      { id: 3, text_only: true, text: 'Second' }
    ]), [1, 3])
    expect([...texts.entries()].map(([id, text]) => [id, text.text])).toEqual([[3, 'First']])
  })

  it('returns nothing for a reply that is not JSON', () => {
    expect(parseTextRead('I could not read that.', [1]).size).toBe(0)
  })
})

describe('the colour of the lettering', () => {
  function image(pixels: Array<[number, number, number, number]>) {
    return { width: pixels.length, height: 1, data: new Uint8Array(pixels.flat()) }
  }

  it('is the most common solid colour in the cut-out', () => {
    expect(dominantInkColor(image([
      [250, 200, 0, 255], [252, 202, 2, 255], [248, 198, 0, 255],
      [20, 20, 20, 255],
      // Soft edges are ignored however many there are.
      [120, 100, 10, 90], [120, 100, 10, 90], [120, 100, 10, 90], [120, 100, 10, 90]
    ]))).toBe('#fac801')
  })

  it('is unknown for a cut-out with no solid pixels', () => {
    expect(dominantInkColor(image([[10, 10, 10, 0], [200, 0, 0, 120]]))).toBeNull()
  })
})

describe('the text-reading call', () => {
  it('makes one vision call for every candidate and prices it from the token count', async () => {
    const run = vi.fn().mockResolvedValue(reply([{ id: 1, text_only: true, text: 'SUMMER SALE', font_category: 'sans', font_weight: 800 }]))
    const result = await readLayerTexts({ imageDataUri: 'data:image/jpeg;base64,AAAA', size, elements, metadata: { jobId: 'job-1' } }, { run })
    expect(run).toHaveBeenCalledTimes(1)
    const [model, inputs, options] = run.mock.calls[0]!
    expect(model).toBe(LAYER_VISION_MODEL)
    expect(inputs.messages[0].content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } })
    // The logo is left out of the request altogether.
    expect(inputs.messages[0].content[0].text).not.toContain('dealer logo')
    expect(options.gateway.metadata).toMatchObject({ feature: 'image-layers-text', jobId: 'job-1' })
    expect(result.texts.get(1)?.text).toBe('SUMMER SALE')
    expect(result.error).toBeNull()
    // 1000 input tokens and 200 output tokens at the published prices.
    expect(result.call).toMatchObject({ step: 'text', ok: true, costUsd: 0.0015 })
  })

  it('does not call the model when there is nothing it could read', async () => {
    const run = vi.fn()
    const result = await readLayerTexts({ imageDataUri: 'data:,', size, elements: [elements[1]!] }, { run })
    expect(run).not.toHaveBeenCalled()
    expect(result).toMatchObject({ error: null, call: null })
  })

  it('reports a failed read instead of throwing, and charges nothing', async () => {
    const run = vi.fn().mockRejectedValue(new Error('gateway 502'))
    const result = await readLayerTexts({ imageDataUri: 'data:,', size, elements }, { run })
    expect(run).toHaveBeenCalledTimes(1)
    expect(result.texts.size).toBe(0)
    expect(result.error).toBe('The words could not be read: gateway 502.')
    expect(result.call).toMatchObject({ ok: false, costUsd: 0 })
  })
})
