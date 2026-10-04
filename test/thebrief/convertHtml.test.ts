import { describe, expect, it } from 'vitest'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'

import { source } from './fixture'

describe('TheBrief single-slide native conversion pilot', () => {
  it('recreates editable text and delayed opacity/position tracks without executing source', async () => {
    const result = await convertTheBriefHtml(source)
    const layer = result.canvasData.custom_300x250.layers.find(l => l.type === 'text')
    expect(layer).toMatchObject({ text: 'Hello world', x: 10, y: 20, fontSize: 24, startTime: 0.2, endTime: 4 })
    expect(layer.keyframes.x).toEqual([{ time: 0.2, value: -100, easing: 'cubic-bezier(.165,.84,.44,1)' }, { time: 1.2, value: 0 }])
    expect(layer.keyframes.opacity[0].value).toBe(0)
    expect(result.source.duration).toBe(4)
    expect(result.source.loopCount).toBe(0)
  })

  it('holds static and animated layers through the full loop without default fades', async () => {
    const result = await convertTheBriefHtml(source)
    for (const layer of result.canvasData.custom_300x250.layers) {
      expect(layer.keyframes.opacity.at(-1)).toMatchObject({ time: 4, value: 1 })
      expect(layer.animOut).toBe('none')
    }
    expect(result.canvasData.custom_300x250.layers[0].keyframes.opacity[0]).toMatchObject({ time: 0, value: 1 })
  })

  it('reports finite loops and unconverted intermediate effects', async () => {
    const result = await convertTheBriefHtml(source.replace('loopCount:0', 'loopCount:3').replace('<div class="row">', '<div id="effMid1"></div><div class="row">'))
    expect(result.warnings.join(' ')).toMatch(/Finite loop/)
    expect(result.warnings.join(' ')).toMatch(/effMid1/)
  })

  it('rejects mixed styled runs rather than silently flattening typography', async () => {
    await expect(convertTheBriefHtml(source.replace('Hello world', '<span style="font-size:20px">Hello</span><span style="font-size:30px">world</span>'))).rejects.toThrow(/Mixed styled/)
  })

  it('does not evaluate executable expressions in design data', async () => {
    await expect(convertTheBriefHtml(source.replace('width:300,height', 'width:(()=>{throw new Error("ran")})(),height'))).rejects.toThrow(/literal/i)
  })

  it('rejects multiple slides instead of silently dropping one', async () => {
    await expect(convertTheBriefHtml(source.replace('customAnimations:[]', 'customAnimations:[]').replace('animations:[', 'animations:[{type:"slide",id:2,duration:4000},'))).rejects.toThrow(/single.slide/i)
  })

  it('reports unsupported transforms and preserves supported blend modes', async () => {
    const result = await convertTheBriefHtml(source.replace('translateX(-100px)', 'skewX(20deg)').replace('position:absolute;', 'position:absolute;mix-blend-mode:color;'))
    expect(result.warnings.join(' ')).toMatch(/skewX/)
    expect(result.canvasData.custom_300x250.layers.find(l => l.type === 'text').mixBlendMode).toBe('color')
    expect(result.fidelityVerified).toBe(false)
  })

  it('rejects external image references in the native candidate', async () => {
    const image = source.replace('data-eltype="text"', 'data-eltype="image"').replace('<div class="row">Hello world</div>', '<img src="https://example.com/private.png">')
    await expect(convertTheBriefHtml(image)).rejects.toThrow(/local asset/i)
  })
})
