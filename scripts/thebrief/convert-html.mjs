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

// Older exports reuse c-null across unrelated layers. Keep resolution within
// the owning element and reject styling the native layer cannot reproduce.
function legacyLayerContent(element, style, kind) {
  const candidates = [...element.querySelectorAll('[id="c-null"][role="img"]')]
    .filter(node => node.closest('[data-eltype]') === element)
  if (candidates.length !== 1) throw new Error(`Missing or ambiguous legacy ${kind} content`)
  const content = candidates[0]
  // The export hides its canvas until the player starts. Reveal only that
  // bootstrap root while checking, preserving hidden intermediate wrappers.
  const canvas = element.closest('#designContainer')
  if (!canvas) throw new Error('Legacy content is outside the source canvas')
  const visibilityValue = canvas.style.getPropertyValue('visibility')
  const visibilityPriority = canvas.style.getPropertyPriority('visibility')
  let contentVisibility
  try {
    canvas.style.setProperty('visibility', 'visible')
    contentVisibility = style(content).visibility
  } finally {
    if (visibilityValue) canvas.style.setProperty('visibility', visibilityValue, visibilityPriority)
    else canvas.style.removeProperty('visibility')
  }
  const legacy = style(content)
  const sides = ['Top', 'Right', 'Bottom', 'Left']
  const corners = ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight']
  const radii = corners.map(corner => px(legacy[`border${corner}Radius`] || '0px'))
  if (content.children.length || legacy.width !== '100%' || legacy.height !== '100%'
    || !['', 'block'].includes(legacy.display) || !['', 'visible'].includes(contentVisibility)
    || (kind === 'image' && (legacy.backgroundSize !== 'cover' || legacy.backgroundPosition !== '50% 50%' || legacy.backgroundRepeat !== 'no-repeat'))
    || sides.some(side => px(legacy[`border${side}Width`] || '0px') !== 0)
    || sides.some(side => px(legacy[`padding${side}`] || '0px') !== 0 || px(legacy[`margin${side}`] || '0px') !== 0)
    || ['top', 'right', 'bottom', 'left'].some(side => !['', 'auto', '0px'].includes(legacy[side]))
    || radii.some(radius => !Number.isFinite(radius) || radius < 0) || new Set(radii).size !== 1
    || (kind === 'image' && radii.some(radius => radius !== 0))
    || (kind === 'image' && !['', 'transparent', 'rgba(0, 0, 0, 0)'].includes(legacy.backgroundColor))
    || !['', '1'].includes(legacy.opacity) || !['', 'none'].includes(legacy.filter)
    || !['', 'none'].includes(legacy.transform) || !['', 'none'].includes(legacy.boxShadow)
    || !['', 'none'].includes(legacy.clipPath) || !['', 'none'].includes(legacy.getPropertyValue('mask-image'))
    || !['', 'normal'].includes(legacy.mixBlendMode)
    || !['', 'normal'].includes(legacy.getPropertyValue('background-blend-mode'))) {
    throw new Error(`Unsupported legacy ${kind} composition`)
  }
  return content
}

