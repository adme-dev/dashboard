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

function fontManifest(document, warnings) {
  const rules = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules].filter(rule => rule.type === 5))
  if (rules.length > 32) throw new Error('Too many custom font faces')
  const fonts = rules.map((rule) => {
    const css = rule.style
    const family = css.fontFamily.replace(/^["']|["']$/g, '')
    if (!/^[\w -]{1,100}$/.test(family)) throw new Error('Unsupported custom font family')
    const weight = css.fontWeight === 'bold' ? 700 : css.fontWeight === 'normal' || !css.fontWeight ? 400 : Number(css.fontWeight)
    if (!Number.isInteger(weight) || weight < 1 || weight > 1000) throw new Error('Unsupported custom font weight')
    const fontStyle = css.fontStyle || 'normal'
    if (!['normal', 'italic', 'oblique'].includes(fontStyle)) throw new Error('Unsupported custom font style')
    const match = /^url\(["']?([^"')]+)["']?\)\s+format\(["'](truetype|opentype|woff2?)["']\)$/.exec(css.getPropertyValue('src').trim())
    if (!match) throw new Error('Unsupported custom font source')
    return { family, weight, style: fontStyle, format: match[2], path: localAsset(match[1]) }
  })
  if (fonts.length) warnings.push('Custom fonts require managed upload before studio fidelity review')
  for (const link of document.querySelectorAll('link[rel="stylesheet"][href]')) {
    const href = link.getAttribute('href') || ''
    if (/^https:\/\/fonts\.googleapis\.com\//i.test(href)) warnings.push('External font stylesheet requires review; font resources were not fetched')
    else warnings.push('External stylesheet is not converted; resources were not fetched')
  }
  return fonts
}

function transformValues(text) {
  const values = {}
  const pattern = /(translateX|translateY|rotate|scaleX|scaleY|scale)\(([^)]+)\)/g
  const parts = [...text.matchAll(pattern)]
  if (text.replace(pattern, '').trim()) throw new Error(`Unsupported transform ${text}`)
  let hasRotationOrScale = false
  let hasScale = false
  for (const [, name, raw] of parts) {
    const unit = name === 'rotate' ? 'deg' : name.startsWith('translate') ? 'px' : ''
    if (!new RegExp(`^-?(?:\\d*\\.)?\\d+(?:${unit})?$`).test(raw)) throw new Error(`Unsupported transform ${text}`)
    const value = Number.parseFloat(raw)
    // Native GSAP composes translation, then rotation, then scale. A translation
    // after a scale/rotation would require matrix-aware interpolation, not just
    // multiplying endpoint coordinates (which changes the path between them).
    if (name.startsWith('translate') && value !== 0 && hasRotationOrScale) throw new Error('Unsupported ordered translation after rotation/scale')
    if (name === 'rotate' && hasScale) throw new Error('Unsupported rotation after scale')
    if (name === 'rotate' || name.startsWith('scale')) hasRotationOrScale = true
    if (name.startsWith('scale')) hasScale = true
    const properties = name === 'scale' ? ['scaleX', 'scaleY'] : [{ translateX: 'x', translateY: 'y', rotate: 'rotation', scaleX: 'scaleX', scaleY: 'scaleY' }[name]]
    for (const property of properties) {
      if (property in values) throw new Error('Repeated transform function')
      values[property] = value
    }
  }
  return values
}

function originPixels(text, width, height) {
  let tokens = (text || '50% 50%').trim().split(/\s+/)
  if (tokens.length === 1) tokens = ['top', 'bottom'].includes(tokens[0]) ? ['center', tokens[0]] : [tokens[0], 'center']
  if (tokens.length !== 2) throw new Error(`Unsupported transform origin ${text}`)
  if (['top', 'bottom'].includes(tokens[0]) || ['left', 'right'].includes(tokens[1])) tokens.reverse()
  const axis = (token, size, keywords) => {
    if (Object.hasOwn(keywords, token)) return keywords[token] * size
    if (/^-?(?:\d*\.)?\d+%$/.test(token)) return Number.parseFloat(token) / 100 * size
    if (/^-?(?:\d*\.)?\d+px$/.test(token) || token === '0') return Number.parseFloat(token)
    throw new Error(`Unsupported transform origin ${text}`)
  }
  return { x: axis(tokens[0], width, { left: 0, center: 0.5, right: 1 }), y: axis(tokens[1], height, { top: 0, center: 0.5, bottom: 1 }) }
}

function effectTracks(effect, style, rules, start, end, warnings, geometry) {
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
  const parsedFrames = []
  let transformOrigin
  for (const frame of rule.cssRules) {
    if (!/^(?:from|to|(?:\d*\.)?\d+%)$/.test(frame.keyText)) throw new Error('Unsupported combined keyframe selector')
    const fraction = frame.keyText === 'from' ? 0 : frame.keyText === 'to' ? 1 : Number.parseFloat(frame.keyText) / 100
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new Error('Unsupported keyframe selector')
    const properties = Array.from({ length: frame.style.length }, (_, index) => frame.style.item(index))
    if (properties.some(p => !['transform', 'transform-origin', 'opacity'].includes(p))) throw new Error(`Unsupported animated properties: ${properties.join(', ')}`)
    const values = transformValues(frame.style.transform || '')
    if (frame.style.opacity !== '') values.opacity = Number(frame.style.opacity)
    if (fraction === 0 || fraction === 1 || frame.style.transformOrigin) {
      const origin = originPixels(frame.style.transformOrigin || css.transformOrigin, geometry.w, geometry.h)
      if (transformOrigin && (origin.x !== transformOrigin.x || origin.y !== transformOrigin.y)) throw new Error('Changing transform origins need an adapter')
      transformOrigin = origin
    }
    parsedFrames.push({ fraction, values, hasTransform: Boolean(frame.style.transform) })
  }
  const transformProperties = new Set(parsedFrames.flatMap(frame => Object.keys(frame.values).filter(key => key !== 'opacity')))
  if (['scaleX', 'scaleY', 'rotation'].some(property => transformProperties.has(property))) {
    if ((css.width !== '100%' && px(css.width) !== geometry.w) || (css.height !== '100%' && px(css.height) !== geometry.h)) throw new Error('Unsupported effect geometry for transform origin')
  }
  for (const { fraction, values, hasTransform } of parsedFrames) {
    // CSS pads missing transform functions with identity values (e.g. the
    // observed scale(8) translateX(0) -> scale(1) export).
    if (hasTransform) for (const property of transformProperties) values[property] ??= property.startsWith('scale') ? 1 : 0
    for (const [property, value] of Object.entries(values)) {
      if (!Number.isFinite(value)) throw new Error('Invalid keyframe value')
      ;(tracks[property] ||= []).push({ time: at + fraction * duration, value, ...(fraction < 1 ? { easing: css.animationTimingFunction || 'linear' } : {}) })
    }
  }
  for (const frames of Object.values(tracks)) {
    frames.sort((a, b) => a.time - b.time)
    if (frames.length < 2 || frames[0].time !== at || frames.at(-1).time !== at + duration) throw new Error('Keyframes need explicit start and end values')
  }
  return { tracks, transformOrigin }
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
    if (!Number.isInteger(source.loopCount) || source.loopCount < 0 || source.loopCount > 1000) throw new Error('Unsupported source loop count')
    const warnings = []
    const fonts = fontManifest(document, warnings)
    if (source.hasClickTag || document.querySelector('a[href], [onclick]')) warnings.push('Click destinations are not migrated by this pilot')
    const layers = []
    const sourceElements = []
    let id = 1
    const holdOpacity = (start, end) => [{ time: start, value: 1, easing: 'linear' }, { time: end, value: 1 }]
    const base = { opacity: 1, animIn: 'none', animOut: 'none', animInDur: 0, startTime: 0, endTime: duration, keyframes: { opacity: holdOpacity(0, duration) } }
    const rootCss = style(root)
    const imageBackground = rootCss.backgroundImage && !['none', 'initial'].includes(rootCss.backgroundImage) ? rootCss.backgroundImage : ''
    let rootImage = {}
    if (imageBackground && !/gradient\(/.test(imageBackground)) {
      const match = /^url\(["']?([^"')]+)["']?\)$/.exec(imageBackground)
      if (!match) throw new Error('Unsupported canvas background image')
      if (!['cover', 'contain'].includes(rootCss.backgroundSize) || !['50% 50%', 'center center', 'center'].includes(rootCss.backgroundPosition)) throw new Error('Unsupported canvas background fit/position')
      rootImage = { src: localAsset(match[1]), fit: rootCss.backgroundSize }
    }
    const background = rootImage.src ? (rootCss.backgroundColor || 'transparent') : (rootCss.background || imageBackground || rootCss.backgroundColor || 'transparent')
    layers.push({ ...base, id: id++, type: 'bg', name: 'Background', ...rootImage, x: 0, y: 0, w: source.width, h: source.height, zIndex: 0, bgColor: background })
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
        const effect = effectTracks(document.getElementById(`effIn${sourceId}`), style, rules, start, end, warnings, layerBase)
        keyframes = effect.tracks || {}
        if (effect.transformOrigin) layerBase.transformOrigin = effect.transformOrigin
        const exit = document.getElementById(`effOut${sourceId}`)
        if (exit) {
          const exitStart = start + seconds(style(exit).animationDelay || '0s')
          if (exitStart >= duration) warnings.push(`${exit.id}: exit at ${exitStart}s is outside the ${duration}s loop`)
          else throw new Error('Visible exit animation needs an adapter')
        }
      } catch (error) {
        warnings.push(`${element.id}: ${error.message}; animation not converted`)
        keyframes = {}
        delete layerBase.transformOrigin
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
          const textTransform = textCss.textTransform || rowCss.textTransform || 'none'
          if (!['none', 'uppercase', 'lowercase', 'capitalize'].includes(textTransform)) throw new Error('Unsupported text transform')
          if (textCss.fontStyle && textCss.fontStyle !== 'normal') warnings.push(`${element.id}: ${textCss.fontStyle} text is not preserved by native export`)
          const runs = [...row.querySelectorAll('span')].filter(item => item.textContent.trim())
          const signature = node => ['fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'color', 'letterSpacing'].map(key => style(node)[key]).join('|')
          if (new Set(runs.map(signature)).size > 1) throw new Error('Mixed styled text within a line needs an adapter')
          const fontSize = px(textCss.fontSize)
          const lineBoxFontSize = Math.max(fontSize, ...[...row.querySelectorAll('span')].map(item => px(style(item).fontSize)))
          const lineHeight = /^\d*\.?\d+$/.test(rowCss.lineHeight) ? Number(rowCss.lineHeight) : px(rowCss.lineHeight) / fontSize
          const height = lineBoxFontSize * lineHeight
          if (!Number.isFinite(height)) throw new Error('Unsupported text line height')
          if (row.textContent.trim()) layers.push({ ...layerBase, id: id++, type: 'text', name: row.textContent.trim().slice(0, 60), y, h: height, ...(layerBase.transformOrigin ? { transformOrigin: { x: layerBase.transformOrigin.x, y: layerBase.transformOrigin.y - (y - layerBase.y) } } : {}), text: row.textContent.trim(), textTransform, fontFamily: textCss.fontFamily.replace(/["']/g, ''), fontSize, lineBoxFontSize, textAntialias: style(document.documentElement).getPropertyValue('-webkit-font-smoothing') === 'antialiased', fontWeight: Number(textCss.fontWeight) || 400, lineHeight, color: textCss.color, textAlign: textCss.textAlign || 'left', letterSpacing: textCss.letterSpacing === 'normal' ? '0px' : textCss.letterSpacing })
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
        const transforms = [...element.querySelectorAll('div')].map(div => style(div).transform).filter(t => t && t !== 'none')
        if (transforms.some(t => !/^rotate\(-?[\d.]+deg\)$/.test(t))) throw new Error('Unsupported static shape transform')
        const rotation = transforms.reduce((sum, t) => sum + Number.parseFloat(t.slice(7)), 0)
        const contentCss = style(content)
        const radii = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map(key => contentCss[key] || '0px')
        let borderRadius
        if (new Set(radii).size === 1 && Number.isFinite(px(radii[0])) && px(radii[0]) >= 0) borderRadius = px(radii[0])
        else warnings.push(`${element.id}: unequal or non-pixel corner radii are not converted`)
        if (rotation && (keyframes.scaleX || keyframes.scaleY || keyframes.rotation)) throw new Error('Nested static rotation with animated scale/rotation needs an adapter')
        layers.push({ ...layerBase, id: id++, type: 'rect', name: `Shape ${sourceId}`, rotation, ...(borderRadius !== undefined ? { borderRadius } : {}), fillColor: style(content).backgroundColor })
      } else {
        throw new Error(`Unsupported layer type: ${type}`)
      }
      sourceElements.push({ sourceId, type, nativeLayerIds: layers.slice(before).map(layer => layer.id), start, end })
    }
    return { schemaVersion: 1, adapter: 'thebrief-css-single-slide-pilot', fidelityVerified: false, fonts, source: { designHash: source.designHash || null, width: source.width, height: source.height, duration, loopCount: source.loopCount, elementCount: elements.length }, canvasData: { [`custom_${source.width}x${source.height}`]: { playback: { duration, loopCount: source.loopCount }, layers, bgColor: background } }, sourceElements, warnings }
  } finally {
    await window.happyDOM.close()
  }
}
