import { parse } from 'acorn'
import { Window } from 'happy-dom'

function literal(node, depth = 0) {
  if (!node || depth > 40) throw new Error('Unsupported design literal')
  if (node.type === 'Literal' && !node.regex && !node.bigint) return node.value
  if (node.type === 'ArrayExpression') return node.elements.map(value => literal(value, depth + 1))
  if (node.type === 'ObjectExpression') {
    const result = Object.create(null)
    for (const property of node.properties) {
      if (property.type !== 'Property' || property.kind !== 'init' || property.computed || property.method) throw new Error('Unsupported design literal property')
      const key = property.key.name ?? property.key.value
      if (['__proto__', 'constructor', 'prototype'].includes(key) || key in result) throw new Error('Unsafe design literal key')
      result[key] = literal(property.value, depth + 1)
    }
    return result
  }
  if (node.type === 'UnaryExpression' && ['!', '-', '+'].includes(node.operator)) {
    const value = literal(node.argument, depth + 1)
    if (node.operator === '!') return !value
    if (typeof value !== 'number') throw new Error('Unsupported numeric literal')
    return node.operator === '-' ? -value : value
  }
  throw new Error(`Unsupported design literal: ${node.type}`)
}

function sourceData(document) {
  let data
  for (const script of document.querySelectorAll('script:not([src])')) {
    if (!script.textContent.includes('window.creatopyEmbed')) continue
    const ast = parse(script.textContent, { ecmaVersion: 2022 })
    for (const statement of ast.body) {
      const exp = statement.expression
      if (exp?.type === 'AssignmentExpression' && exp.operator === '=' && exp.left.type === 'MemberExpression'
        && !exp.left.computed && exp.left.object.name === 'window' && exp.left.property.name === 'creatopyEmbed') {
        if (data) throw new Error('Ambiguous design data')
        data = literal(exp.right).designData
      }
    }
  }
  if (!data) throw new Error('No supported TheBrief design data found')
  return data
}

const px = value => /^-?[\d.]+px$/.test(value) ? Number.parseFloat(value) : Number.NaN
function seconds(value) {
  if (!/^-?(?:\d*\.)?\d+(?:ms|s)$/.test(value)) throw new Error(`Unsupported animation time: ${value}`)
  // This export uses -1ms as its zero-delay sentinel.
  return value === '-1ms' ? 0 : Number.parseFloat(value) / (value.endsWith('ms') ? 1000 : 1)
}

