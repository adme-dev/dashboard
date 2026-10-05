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
    expect(result.canvasData.custom_300x250.playback.loopCount).toBe(3)
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

  it('converts scale alias and keeps a shared parent origin across split text rows', async () => {
    const html = source.replace('translateX(-100px) translateY(0)', 'scale(8) translateX(0) translateY(0)')
      .replace('translateX(0) translateY(0);opacity:1', 'scale(1);opacity:1')
      .replace('Hello world</div>', 'First line</div><div class="row">Second line</div>')
    const result = await convertTheBriefHtml(html)
    const lines = result.canvasData.custom_300x250.layers.filter(l => l.type === 'text')
    expect(result.warnings.join(' ')).not.toMatch(/animation not converted/)
    for (const line of lines) {
      expect(line.keyframes.scaleX.map(frame => frame.value)).toEqual([8, 1])
      expect(line.keyframes.scaleY.map(frame => frame.value)).toEqual([8, 1])
      expect(line.transformOrigin.x).toBe(100)
      expect(line.y + line.transformOrigin.y).toBeCloseTo(60)
    }
  })

  it('preserves constant top-centred keyframe origins', async () => {
    const result = await convertTheBriefHtml(source
      .replace('translateX(-100px) translateY(0)', 'scaleX(1) scaleY(0)')
      .replace('translateX(0) translateY(0)', 'scaleX(1) scaleY(1)')
      .replaceAll(';opacity:', ';transform-origin:center top;opacity:'))
    const text = result.canvasData.custom_300x250.layers.find(l => l.type === 'text')
    expect(result.warnings.join(' ')).not.toMatch(/animation not converted/)
    expect(text.transformOrigin).toEqual({ x: 100, y: 0 })
    expect(text.keyframes.scaleY.map(frame => frame.value)).toEqual([0, 1])
  })

  it('reports changing transform origins and ordered translations that cannot be flattened', async () => {
    for (const html of [
      source.replace('translateX(-100px)', 'scale(8) translateX(-100px)'),
      source.replace(';opacity:0', ';transform-origin:center top;opacity:0').replace(';opacity:1', ';transform-origin:center bottom;opacity:1')
    ]) {
      const result = await convertTheBriefHtml(html)
      expect(result.warnings.join(' ')).toMatch(/animation not converted/)
    }
  })

  it('does not add transform identities at opacity-only intermediate frames', async () => {
    const html = source.replace('translateX(-100px) translateY(0)', 'scale(8)')
      .replace('translateX(0) translateY(0)', 'scale(1)')
      .replace('}100%{', '}50%{opacity:0.5}100%{')
    const result = await convertTheBriefHtml(html)
    expect(result.canvasData.custom_300x250.layers.find(l => l.type === 'text').keyframes.scaleX.map(frame => frame.value)).toEqual([8, 1])
  })

  it('flags zoom effects whose wrapper does not match the parent geometry', async () => {
    const html = source.replace('width:100%;height:100%', 'width:50%;height:100%')
      .replace('translateX(-100px) translateY(0)', 'scale(8)')
      .replace('translateX(0) translateY(0)', 'scale(1)')
    const result = await convertTheBriefHtml(html)
    expect(result.warnings.join(' ')).toMatch(/effect geometry.*animation not converted/)
  })

  it('reports bundled fonts as a bounded local manifest without fetching resources', async () => {
    const result = await convertTheBriefHtml(source.replace('<style>', `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Example"><style>
      @font-face{font-family:'Example Brand';font-weight:300;font-style:normal;src:url("./fonts/example.ttf") format("truetype")}`))
    expect(result.fonts).toEqual([{ family: 'Example Brand', weight: 300, style: 'normal', format: 'truetype', path: './fonts/example.ttf' }])
    expect(result.warnings.join(' ')).toMatch(/Custom fonts require managed upload/)
    expect(result.warnings.join(' ')).toMatch(/External font stylesheet/)
  })

  it('rejects unsafe font paths and flags unsupported italic text', async () => {
    await expect(convertTheBriefHtml(source.replace('<style>', `<style>@font-face{font-family:'Example';src:url("../secret.ttf") format("truetype")}`))).rejects.toThrow(/local asset/)
    const result = await convertTheBriefHtml(source.replace('font-weight:700', 'font-weight:700;font-style:italic'))
    expect(result.warnings.join(' ')).toMatch(/italic.*not preserved/)
  })

  it('retains a longhand canvas background and static shape rotation', async () => {
    const html = source.replace('background:#fff', 'background-color:#131e29')
      .replace('data-eltype="text"', 'data-eltype="shape"')
      .replace('<div class="row">Hello world</div>', '<div style="transform:rotate(90deg)"><div id="c-1" style="background-color:#fff;border-radius:23px"></div></div>')
    const result = await convertTheBriefHtml(html)
    const board = result.canvasData.custom_300x250
    expect(board.layers[0].bgColor).toBe('#131e29')
    expect(board.bgColor).toBe('#131e29')
    expect(board.layers.find(l => l.type === 'rect').rotation).toBe(90)
    expect(board.layers.find(l => l.type === 'rect').borderRadius).toBe(23)
  })

  it('preserves a local root background image and transparent fallback', async () => {
    const html = source.replace('background:#fff', 'background-image:url(./media/background.jpg);background-size:cover;background-position:50% 50%')
    const result = await convertTheBriefHtml(html)
    expect(result.canvasData.custom_300x250.layers[0]).toMatchObject({ src: './media/background.jpg', fit: 'cover', bgColor: 'transparent' })
    await expect(convertTheBriefHtml(html.replace('./media/background.jpg', 'https://example.com/background.jpg'))).rejects.toThrow(/local asset/)
  })

  it('retains uppercase styling while keeping raw text editable', async () => {
    const result = await convertTheBriefHtml(source.replace('font-weight:700', 'font-weight:700;text-transform:uppercase'))
    expect(result.canvasData.custom_300x250.layers.find(l => l.type === 'text')).toMatchObject({ text: 'Hello world', textTransform: 'uppercase' })
  })

  it('rejects external image references in the native candidate', async () => {
    const image = source.replace('data-eltype="text"', 'data-eltype="image"').replace('<div class="row">Hello world</div>', '<img src="https://example.com/private.png">')
    await expect(convertTheBriefHtml(image)).rejects.toThrow(/local asset/i)
  })
})
