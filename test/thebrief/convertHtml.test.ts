import { describe, expect, it } from 'vitest'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'

import { source } from './fixture'

describe('TheBrief single-slide native conversion pilot', () => {
  it('preserves intentional nonbreaking spacing beside price labels', async () => {
    const result = await convertTheBriefHtml(source.replace('Hello world', '&nbsp;incl GST*'))
    expect(result.canvasData.custom_300x250.layers.find(l => l.type === 'text').text).toBe('\u00a0incl GST*')
  })

  it.each(['\r', '\r\n', '\n'])('preserves source headline line breaks from %j HTML input', async (newline) => {
    const html = source.replace('.row{', '.row{white-space:pre-line;')
      .replace('Hello world', `Do you want your ${newline}equipment to perform${newline}like new?`)
    const result = await convertTheBriefHtml(html)
    const layer = result.canvasData.custom_300x250.layers.find(l => l.type === 'text')
    expect(layer.text).toBe('Do you want your \nequipment to perform\nlike new?')
    expect(layer.text).not.toContain('\r')
    expect(layer.keyframes.opacity).toEqual((await convertTheBriefHtml(source)).canvasData.custom_300x250.layers.find(l => l.type === 'text').keyframes.opacity)
  })

  it('normalizes raw line endings consistently in styled text runs without rewriting character references', async () => {
    const html = source.replace('.row{', '.row{white-space:pre-line;')
      .replace('Hello world', '<span style="font-size:24px">First\r\nline</span><span style="font-size:30px">\rSecond&nbsp;line</span>')
    const result = await convertTheBriefHtml(html)
    const layer = result.canvasData.custom_300x250.layers.find(l => l.type === 'text')
    expect(layer.text).toBe('First\nline\nSecond\u00a0line')
    expect(layer.textRuns).toEqual([{ text: 'First\nline' }, { text: '\nSecond\u00a0line', fontSize: 30 }])
    expect(layer.textRuns.map(run => run.text).join('')).toBe(layer.text)
    const referenced = await convertTheBriefHtml(source.replace('Hello world', 'Literal&#13;reference'))
    expect(referenced.canvasData.custom_300x250.layers.find(l => l.type === 'text').text).toBe('Literal\rreference')
  })

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

  it('retains different font sizes within one editable line', async () => {
    const result = await convertTheBriefHtml(source.replace('Hello world', '<span style="font-size:20px">Hello </span><span style="font-size:30px">world</span>'))
    expect(result.canvasData.custom_300x250.layers.find(l => l.type === 'text')?.textRuns).toEqual([{ text: 'Hello ' }, { text: 'world', fontSize: 30 }])
  })

  it('does not evaluate executable expressions in design data', async () => {
    await expect(convertTheBriefHtml(source.replace('width:300,height', 'width:(()=>{throw new Error("ran")})(),height'))).rejects.toThrow(/literal/i)
  })

  it('rejects malformed slide metadata instead of silently dropping a slide', async () => {
    await expect(convertTheBriefHtml(source.replace('customAnimations:[]', 'customAnimations:[]').replace('animations:[', 'animations:[{type:"slide",id:2,duration:4000},'))).rejects.toThrow(/slide metadata/i)
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
      // Two 28.8px line boxes; a taller source box would mean a row soft-wraps.
      .replace('height:80px', 'height:57.6px')
    const result = await convertTheBriefHtml(html)
    const lines = result.canvasData.custom_300x250.layers.filter(l => l.type === 'text')
    expect(result.warnings.join(' ')).not.toMatch(/animation not converted/)
    for (const line of lines) {
      expect(line.keyframes.scaleX.map(frame => frame.value)).toEqual([8, 1])
      expect(line.keyframes.scaleY.map(frame => frame.value)).toEqual([8, 1])
      expect(line.transformOrigin.x).toBe(100)
      expect(line.y + line.transformOrigin.y).toBeCloseTo(48.8)
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

  it('rejects unsafe font paths and preserves italic text', async () => {
    await expect(convertTheBriefHtml(source.replace('<style>', `<style>@font-face{font-family:'Example';src:url("../secret.ttf") format("truetype")}`))).rejects.toThrow(/local asset/)
    const result = await convertTheBriefHtml(source.replace('font-weight:700', 'font-weight:700;font-style:italic'))
    expect(result.canvasData.custom_300x250.layers.find(l => l.type === 'text')?.fontStyle).toBe('italic')
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

  it('bakes a rotated solid divider into geometry while retaining its vertical reveal pivot', async () => {
    const html = source.replace('data-eltype="text"', 'data-eltype="shape"')
      .replace('<div class="row">Hello world</div>', '<div style="transform:rotate(90deg)"><div id="c-1" style="background-color:#fff;border-radius:0px"></div></div>')
      .replace('transform:translateX(-100px) translateY(0);opacity:0', 'transform:scaleX(1) scaleY(0);transform-origin:center top;opacity:1')
      .replace('transform:translateX(0) translateY(0);opacity:1', 'transform:scaleX(1) scaleY(1);transform-origin:center top;opacity:1')
    const result = await convertTheBriefHtml(html)
    expect(result.canvasData.custom_300x250.layers.find(l => l.type === 'rect')).toMatchObject({
      x: 70, y: -40, w: 80, h: 200, rotation: 0, transformOrigin: { x: 40, y: 60 }
    })
    expect(result.warnings.join(' ')).toMatch(/rotation baked into native geometry/)
  })

  it('preserves a local root background image and transparent fallback', async () => {
    const html = source.replace('background:#fff', 'background-image:url(./media/background.jpg);background-size:cover;background-position:50% 50%')
    const result = await convertTheBriefHtml(html)
    expect(result.canvasData.custom_300x250.layers[0]).toMatchObject({ src: './media/background.jpg', fit: 'cover', bgColor: 'transparent' })
    await expect(convertTheBriefHtml(html.replace('./media/background.jpg', 'https://example.com/background.jpg'))).rejects.toThrow(/local asset/)
  })

  it('preserves SVG-backed shapes as asset layers with their original motion tracks', async () => {
    const html = source.replace('data-eltype="text"', 'data-eltype="shape"')
      .replace('<div class="row">Hello world</div>', '<div id="c-1" style="background-image:url(./media/shape.svg);background-size:cover;background-position:50% 50%;background-repeat:no-repeat;border:0 solid #000;border-radius:0"></div>')
    const result = await convertTheBriefHtml(html)
    const shape = result.canvasData.custom_300x250.layers.find(l => l.name === 'Shape 1')
    expect(shape).toMatchObject({ type: 'image', src: './media/shape.svg', fit: 'cover', x: 10, y: 20, w: 200, h: 80 })
    expect(shape.keyframes.x.map(f => f.value)).toEqual([-100, 0])
    expect(shape.fillColor).toBeUndefined()
    await expect(convertTheBriefHtml(html.replace('./media/shape.svg', 'https://example.com/shape.svg'))).rejects.toThrow(/local asset/)
    await expect(convertTheBriefHtml(html.replace('background-size:cover', 'background-size:50%'))).rejects.toThrow(/shape background/)
    await expect(convertTheBriefHtml(html.replace('border-radius:0', 'border-radius:12px'))).rejects.toThrow(/shape background/)
  })

  it('preserves gradient shape fills and their motion without flattening artwork', async () => {
    const gradient = 'linear-gradient(0deg, rgba(1,43,94,0) 0, #012c5f 100%)'
    const html = source.replace('data-eltype="text"', 'data-eltype="shape"')
      .replace('<div class="row">Hello world</div>', `<div id="c-1" style="background:${gradient};border:0 solid #000;border-radius:0"></div>`)
    const result = await convertTheBriefHtml(html)
    const shape = result.canvasData.custom_300x250.layers.find(l => l.name === 'Shape 1')
    expect(shape).toMatchObject({ type: 'rect', fillColor: gradient })
    expect(shape.keyframes.x.map(f => f.value)).toEqual([-100, 0])
    await expect(convertTheBriefHtml(html.replace('border:0', 'border:2px'))).rejects.toThrow(/gradient shape/)
    await expect(convertTheBriefHtml(html.replace('border:0', 'background-size:50%;border:0'))).rejects.toThrow(/gradient shape/)
    await expect(convertTheBriefHtml(html.replace('border:0', 'background-blend-mode:multiply;border:0'))).rejects.toThrow(/gradient shape/)
  })

  it('recovers a class-rule gradient fill that the offline DOM drops instead of exporting transparent', async () => {
    // From a GWS Kia export: the glow's rgba() stop is lost by happy-dom in both
    // computed style and CSSOM, which previously produced a transparent rect.
    const gradient = 'linear-gradient(0deg,#f0c 27%,rgba(0,0,0,0) 72%)'
    const html = source.replace('</style>', `.glow{background:${gradient};border-radius:0}</style>`)
      .replace('data-eltype="text"', 'data-eltype="shape"')
      .replace('<div class="row">Hello world</div>', '<div id="c-1" class="glow"></div>')
    const shape = (await convertTheBriefHtml(html)).canvasData.custom_300x250.layers.find(l => l.name === 'Shape 1')
    expect(shape).toMatchObject({ type: 'rect', fillColor: gradient })
    // TheBrief's shared shape frame paints a size-less gradient over the whole box.
    const framed = await convertTheBriefHtml(html.replace('</style>', '.glow{background-position:50% 50%;background-repeat:no-repeat;background-size:cover}</style>'))
    expect(framed.canvasData.custom_300x250.layers.find(l => l.name === 'Shape 1').fillColor).toBe(gradient)
    await expect(convertTheBriefHtml(html.replace(`background:${gradient}`, `background:${gradient} no-repeat 10px 0`))).rejects.toThrow(/gradient shape/)
    await expect(convertTheBriefHtml(html.replace('</style>', `.glow{background-image:${gradient.replace('#f0c', '#fff')}}</style>`))).rejects.toThrow(/gradient shape/)
  })

  it('holds gradient-clipped text instead of replacing the fill with its plain colour', async () => {
    const clipped = 'background:radial-gradient(circle at center center,#fff 0,#8ddcf2 53%,#3b679c 100%);background-clip:text;-webkit-text-fill-color:transparent'
    await expect(convertTheBriefHtml(source.replace('Hello world', `<span style="${clipped}">EOFY</span>`))).rejects.toThrow('Gradient or clipped text fill needs an adapter')
    await expect(convertTheBriefHtml(source.replace('</style>', `.fill{${clipped}}</style>`).replace('Hello world', '<span class="fill">EOFY</span>'))).rejects.toThrow('Gradient or clipped text fill needs an adapter')
    const sameFill = await convertTheBriefHtml(source.replace('Hello world', '<span style="color:#123456;-webkit-text-fill-color:#123456">Plain</span>'))
    expect(sameFill.canvasData.custom_300x250.layers.find(l => l.type === 'text').color).toBe('#123456')
  })

  it('holds struck-through or underlined text instead of dropping the decoration', async () => {
    await expect(convertTheBriefHtml(source.replace('Hello world', '<span style="text-decoration:line-through">Was $62,967</span>'))).rejects.toThrow('Text decoration needs an adapter')
    await expect(convertTheBriefHtml(source.replace('</style>', '.was{text-decoration-line:underline}</style>').replace('Hello world', '<span class="was">Was</span>'))).rejects.toThrow('Text decoration needs an adapter')
    const plain = await convertTheBriefHtml(source.replace('Hello world', '<span style="text-decoration:none">Plain</span>'))
    expect(plain.canvasData.custom_300x250.layers.find(l => l.type === 'text').text).toBe('Plain')
  })

  it('holds stacked rows when the source box shows a row soft-wrapping', async () => {
    // One line box is 24px x 1.2 = 28.8px; two rows stack to 57.6px.
    const twoRows = source.replace('<div class="row">Hello world</div>', '<div class="row">Massive Savings</div><div class="row">on Sportage</div>')
    const fits = await convertTheBriefHtml(twoRows.replace('height:80px', 'height:58px'))
    expect(fits.canvasData.custom_300x250.layers.filter(l => l.type === 'text').map(l => l.y)).toEqual([20, 48.8])
    await expect(convertTheBriefHtml(twoRows.replace('height:80px', 'height:87px'))).rejects.toThrow('Wrapped text across stacked rows needs an adapter')
    // Only the last row wraps when the extra height is whole lines of it alone.
    const lastWraps = twoRows.replace('<div class="row">on Sportage</div>', '<div class="row" style="font-size:12px">on Sportage</div>')
    expect((await convertTheBriefHtml(lastWraps.replace('height:80px', 'height:57.6px'))).canvasData.custom_300x250.layers.filter(l => l.type === 'text')).toHaveLength(2)
    // A single row may wrap: the native text box wraps to the same width.
    const single = await convertTheBriefHtml(source.replace('height:80px', 'height:87px'))
    expect(single.canvasData.custom_300x250.layers.find(l => l.type === 'text').text).toBe('Hello world')
  })

  it('retains uppercase styling while keeping raw text editable', async () => {
    const result = await convertTheBriefHtml(source.replace('font-weight:700', 'font-weight:700;text-transform:uppercase'))
    expect(result.canvasData.custom_300x250.layers.find(l => l.type === 'text')).toMatchObject({ text: 'Hello world', textTransform: 'uppercase' })
  })

  it('rejects external image references in the native candidate', async () => {
    const image = source.replace('data-eltype="text"', 'data-eltype="image"').replace('<div class="row">Hello world</div>', '<img src="https://example.com/private.png">')
    await expect(convertTheBriefHtml(image)).rejects.toThrow(/local asset/i)
  })

  it('resolves legacy c-null images inside their own layer and preserves editable motion', async () => {
    const content = '<div id="c-null" role="img" style="width:100%;height:100%;background-image:url(./media/photo.jpg);background-size:cover;background-position:50% 50%;background-repeat:no-repeat"></div>'
    const html = source.replace('data-eltype="text"', 'data-eltype="image"').replace('<div class="row">Hello world</div>', content)
      .replace('<div id="designContainer">', '<div id="designContainer"><div id="c-null" role="img" style="background-image:url(https://example.com/wrong.png)"></div>')
    const result = await convertTheBriefHtml(html)
    const image = result.canvasData.custom_300x250.layers.find(l => l.type === 'image')
    expect(image).toMatchObject({ src: './media/photo.jpg', fit: 'cover', w: 200, h: 80 })
    expect(image.keyframes.x.map(frame => frame.value)).toEqual([-100, 0])
    const bootHidden = html.replace('id="designContainer"', 'id="designContainer" style="visibility:hidden"')
    const bootResult = await convertTheBriefHtml(bootHidden)
    expect(bootResult.canvasData.custom_300x250.layers.find(l => l.type === 'image').src).toBe('./media/photo.jpg')
    await expect(convertTheBriefHtml(bootHidden.replace('background-size:cover', 'visibility:hidden;background-size:cover'))).rejects.toThrow(/legacy image/)
    await expect(convertTheBriefHtml(bootHidden.replace(content, `<div style="visibility:hidden">${content}</div>`))).rejects.toThrow(/legacy image/)
    await expect(convertTheBriefHtml(html.replace(content, content + content))).rejects.toThrow(/legacy image/)
    await expect(convertTheBriefHtml(html.replace('background-size:cover', 'background-size:contain'))).rejects.toThrow(/legacy image/)
    await expect(convertTheBriefHtml(html.replace('width:100%;height:100%;background-image', 'width:50%;height:100%;background-image'))).rejects.toThrow(/legacy image/)
    for (const css of ['margin-left:10px', 'padding:5px', 'left:4px', 'border:1px solid red', 'border-radius:10px', 'opacity:0.5', 'filter:blur(2px)', 'background-blend-mode:multiply', 'display:none', 'visibility:hidden']) {
      await expect(convertTheBriefHtml(html.replace('background-size:cover', `${css};background-size:cover`))).rejects.toThrow(/legacy image/)
    }
    await expect(convertTheBriefHtml(html.replace('./media/photo.jpg', 'https://example.com/photo.jpg'))).rejects.toThrow(/local asset/)
  })

  it('resolves legacy shape fills without borrowing another layer content or dropping hidden styling', async () => {
    const content = '<div id="c-null" role="img" style="width:100%;height:100%;background:linear-gradient(90deg, #00348b 0%, #001e50 100%)"></div>'
    const html = source.replace('data-eltype="text"', 'data-eltype="shape"').replace('<div class="row">Hello world</div>', content)
      .replace('<div id="designContainer">', '<div id="designContainer"><div id="c-null" role="img" style="background:red"></div>')
    const result = await convertTheBriefHtml(html)
    const shape = result.canvasData.custom_300x250.layers.find(l => l.type === 'rect')
    expect(shape.fillColor).toContain('linear-gradient')
    expect(shape.keyframes.x.map(frame => frame.value)).toEqual([-100, 0])
    await expect(convertTheBriefHtml(html.replace(content, content + content))).rejects.toThrow(/legacy shape/)
    await expect(convertTheBriefHtml(html.replace('height:100%;background:', 'height:100%;visibility:hidden;background:'))).rejects.toThrow(/legacy shape/)
    const rounded = await convertTheBriefHtml(html.replace('height:100%;background:', 'height:100%;border-radius:5px;background:'))
    expect(rounded.canvasData.custom_300x250.layers.find(l => l.type === 'rect').borderRadius).toBe(5)
    await expect(convertTheBriefHtml(html.replace('height:100%;background:', 'height:100%;border-radius:5px 10px;background:'))).rejects.toThrow(/legacy shape/)
  })
})

it('normalises unitless zero shadow offsets while rejecting unsupported shadow syntax', async () => {
  const withShadow = (shadow: string) => source.replace('.row{', `.row{text-shadow:${shadow};`)
  const result = await convertTheBriefHtml(withShadow('0 0 24px #ff8bbf'))
  expect(result.canvasData.custom_300x250.layers.find(l => l.type === 'text').textShadow).toBe('0px 0px 24px #ff8bbf')
  await expect(convertTheBriefHtml(withShadow('0 0 24px #ff8bbf, 0 0 2px #fff'))).rejects.toThrow('Unsupported text shadow')
})