function localAsset(value) {
  const path = value.replace(/^\.\//, '')
  if (!path || /[\\:%?#]/.test(path) || path.startsWith('/') || path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Only package-local assets are supported')
  return `./${path}`
}

function transformValues(text) {
  const values = {}
  const parts = [...text.matchAll(/(translateX|translateY|rotate|scaleX|scaleY)\(([^)]+)\)/g)]
  if (text.replace(/(translateX|translateY|rotate|scaleX|scaleY)\([^)]+\)/g, '').trim()) throw new Error(`Unsupported transform ${text}`)
  for (const [, name, raw] of parts) {
    const unit = name === 'rotate' ? 'deg' : name.startsWith('translate') ? 'px' : ''
    if (!new RegExp(`^-?(?:\\d*\\.)?\\d+(?:${unit})?$`).test(raw)) throw new Error(`Unsupported transform ${text}`)
    const prop = { translateX: 'x', translateY: 'y', rotate: 'rotation', scaleX: 'scaleX', scaleY: 'scaleY' }[name]
    if (prop in values) throw new Error('Repeated transform function')
    values[prop] = Number.parseFloat(raw)
  }
  return values
}

function effectTracks(effect, style, rules, start, end, warnings) {
  if (!effect) return {}
  const css = style(effect)
  const rule = rules.find(r => r.name === css.animationName)
  if (!rule) throw new Error(`Missing animation ${css.animationName}`)
  if (!['1', ''].includes(css.animationIterationCount) || !['normal', ''].includes(css.animationDirection)) throw new Error('Unsupported repeated/reversed animation')
  const at = start + seconds(css.animationDelay || '0s')
  const duration = seconds(css.animationDuration)
  if (at >= end) {
    warnings.push(`${effect.id}: effect starts after the slide loop and is not visible`)
    return {}
  }
  if (at < 0 || at + duration > end) throw new Error('Animation crosses slide boundary')
  const tracks = {}
  for (const frame of rule.cssRules) {
    if (!/^(?:from|to|(?:\d*\.)?\d+%)$/.test(frame.keyText)) throw new Error('Unsupported combined keyframe selector')
    const fraction = frame.keyText === 'from' ? 0 : frame.keyText === 'to' ? 1 : Number.parseFloat(frame.keyText) / 100
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new Error('Unsupported keyframe selector')
    const properties = Array.from({ length: frame.style.length }, (_, index) => frame.style.item(index))
    if (properties.some(p => !['transform', 'opacity'].includes(p))) throw new Error(`Unsupported animated properties: ${properties.join(', ')}`)
    const values = transformValues(frame.style.transform || '')
    if (frame.style.opacity !== '') values.opacity = Number(frame.style.opacity)
    for (const [property, value] of Object.entries(values)) {
      if (!Number.isFinite(value)) throw new Error('Invalid keyframe value')
      ;(tracks[property] ||= []).push({ time: at + fraction * duration, value, ...(fraction < 1 ? { easing: css.animationTimingFunction || 'linear' } : {}) })
    }
  }
  for (const frames of Object.values(tracks)) {
    frames.sort((a, b) => a.time - b.time)
    if (frames.length < 2 || frames[0].time !== at || frames.at(-1).time !== at + duration) throw new Error('Keyframes need explicit start and end values')
  }
  return tracks
}

/** Offline single-slide CSS export adapter. Source scripts are parsed, never run. */
export async function convertTheBriefHtml(html) {
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw new Error('HTML exceeds pilot limit')
  const window = new Window({ settings: { enableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true } })
  try {
    window.document.write(html)
    const document = window.document
    const source = sourceData(document)
    if (source.animations?.length !== 1 || source.animations[0].type !== 'slide' || source.customAnimations?.length) throw new Error('Pilot supports single-slide exports without custom animations')
    const slide = source.animations[0]
    if (slide.effInDuration || slide.effOutDuration || slide.stop) throw new Error('Slide transitions/stop are not supported')
    const duration = slide.duration / 1000
    if (!(duration > 0 && duration <= 60) || !Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width <= 0 || source.height <= 0 || source.width > 4096 || source.height > 4096) throw new Error('Invalid dimensions or duration')
    const style = element => window.getComputedStyle(element)
    const root = document.getElementById('designContainer')
    if (!root) throw new Error('Missing design container')
    const elements = [...root.querySelectorAll('[data-eltype][id^="element-"]')]
    if (elements.length > 100) throw new Error('Too many elements')
    const rules = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules].filter(rule => rule.type === 7))
    const warnings = [source.loopCount === 0
      ? 'Infinite loop retained as provenance; editor/export loop settings still need integration'
      : 'Finite loop count is retained as provenance only; native playback loop settings need review']
    if (source.hasClickTag || document.querySelector('a[href], [onclick]')) warnings.push('Click destinations are not migrated by this pilot')
    const layers = []
    const sourceElements = []
    let id = 1
    const holdOpacity = (start, end) => [{ time: start, value: 1, easing: 'linear' }, { time: end, value: 1 }]
    const base = { opacity: 1, animIn: 'none', animOut: 'none', animInDur: 0, startTime: 0, endTime: duration, keyframes: { opacity: holdOpacity(0, duration) } }
    const background = style(root).background || '#ffffff'
    layers.push({ ...base, id: id++, type: 'bg', name: 'Background', x: 0, y: 0, w: source.width, h: source.height, zIndex: 0, bgColor: background })
    for (const element of elements) {
      const css = style(element)
      const sourceId = Number(element.id.replace('element-', ''))
      const timing = slide.elements.find(item => item.id === sourceId) || {}
      const start = (timing.from || 0) / 1000
      const end = Math.min(duration, timing.duration === undefined ? duration : start + timing.duration / 1000)
      if (!(start >= 0 && end > start)) throw new Error('Invalid element presence')
      if (end !== duration) throw new Error('Elements ending before the loop need a visibility adapter')
      const layerBase = { ...base, x: px(css.left), y: px(css.top), w: px(css.width), h: px(css.height), zIndex: id, startTime: start, endTime: end }
      if ([layerBase.x, layerBase.y, layerBase.w, layerBase.h].some(n => !Number.isFinite(n))) throw new Error('Unsupported element geometry')
      if (css.mixBlendMode && css.mixBlendMode !== 'normal') {
        if (/^(multiply|screen|overlay|darken|lighten|color-dodge|color-burn|hard-light|soft-light|difference|exclusion|hue|saturation|color|luminosity)$/.test(css.mixBlendMode)) layerBase.mixBlendMode = css.mixBlendMode
        else warnings.push(`${element.id}: unsupported native blend mode ${css.mixBlendMode}`)
      }
      let keyframes = {}
      try {
        keyframes = effectTracks(document.getElementById(`effIn${sourceId}`), style, rules, start, end, warnings)
        const exit = document.getElementById(`effOut${sourceId}`)
        if (exit) {
          const exitStart = start + seconds(style(exit).animationDelay || '0s')
          if (exitStart >= duration) warnings.push(`${exit.id}: exit at ${exitStart}s is outside the ${duration}s loop`)
          else throw new Error('Visible exit animation needs an adapter')
        }
      } catch (error) {
        warnings.push(`${element.id}: ${error.message}; animation not converted`)
        keyframes = {}
      }
      // Explicit holds avoid Banner Studio's default entrance/exit fades and
      // preserve the full source duration when the entrance finishes early.
      if (!keyframes.opacity) keyframes.opacity = holdOpacity(start, end)
      else if (keyframes.opacity.at(-1).time < end) keyframes.opacity.push({ time: end, value: keyframes.opacity.at(-1).value, easing: 'linear' })
      layerBase.keyframes = keyframes
      const extraEffects = [...element.querySelectorAll('[id^=eff]')].filter(node => ![`effIn${sourceId}`, `effOut${sourceId}`].includes(node.id))
      if (extraEffects.length) warnings.push(`${element.id}: additional effects are not converted: ${extraEffects.map(node => node.id).join(', ')}`)
      const before = layers.length
      const type = element.getAttribute('data-eltype')
      if (type === 'text') {
        const rows = [...element.querySelectorAll('.row')]
        if (!rows.length) throw new Error('Unsupported text layout')
        let y = layerBase.y
        for (const row of rows) {
          const rowCss = style(row)
          const span = [...row.querySelectorAll('span')].find(item => item.textContent.trim()) || row
          const textCss = style(span)
          const runs = [...row.querySelectorAll('span')].filter(item => item.textContent.trim())
          const signature = node => ['fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'color', 'letterSpacing'].map(key => style(node)[key]).join('|')
          if (new Set(runs.map(signature)).size > 1) throw new Error('Mixed styled text within a line needs an adapter')
          const fontSize = px(textCss.fontSize)
          const lineBoxFontSize = Math.max(fontSize, ...[...row.querySelectorAll('span')].map(item => px(style(item).fontSize)))
          const lineHeight = /^\d*\.?\d+$/.test(rowCss.lineHeight) ? Number(rowCss.lineHeight) : px(rowCss.lineHeight) / fontSize
          const height = lineBoxFontSize * lineHeight
          if (!Number.isFinite(height)) throw new Error('Unsupported text line height')
          if (row.textContent.trim()) layers.push({ ...layerBase, id: id++, type: 'text', name: row.textContent.trim().slice(0, 60), y, h: height, text: row.textContent.trim(), fontFamily: textCss.fontFamily.replace(/["']/g, ''), fontSize, lineBoxFontSize, textAntialias: style(document.documentElement).getPropertyValue('-webkit-font-smoothing') === 'antialiased', fontWeight: Number(textCss.fontWeight) || 400, lineHeight, color: textCss.color, textAlign: textCss.textAlign || 'left', letterSpacing: textCss.letterSpacing === 'normal' ? '0px' : textCss.letterSpacing })
          y += height
        }
        if (new Set(rows.map(row => style(row).fontSize)).size > 1) warnings.push(`${element.id}: mixed-size text split into editable lines; baseline alignment needs visual review`)
      } else if (type === 'svg' || type === 'image') {
        const image = element.querySelector('img')
        const content = document.getElementById(`c-${sourceId}`)
        const raw = image?.getAttribute('src') || (content && style(content).backgroundImage.match(/^url\(["']?([^"')]+)["']?\)$/)?.[1])
        if (!raw) throw new Error('Missing local asset')
        const rotated = [...element.querySelectorAll('div')].map(div => style(div).transform).filter(t => t && t !== 'none')
        if (rotated.some(t => !/^rotate\(-?[\d.]+deg\)$/.test(t))) throw new Error('Unsupported static transform')
        layers.push({ ...layerBase, id: id++, type: 'image', name: `Artwork ${sourceId}`, src: localAsset(raw), fit: type === 'svg' ? 'fill' : 'cover', rotation: rotated.reduce((sum, t) => sum + Number.parseFloat(t.slice(7)), 0) })
      } else if (type === 'shape') {
        const content = document.getElementById(`c-${sourceId}`)
        layers.push({ ...layerBase, id: id++, type: 'rect', name: `Shape ${sourceId}`, fillColor: style(content).backgroundColor })
      } else {
        throw new Error(`Unsupported layer type: ${type}`)
      }
      sourceElements.push({ sourceId, type, nativeLayerIds: layers.slice(before).map(layer => layer.id), start, end })
    }
    return { schemaVersion: 1, adapter: 'thebrief-css-single-slide-pilot', fidelityVerified: false, source: { designHash: source.designHash || null, width: source.width, height: source.height, duration, loopCount: source.loopCount, elementCount: elements.length }, canvasData: { [`custom_${source.width}x${source.height}`]: { layers, bgColor: '#ffffff' } }, sourceElements, warnings }
  } finally {
    await window.happyDOM.close()
  }
}