function fontManifest(document, warnings) {
  const rules = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules].filter(rule => rule.type === 5))
  if (rules.length > 32) throw new Error('Too many custom font faces')
  const fonts = rules.map((rule) => {
    const css = rule.style
    const family = css.fontFamily.replace(/^["']|["']$/g, '')
    // TheBrief namespaces some uploaded families with a slash. Package creation
    // assigns these a safe managed alias before native data can be imported.
    if (!/^[\w /-]{1,100}$/.test(family)) throw new Error('Unsupported custom font family')
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

function cssEase(value) {
  return ({ 'ease': 'cubic-bezier(0.25,0.1,0.25,1)', 'ease-in': 'cubic-bezier(0.42,0,1,1)', 'ease-out': 'cubic-bezier(0,0,0.58,1)', 'ease-in-out': 'cubic-bezier(0.42,0,0.58,1)' })[value] || value || 'linear'
}

function reverseEase(value) {
  if (value === 'linear') return value
  const match = /^cubic-bezier\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)$/.exec(value)
  if (!match) throw new Error('Unsupported reversed easing')
  const [, x1, y1, x2, y2] = match.map(Number)
  const n = value => Number(value.toFixed(9))
  return `cubic-bezier(${n(1 - x2)},${n(1 - y2)},${n(1 - x1)},${n(1 - y1)})`
}

const identityValue = property => property === 'opacity' || property.startsWith('scale') ? 1 : 0
const sameTime = (a, b) => Math.abs(a - b) < 1e-9

// Only sequential wrappers that settle back to identity can share a native
// transform. Overlapping/nested transforms need matrix-aware composition.
function appendEffect(current, effect, start) {
  if (!effect.tracks || !Object.keys(effect.tracks).length) return current
  const at = Math.min(...Object.values(effect.tracks).map(frames => frames[0].time))
  if (Object.entries(current.tracks || {}).some(([property, frames]) => frames.at(-1).time > at + 1e-9 || frames.at(-1).value !== identityValue(property))) throw new Error('Overlapping or unsettled nested effects need an adapter')
  const pivot = effect.transformOrigin || current.transformOrigin
  if (effect.transformOrigin && current.transformOrigin && (effect.transformOrigin.x !== current.transformOrigin.x || effect.transformOrigin.y !== current.transformOrigin.y)) throw new Error('Nested effects with different origins need an adapter')
  const tracks = structuredClone(current.tracks || {})
  for (const [property, frames] of Object.entries(effect.tracks)) {
    if (frames[0].value !== identityValue(property)) throw new Error('Nested effect must begin at identity')
    const previous = tracks[property] || [{ time: start, value: identityValue(property), easing: 'linear' }]
    previous.at(-1).easing = 'linear'
    if (sameTime(previous.at(-1).time, frames[0].time)) previous.pop()
    tracks[property] = [...previous, ...frames]
    if (tracks[property].length > 500) throw new Error('Too many effect keyframes')
  }
  return { tracks, transformOrigin: pivot }
}

function effectTracks(effect, style, rules, start, end, warnings, geometry, intermediate = false) {
  if (!effect) return {}
  const css = style(effect)
  const at = start + seconds(css.animationDelay || '0s')
  const duration = seconds(css.animationDuration)
  if (at >= end) {
    warnings.push(`${effect.id}: effect starts after the slide loop and is not visible`)
    return {}
  }
  const rule = rules.findLast(r => r.name === css.animationName)
  if (!rule) throw new Error(`Missing animation ${css.animationName}`)
  const iterations = Number(css.animationIterationCount || 1)
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 50 || !['normal', 'reverse', ''].includes(css.animationDirection)) throw new Error('Unsupported repeated/reversed animation')
  if (at < 0 || duration <= 0 || at + duration * iterations > end + 1e-9) throw new Error('Animation crosses slide boundary')
  if ((intermediate || iterations > 1) && ((!['', 'none'].includes(css.transform)) || !['', '1'].includes(css.opacity))) throw new Error('Intermediate effect has nonidentity underlying styles')
  const tracks = {}
  const parsedFrames = []
  let transformOrigin
  for (const frame of rule.cssRules) {
    const selectors = frame.keyText.split(',').map(selector => selector.trim())
    if (selectors.length > 50 || selectors.some(selector => !/^(?:from|to|(?:\d*\.)?\d+%)$/.test(selector))) throw new Error('Unsupported keyframe selector')
    const fractions = selectors.map(selector => selector === 'from' ? 0 : selector === 'to' ? 1 : Number.parseFloat(selector) / 100)
    if (fractions.some(fraction => !Number.isFinite(fraction) || fraction < 0 || fraction > 1)) throw new Error('Unsupported keyframe selector')
    const properties = Array.from({ length: frame.style.length }, (_, index) => frame.style.item(index))
    if (properties.some(p => !['transform', 'transform-origin', 'opacity', 'animation-timing-function'].includes(p))) throw new Error(`Unsupported animated properties: ${properties.join(', ')}`)
    const values = transformValues(frame.style.transform || '')
    if (frame.style.opacity !== '') values.opacity = Number(frame.style.opacity)
    if (fractions.includes(0) || fractions.includes(1) || frame.style.transformOrigin) {
      const origin = originPixels(frame.style.transformOrigin || css.transformOrigin, geometry.w, geometry.h)
      if (transformOrigin && (origin.x !== transformOrigin.x || origin.y !== transformOrigin.y)) throw new Error('Changing transform origins need an adapter')
      transformOrigin = origin
    }
    for (const fraction of fractions) parsedFrames.push({ fraction, values: { ...values }, hasTransform: Boolean(frame.style.transform), easing: cssEase(frame.style.animationTimingFunction || css.animationTimingFunction) })
  }
  const transformProperties = new Set(parsedFrames.flatMap(frame => Object.keys(frame.values).filter(key => key !== 'opacity')))
  if (['scaleX', 'scaleY', 'rotation'].some(property => transformProperties.has(property))) {
    if ((css.width !== '100%' && px(css.width) !== geometry.w) || (css.height !== '100%' && px(css.height) !== geometry.h)) throw new Error('Unsupported effect geometry for transform origin')
  }
  for (const { fraction, values, hasTransform, easing } of parsedFrames) {
    // CSS pads missing transform functions with identity values (e.g. the
    // observed scale(8) translateX(0) -> scale(1) export).
    if (hasTransform) for (const property of transformProperties) values[property] ??= property.startsWith('scale') ? 1 : 0
    for (const [property, value] of Object.entries(values)) {
      if (!Number.isFinite(value)) throw new Error('Invalid keyframe value')
      ;(tracks[property] ||= []).push({ time: Number((at + fraction * duration).toFixed(9)), value, ...(fraction < 1 ? { easing } : {}) })
    }
  }
  for (const [property, frames] of Object.entries(tracks)) {
    frames.sort((a, b) => a.time - b.time)
    if (new Set(frames.map(frame => frame.time)).size !== frames.length) throw new Error('Duplicate keyframe offsets need a cascade adapter')
    if (intermediate || iterations > 1) {
      if (!sameTime(frames[0].time, at)) frames.unshift({ time: at, value: identityValue(property), easing: cssEase(css.animationTimingFunction) })
      if (!sameTime(frames.at(-1).time, at + duration)) frames.push({ time: at + duration, value: identityValue(property) })
      if (frames[0].value !== identityValue(property) || frames.at(-1).value !== identityValue(property)) throw new Error('Intermediate effect must return to identity')
    }
    if (frames.length < 2 || !sameTime(frames[0].time, at) || !sameTime(frames.at(-1).time, at + duration)) throw new Error('Keyframes need explicit start and end values')
    if (css.animationDirection === 'reverse') {
      const original = structuredClone(frames)
      frames.splice(0, frames.length, ...original.toReversed().map((frame, index) => ({
        time: Number((2 * at + duration - frame.time).toFixed(9)), value: frame.value,
        ...(index < original.length - 1 ? { easing: reverseEase(original[original.length - index - 2].easing || cssEase(css.animationTimingFunction)) } : {})
      })))
    }
    if (!intermediate && frames.at(-1).value !== identityValue(property) && !['forwards', 'both'].includes(css.animationFillMode)) throw new Error('Animation reset after completion needs an adapter')
    if (iterations > 1) {
      if (frames[0].value !== frames.at(-1).value) throw new Error('Repeated animation reset needs an adapter')
      const cycle = structuredClone(frames)
      for (let iteration = 1; iteration < iterations; iteration++) {
        // The shared identity boundary inherits the next cycle's easing.
        frames.at(-1).easing = cycle[0].easing
        frames.push(...cycle.slice(1).map(frame => ({ ...frame, time: Number((frame.time + iteration * duration).toFixed(9)) })))
      }
      if (frames.length > 500) throw new Error('Too many effect keyframes')
    }
  }
  return { tracks, transformOrigin }
}

/** Offline CSS export adapter for bounded, hard-cut slide sequences. Source scripts are parsed, never run. */
export async function convertTheBriefHtml(html) {
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw new Error('HTML exceeds pilot limit')
  const window = new Window({ settings: { enableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true } })
  try {
    window.document.write(html)
    const document = window.document
    const source = sourceData(document)
    if (!source.animations?.length || source.animations.length > 50 || source.customAnimations?.length) throw new Error('Unsupported slide sequence or custom animations')
    let duration = 0
    const slides = source.animations.map((slide) => {
      if (slide.type !== 'slide' || !Array.isArray(slide.elements)) throw new Error('Invalid slide metadata')
      // The source player schedules slide overlap from the effect durations.
      // Some exports retain a "cross" label after both durations become zero.
      const zeroDurationCross = slide.crossTypeOut === 'cross' && slide.effInDuration === 0 && slide.effOutDuration === 0
      if (slide.effInDuration || slide.effOutDuration || slide.stop || (slide.crossTypeOut && slide.crossTypeOut !== 'hide' && !zeroDurationCross)) throw new Error('Slide transitions/stop are not supported')
      if (!Number.isFinite(slide.duration) || slide.duration <= 0) throw new Error('Invalid slide duration')
      const start = duration
      duration += slide.duration / 1000
      return { ...slide, start, end: duration }
    })
    if (new Set(slides.map(slide => slide.id)).size !== slides.length) throw new Error('Duplicate slide identity')
    if (!(duration > 0 && duration <= 300) || !Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width <= 0 || source.height <= 0 || source.width > 4096 || source.height > 4096) throw new Error('Invalid dimensions or duration')
    const style = element => window.getComputedStyle(element)
    const root = document.getElementById('designContainer')
    if (!root) throw new Error('Missing design container')
    const elements = [...root.querySelectorAll('[data-eltype][id^="element-"]')]
    const slideByElement = new Map()
    for (const slide of slides) {
      const container = document.getElementById(`slide-${slide.id}`)
      if (!container || !root.contains(container)) throw new Error('Missing slide container')
      for (const element of container.querySelectorAll('[data-eltype][id^="element-"]')) {
        if (slideByElement.has(element)) throw new Error('Nested slide containers are unsupported')
        slideByElement.set(element, slide)
      }
    }
    if (elements.some(element => !slideByElement.has(element)) || new Set(elements.map(element => element.id)).size !== elements.length) throw new Error('Ambiguous element ownership')
    if (elements.length > 150) throw new Error('Too many elements')
    const rules = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules].filter(rule => rule.type === 7))
    if (!Number.isInteger(source.loopCount) || source.loopCount < 0 || source.loopCount > 1000) throw new Error('Unsupported source loop count')
    const warnings = []
    const fonts = fontManifest(document, warnings)
    const externalFontStylesheets = [...document.querySelectorAll('link[rel="stylesheet"][href]')].map(link => link.getAttribute('href')).filter(href => /^https:\/\/fonts\.googleapis\.com\//i.test(href))
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
    layers.push({ ...base, id: id++, type: 'bg', name: 'Background', linkId: 'source:background', ...rootImage, x: 0, y: 0, w: source.width, h: source.height, zIndex: 0, bgColor: background })
    for (const element of elements) {
      const css = style(element)
      const sourceId = Number(element.id.replace('element-', ''))
      const slide = slideByElement.get(element)
      const timing = slide.elements.find(item => item.id === sourceId) || {}
      const start = slide.start + (timing.from || 0) / 1000
      const end = Math.min(slide.end, timing.duration === undefined ? slide.end : start + timing.duration / 1000)
      if (!(start >= 0 && end > start)) throw new Error('Invalid element presence')
      const clipToPresence = slides.length > 1 || end < duration
      const layerBase = { ...base, linkId: `source:${sourceId}`, x: px(css.left), y: px(css.top), w: px(css.width), h: px(css.height), zIndex: id, startTime: start, endTime: end, ...(clipToPresence ? { clipToPresence: true } : {}) }
      if ([layerBase.x, layerBase.y, layerBase.w, layerBase.h].some(n => !Number.isFinite(n))) throw new Error('Unsupported element geometry')
      if (css.mixBlendMode && css.mixBlendMode !== 'normal') {
        if (/^(multiply|screen|overlay|darken|lighten|color-dodge|color-burn|hard-light|soft-light|difference|exclusion|hue|saturation|color|luminosity)$/.test(css.mixBlendMode)) layerBase.mixBlendMode = css.mixBlendMode
        else warnings.push(`${element.id}: unsupported native blend mode ${css.mixBlendMode}`)
      }
      let keyframes = {}
      try {
        let effect = effectTracks(document.getElementById(`effIn${sourceId}`), style, rules, start, end, warnings, layerBase)
        const middle = document.getElementById(`effMid${sourceId}`)
        if (middle) {
          try {
            effect = appendEffect(effect, effectTracks(middle, style, rules, start, end, warnings, layerBase, true), start)
          } catch (cause) {
            throw new Error(`${middle.id}: ${cause.message}`, { cause })
          }
        }
        const exit = document.getElementById(`effOut${sourceId}`)
        if (exit) {
          const exitStart = start + seconds(style(exit).animationDelay || '0s')
          if (exitStart >= end) warnings.push(`${exit.id}: exit at ${exitStart}s is outside the ${duration}s loop`)
          else effect = appendEffect(effect, effectTracks(exit, style, rules, start, end, warnings, layerBase), start)
        }
        keyframes = effect.tracks || {}
        if (effect.transformOrigin) layerBase.transformOrigin = effect.transformOrigin
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
      const extraEffects = [...element.querySelectorAll('[id^=eff]')].filter(node => ![`effIn${sourceId}`, `effMid${sourceId}`, `effOut${sourceId}`].includes(node.id))
      if (extraEffects.length) warnings.push(`${element.id}: additional effects are not converted: ${extraEffects.map(node => node.id).join(', ')}`)
      const before = layers.length
      const type = element.getAttribute('data-eltype')
      if (type === 'audio') {
        const sources = [...element.querySelectorAll('audio > source[src]')]
        if (sources.length !== 1 || !['audio/mp3', 'audio/mpeg'].includes(sources[0].getAttribute('type'))) throw new Error('Unsupported audio source')
        const audio = element.querySelector('audio')
        if (!audio || audio.hasAttribute('loop')) throw new Error('Unsupported audio playback')
        layers.push({ ...layerBase, id: id++, type: 'audio', name: `Audio ${sourceId}`, src: localAsset(sources[0].getAttribute('src')), x: 0, y: 0, w: 1, h: 1, volume: Number.isFinite(audio.volume) ? audio.volume : 1 })
      } else if (type === 'text') {
        const rows = [...element.querySelectorAll('.row')]
        if (!rows.length) throw new Error('Unsupported text layout')
        const rotations = [...element.querySelectorAll('div')].map(div => style(div).transform).filter(t => t && t !== 'none')
        if (rotations.some(t => !/^rotate\(-?[\d.]+deg\)$/.test(t)) || rotations.length > 1) throw new Error('Unsupported static text transform')
        const rotation = rotations.length ? Number.parseFloat(rotations[0].slice(7)) : 0
        if (rotation && (keyframes.scaleX || keyframes.scaleY || keyframes.rotation)) throw new Error('Nested text rotation with scale/rotation needs an adapter')
        if (rotation) {
          layerBase.rotation = rotation
          layerBase.transformOrigin = { x: layerBase.w / 2, y: layerBase.h / 2 }
        }
        let y = layerBase.y
        for (const [rowIndex, row] of rows.entries()) {
          const rowCss = style(row)
          const span = [...row.querySelectorAll('span')].find(item => item.textContent.trim() && !item.closest('sup')) || row
          const textCss = style(span)
          const textTransform = textCss.textTransform || rowCss.textTransform || 'none'
          if (!['none', 'uppercase', 'lowercase', 'capitalize'].includes(textTransform)) throw new Error('Unsupported text transform')
          if (textCss.fontStyle && !['normal', 'italic'].includes(textCss.fontStyle)) throw new Error('Unsupported text font style')
          // Animated word wrappers inherit their visible child's typography but
          // can report an empty computed colour in offline CSS parsing. Compare
          // the painted leaf spans, not both a wrapper and its child.
          const runs = [...row.querySelectorAll('span')].filter(item => item.textContent.trim() && !item.children.length)
          const signature = node => ['fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'color', 'letterSpacing'].map(key => style(node)[key]).join('|')
          if (new Set(runs.filter(item => !item.closest('sup')).map(signature)).size > 1) throw new Error('Mixed styled text within a line needs an adapter')
          const textRuns = []
          if (row.querySelector('sup')) {
            const walk = (node) => {
              if (node.nodeType === 3 && node.textContent) {
                const parent = node.parentElement
                const runCss = style(parent)
                if (['fontFamily', 'fontWeight', 'fontStyle', 'color', 'letterSpacing'].some(key => runCss[key] !== textCss[key])) throw new Error('Mixed styled superscript needs an adapter')
                const sup = parent.closest('sup')
                if (sup) {
                  const supCss = style(sup)
                  if (supCss.position !== 'relative' || supCss.verticalAlign !== 'baseline' || !Number.isFinite(px(supCss.top))) throw new Error('Unsupported superscript positioning')
                  textRuns.push({ text: node.textContent, fontSize: px(runCss.fontSize), top: px(supCss.top) })
                } else {
                  if (runCss.fontSize !== textCss.fontSize) throw new Error('Mixed styled text within a line needs an adapter')
                  textRuns.push({ text: node.textContent })
                }
              } else for (const child of node.childNodes) walk(child)
            }
            walk(row)
          }
          const fontSize = px(textCss.fontSize)
          const lineBoxFontSize = Math.max(fontSize, ...[...row.querySelectorAll('span')].map(item => px(style(item).fontSize)))
          const lineHeight = /^\d*\.?\d+$/.test(rowCss.lineHeight) ? Number(rowCss.lineHeight) : px(rowCss.lineHeight) / fontSize
          const height = lineBoxFontSize * lineHeight
          if (!Number.isFinite(height)) throw new Error('Unsupported text line height')
          if (row.textContent.trim()) layers.push({ ...layerBase, linkId: `source:${sourceId}:row:${rowIndex}`, id: id++, type: 'text', name: row.textContent.trim().slice(0, 60), y, h: height, ...(layerBase.transformOrigin ? { transformOrigin: { x: layerBase.transformOrigin.x, y: layerBase.transformOrigin.y - (y - layerBase.y) } } : {}), text: row.textContent.trim(), ...(textRuns.length ? { text: row.textContent, textRuns } : {}), textTransform, fontFamily: textCss.fontFamily.replace(/["']/g, ''), fontStyle: textCss.fontStyle === 'italic' ? 'italic' : 'normal', fontSize, lineBoxFontSize, textAntialias: style(document.documentElement).getPropertyValue('-webkit-font-smoothing') === 'antialiased', fontWeight: Number(textCss.fontWeight) || 400, lineHeight, color: textCss.color, textAlign: textCss.textAlign || 'left', letterSpacing: !textCss.letterSpacing || textCss.letterSpacing === 'normal' ? '0px' : textCss.letterSpacing })
          y += height
        }
        if (new Set(rows.map(row => style(row).fontSize)).size > 1) warnings.push(`${element.id}: mixed-size text split into editable lines; baseline alignment needs visual review`)
      } else if (type === 'button') {
        const button = element.querySelector('button')
        const label = button?.querySelector('label')
        if (!button || !label) throw new Error('Unsupported button structure')
        const buttonCss = style(button), textCss = style(label)
        const borders = ['Top', 'Right', 'Bottom', 'Left'].map(side => [buttonCss[`border${side}Width`], buttonCss[`border${side}Style`], buttonCss[`border${side}Color`]].join('|'))
        if (new Set(borders).size !== 1 || buttonCss.borderTopStyle !== 'solid') throw new Error('Unsupported button border')
        if (['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'].some(key => px(buttonCss[key]) !== 0)) throw new Error('Unsupported button padding')
        const radii = ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'].map(corner => buttonCss[`border${corner}Radius`])
        if (new Set(radii).size !== 1 || !Number.isFinite(px(radii[0]))) throw new Error('Unsupported button radii')
        layers.push({ ...layerBase, id: id++, type: 'button', name: label.textContent.trim().slice(0, 60), text: label.textContent.trim(),
          bgColor: buttonCss.backgroundColor, borderWidth: px(buttonCss.borderTopWidth), borderColor: buttonCss.borderTopColor, borderRadius: px(radii[0]),
          fontFamily: textCss.fontFamily.replace(/["']/g, ''), fontSize: px(textCss.fontSize), fontWeight: Number(textCss.fontWeight) || 400,
          textColor: textCss.color, lineHeight: Number(textCss.lineHeight), letterSpacing: !textCss.letterSpacing || textCss.letterSpacing === 'normal' ? '0px' : textCss.letterSpacing, textTransform: textCss.textTransform || 'none' })
      } else if (type === 'svg' || type === 'image') {
        const image = element.querySelector('img')
        let content = document.getElementById(`c-${sourceId}`)
        if (!image && !content && type === 'image') content = legacyLayerContent(element, style, 'image')
        const raw = image?.getAttribute('src') || (content && style(content).backgroundImage.match(/^url\(["']?([^"')]+)["']?\)$/)?.[1])
        if (!raw) throw new Error('Missing local asset')
        let fit = type === 'svg' ? 'fill' : 'cover'
        if (!image && content) {
          const contentCss = style(content)
          if (contentCss.backgroundSize) {
            if (!['contain', 'cover'].includes(contentCss.backgroundSize)
              || (contentCss.backgroundPosition && !['50% 50%', 'center', 'center center'].includes(contentCss.backgroundPosition))
              || (contentCss.backgroundRepeat && contentCss.backgroundRepeat !== 'no-repeat')) throw new Error('Unsupported image background fit/position')
            fit = contentCss.backgroundSize
          }
        }
        const rotated = [...element.querySelectorAll('div')].map(div => style(div).transform).filter(t => t && t !== 'none')
        if (rotated.some(t => !/^rotate\(-?[\d.]+deg\)$/.test(t))) throw new Error('Unsupported static transform')
        layers.push({ ...layerBase, id: id++, type: 'image', name: `Artwork ${sourceId}`, src: localAsset(raw), fit, rotation: rotated.reduce((sum, t) => sum + Number.parseFloat(t.slice(7)), 0) })
      } else if (type === 'shape') {
        const content = document.getElementById(`c-${sourceId}`) || legacyLayerContent(element, style, 'shape')
        const transforms = [...element.querySelectorAll('div')].map(div => style(div).transform).filter(t => t && t !== 'none')
        if (transforms.some(t => !/^rotate\(-?[\d.]+deg\)$/.test(t))) throw new Error('Unsupported static shape transform')
        const rotation = transforms.reduce((sum, t) => sum + Number.parseFloat(t.slice(7)), 0)
        const contentCss = style(content)
        const radii = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map(key => contentCss[key] || '0px')
        let borderRadius
        if (new Set(radii).size === 1 && Number.isFinite(px(radii[0])) && px(radii[0]) >= 0) borderRadius = px(radii[0])
        else warnings.push(`${element.id}: unequal or non-pixel corner radii are not converted`)
        if (rotation && (keyframes.scaleX || keyframes.scaleY || keyframes.rotation)) throw new Error('Nested static rotation with animated scale/rotation needs an adapter')
        // happy-dom can omit a shorthand gradient from computed backgroundImage.
        // Read only the bounded inline gradient value in that case; the strict
        // composition checks below still decide whether it is representable.
        const inlineGradient = content?.getAttribute('style')?.match(/(?:^|;)\s*background\s*:\s*((?:linear|radial)-gradient\([^;]+\))/i)?.[1]
        const backgroundImage = contentCss.backgroundImage || inlineGradient || ''
        const borders = ['Top', 'Right', 'Bottom', 'Left'].map(side => px(contentCss[`border${side}Width`] || '0px'))
        if (/^(linear|radial)-gradient\(/.test(backgroundImage)) {
          if (!/^[\w\s#(),.%+-]+$/.test(backgroundImage)
            || !['', 'initial', 'auto', 'auto auto'].includes(contentCss.backgroundSize)
            || !['', 'initial', '0% 0%'].includes(contentCss.backgroundPosition)
            || !['', 'initial', 'repeat'].includes(contentCss.backgroundRepeat)
            || !['', 'initial', 'normal'].includes(contentCss.getPropertyValue('background-blend-mode'))
            || borders.some(width => width !== 0) || borderRadius === undefined) {
            throw new Error('Unsupported gradient shape composition')
          }
          const color = contentCss.backgroundColor
          const fillColor = `${backgroundImage}${color && color !== 'initial' ? ` ${color}` : ''}`
          layers.push({ ...layerBase, id: id++, type: 'rect', name: `Shape ${sourceId}`, rotation, borderRadius, fillColor })
        } else if (backgroundImage && backgroundImage !== 'none') {
          const asset = /^url\(["']?([^"')]+)["']?\)$/.exec(backgroundImage)
          // The native image layer reproduces only a centred, borderless frame
          // with cover sizing. Other CSS backgrounds need their own adapter.
          if (!asset || contentCss.backgroundSize !== 'cover' || contentCss.backgroundPosition !== '50% 50%'
            || contentCss.backgroundRepeat !== 'no-repeat' || borderRadius !== 0 || borders.some(width => width !== 0)
            || (contentCss.backgroundColor && !['transparent', 'rgba(0, 0, 0, 0)'].includes(contentCss.backgroundColor))) {
            throw new Error('Unsupported shape background composition')
          }
          layers.push({ ...layerBase, id: id++, type: 'image', name: `Shape ${sourceId}`, rotation, src: localAsset(asset[1]), fit: 'cover' })
        } else {
          layers.push({ ...layerBase, id: id++, type: 'rect', name: `Shape ${sourceId}`, rotation, ...(borderRadius !== undefined ? { borderRadius } : {}), fillColor: contentCss.backgroundColor })
        }
      } else {
        throw new Error(`Unsupported layer type: ${type}`)
      }
      sourceElements.push({ sourceId, slideId: slide.id, type, nativeLayerIds: layers.slice(before).map(layer => layer.id), start, end })
    }
    return { schemaVersion: 1, adapter: slides.length === 1 ? 'thebrief-css-single-slide-pilot' : 'thebrief-css-hard-cut-slides', fidelityVerified: false, fonts, externalFontStylesheets, source: { designHash: source.designHash || null, width: source.width, height: source.height, duration, loopCount: source.loopCount, elementCount: elements.length }, canvasData: { [`custom_${source.width}x${source.height}`]: { playback: { duration, loopCount: source.loopCount }, layers, bgColor: background } }, sourceElements, warnings }
  } finally {
    await window.happyDOM.close()
  }
}
