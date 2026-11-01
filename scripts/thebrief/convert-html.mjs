import { parse } from 'acorn'
import { Window } from 'happy-dom'
import { isSafeBannerImageFilter } from '../../shared/bannerImageFilters.mjs'

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
  const pattern = /(translateX|translateY|translate|rotate|scaleX|scaleY|scale)\(([^)]+)\)/g
  const parts = [...text.matchAll(pattern)]
  if (text.replace(pattern, '').trim()) throw new Error(`Unsupported transform ${text}`)
  let hasRotationOrScale = false
  let hasScale = false
  for (const [, name, raw] of parts) {
    if (name === 'translate') {
      const coords = raw.split(',').map(value => value.trim())
      if (coords.length !== 2 || coords.some(value => !/^-?(?:\d*\.)?\d+(?:px)?$/.test(value))) throw new Error(`Unsupported transform ${text}`)
      if (hasRotationOrScale && coords.some(value => Number.parseFloat(value) !== 0)) throw new Error('Unsupported ordered translation after rotation/scale')
      if ('x' in values || 'y' in values) throw new Error('Repeated transform function')
      values.x = Number.parseFloat(coords[0])
      values.y = Number.parseFloat(coords[1])
      continue
    }
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

// Preserve fractional cycles with exact segment boundaries and clipped easing.
function clippedEase(easing, fraction) {
  if (easing === 'linear' || easing === 'none') return { value: fraction, easing }
  const match = /^cubic-bezier\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)$/.exec(easing)
  if (!match) throw new Error('Unsupported repeated animation easing')
  const [, x1, y1, x2, y2] = match.map(Number)
  if (![x1, y1, x2, y2].every(Number.isFinite) || x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) throw new Error('Invalid repeated animation easing')
  const cubic = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3
  let low = 0, high = 1
  for (let i = 0; i < 52; i++) {
    const t = (low + high) / 2
    if (cubic(x1, x2, t) < fraction) low = t
    else high = t
  }
  const t = (low + high) / 2, value = cubic(y1, y2, t)
  // de Casteljau subdivision retains the original curve over the shortened
  // segment. Sampling or reusing the full easing would change its motion.
  if (Math.abs(value) < 1e-12) throw new Error('Degenerate clipped easing needs an adapter')
  const n = v => Number(v.toFixed(12))
  return { value, easing: `cubic-bezier(${n(t * x1 / fraction)},${n(t * y1 / value)},${n((2 * t * (1 - t) * x1 + t * t * x2) / fraction)},${n((2 * t * (1 - t) * y1 + t * t * y2) / value)})` }
}

function boundedRepeatedFrames(cycle, at, duration, visibleEnd, identity, reset, intermediate) {
  const n = value => Number(value.toFixed(9))
  const frames = intermediate && cycle[0].value !== identity ? [{ time: at, value: identity, easing: 'linear' }] : []
  for (let iteration = 0; at + iteration * duration < visibleEnd - 1e-9; iteration++) {
    const offset = iteration * duration
    const first = { ...cycle[0], time: n(cycle[0].time + offset) }
    if (frames.length && sameTime(frames.at(-1).time, first.time) && frames.at(-1).value === first.value) frames.pop()
    frames.push(first)
    for (let i = 1; i < cycle.length; i++) {
      const previous = cycle[i - 1], next = cycle[i]
      const time = n(next.time + offset)
      if (time <= visibleEnd + 1e-9) {
        frames.push({ ...next, time: Math.min(time, visibleEnd) })
        if (sameTime(time, visibleEnd)) break
      } else {
        const fraction = (visibleEnd - (previous.time + offset)) / (next.time - previous.time)
        const clipped = clippedEase(previous.easing || 'linear', fraction)
        frames.at(-1).easing = clipped.easing
        frames.push({ time: visibleEnd, value: previous.value + (next.value - previous.value) * clipped.value })
        break
      }
    }
    if (frames.length > 498) throw new Error('Repeated effect exceeds the native keyframe budget')
  }
  // Equal-time frames are intentional CSS jumps, preserved by both renderers.
  if (reset && frames.at(-1).value !== identity) frames.push({ time: visibleEnd, value: identity })
  delete frames.at(-1).easing
  return frames
}

function sourceWordPop(element, sourceId, style, rules) {
  const wrapper = element.querySelector('[data-words-animation="true"]')
  if (!wrapper) return null
  if (wrapper.id !== `effIn${sourceId}` || element.querySelectorAll('.row').length !== 1) throw new Error('Unsupported word animation structure')
  const words = [...wrapper.querySelectorAll('span.word.in')]
  if (!words.length || words.length > 20) throw new Error('Unsupported word animation count')
  const settings = words.map((word, index) => {
    const css = style(word)
    if (Number(word.getAttribute('data-index')) !== index || !word.textContent.trim() || css.animationIterationCount !== '1' || css.animationDirection !== 'normal' || css.animationFillMode !== 'backwards') throw new Error('Unsupported word animation settings')
    return { name: css.animationName, duration: seconds(css.animationDuration), delay: seconds(css.animationDelay), ease: cssEase(css.animationTimingFunction) }
  })
  const first = settings[0]
  const stagger = settings.length > 1 ? settings[1].delay - first.delay : 0
  if (first.delay !== 0 || !Number.isFinite(stagger) || stagger < 0 || first.duration <= 0 || first.duration > 5 || settings.some((item, index) => item.name !== first.name || item.duration !== first.duration || item.ease !== first.ease || !sameTime(item.delay, index * stagger))) throw new Error('Unsupported word animation stagger')
  const rule = rules.findLast(item => item.name === first.name)
  const frames = rule && [...rule.cssRules].map(frame => [frame.keyText, frame.style.transform, frame.style.filter, frame.style.opacity])
  if (JSON.stringify(frames) !== JSON.stringify([
    ['0%', 'translateY(0) scale(.6)', 'blur(10px)', '0'],
    ['40%', '', '', '1'],
    ['70%', 'translateY(0) scale(1.05)', '', ''],
    ['100%', 'translateY(0) scale(1)', 'blur(0px)', '']
  ])) throw new Error('Unsupported word animation keyframes')
  return { duration: first.duration, stagger, ease: first.ease }
}

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
  if (!Number.isFinite(iterations) || iterations < 1 || iterations > 50 || !['normal', 'reverse', ''].includes(css.animationDirection)) throw new Error('Unsupported repeated/reversed animation')
  if (!intermediate && !Number.isInteger(iterations)) throw new Error('Fractional non-intermediate repetitions need an adapter')
  const animationEnd = at + duration * iterations
  if (![at, duration, animationEnd].every(Number.isFinite)) throw new Error('Invalid animation timing')
  if (at < 0 || duration <= 0 || (!intermediate && animationEnd > end + 1e-9)) throw new Error('Animation crosses slide boundary')
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
    const noOpBlur = /^blur\(0(?:\.0+)?(?:px)?\)$/.test(frame.style.filter)
    if (noOpBlur && css.filter && css.filter !== 'none' && !/^blur\(0(?:\.0+)?(?:px)?\)$/.test(css.filter)) throw new Error('Unsupported underlying filter')
    if (properties.some(p => !['transform', 'transform-origin', 'opacity', 'animation-timing-function'].includes(p) && !(p === 'filter' && noOpBlur))) throw new Error(`Unsupported animated properties: ${properties.join(', ')}`)
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
      if ((!intermediate && frames[0].value !== identityValue(property)) || frames.at(-1).value !== identityValue(property)) throw new Error('Intermediate effect must return to identity')
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
    if (intermediate && ((iterations > 1 && (!Number.isInteger(iterations) || animationEnd > end + 1e-9)) || frames[0].value !== identityValue(property))) {
      if (!['none', 'backwards', '', 'forwards', 'both'].includes(css.animationFillMode)) throw new Error('Unsupported animation fill mode')
      frames.splice(0, frames.length, ...boundedRepeatedFrames(frames, at, duration, Number(Math.min(end, animationEnd).toFixed(9)), identityValue(property), animationEnd < end - 1e-9 && !['forwards', 'both'].includes(css.animationFillMode), true))
    } else if (iterations > 1) {
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

// One static text shadow with a hex or rgb()/rgba() colour, in either CSS order.
// Multiple shadows, named colours and other units remain explicit holds.
export function normaliseTextShadow(value) {
  const css = String(value || '').trim()
  if (!css || css === 'none') return ''
  const colors = css.match(/#[0-9a-f]+\b|rgba?\([^)]*\)/gi) || []
  if (colors.length !== 1) throw new Error('Unsupported text shadow')
  const lengths = css.replace(colors[0], ' ').trim().split(/\s+/).map(token => token === '0' ? '0px' : token)
  if (lengths.length < 2 || lengths.length > 3 || !lengths.every(token => /^-?\d+(?:\.\d+)?px$/.test(token)) || lengths[2]?.startsWith('-')) throw new Error('Unsupported text shadow')
  const [x, y, blur = '0px'] = lengths
  const hex = /^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(colors[0]) ? colors[0] : null
  const rgb = colors[0].replace(/\s+/g, '').match(/^rgba?\((\d{1,3}),(\d{1,3}),(\d{1,3})(?:,(0|1|0?\.\d+|1\.0+))?\)$/i)
  if (!hex && (!rgb || rgb.slice(1, 4).some(channel => Number(channel) > 255))) throw new Error('Unsupported text shadow')
  const color = hex || (rgb[4] === undefined ? `rgb(${rgb[1]},${rgb[2]},${rgb[3]})` : `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${Number(rgb[4])})`)
  return `${x} ${y} ${blur} ${color}`
}

// happy-dom can drop a valid declaration (e.g. a class-rule gradient with
// rgba() stops) from both computed style and the CSSOM, leaving no trace.
// Read the raw source rules of the element's own classes so a dropped
// declaration is recovered or held, never silently replaced by a default.
function sourceDeclarations(document, element, property) {
  const classes = [...element.classList]
  const values = new Set()
  if (!classes.length) return values
  const declaration = new RegExp(`(?:^|;)\\s*(?:${property})\\s*:\\s*([^;]*)`, 'gi')
  for (const sheet of document.querySelectorAll('style')) {
    for (const [, selectors, body] of sheet.textContent.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selectors.split(',').some(selector => classes.some(name => selector.trim() === `.${name}`))) continue
      for (const [, value] of body.matchAll(declaration)) values.add(value.trim())
    }
  }
  return values
}

/** Offline CSS export adapter for bounded, hard-cut slide sequences. Source scripts are parsed, never run. */
export async function convertTheBriefHtml(html) {
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw new Error('HTML exceeds pilot limit')
  const window = new Window({ settings: { enableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true } })
  try {
    // HTML input preprocessing converts raw CR/CRLF to LF before tokenization.
    // Happy DOM retains CR in text nodes; carrying those through JSON into the
    // native editor can join words instead of preserving the source line break.
    // Normalize the input, not decoded text, so &#13; and JS escapes stay intact.
    window.document.write(html.replace(/\r\n?/g, '\n'))
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
    const imageTransforms = []
    const videoFrames = []
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
      const layerBase = { ...base, slideId: `source-slide:${slide.id}`, linkId: `source:${sourceId}`, x: px(css.left), y: px(css.top), w: px(css.width), h: px(css.height), zIndex: id, startTime: start, endTime: end, ...(clipToPresence ? { clipToPresence: true } : {}) }
      if ([layerBase.x, layerBase.y, layerBase.w, layerBase.h].some(n => !Number.isFinite(n))) throw new Error('Unsupported element geometry')
      if (css.mixBlendMode && css.mixBlendMode !== 'normal') {
        if (/^(multiply|screen|overlay|darken|lighten|color-dodge|color-burn|hard-light|soft-light|difference|exclusion|hue|saturation|color|luminosity)$/.test(css.mixBlendMode)) layerBase.mixBlendMode = css.mixBlendMode
        else warnings.push(`${element.id}: unsupported native blend mode ${css.mixBlendMode}`)
      }
      let keyframes = {}
      let wordPop = null
      try {
        wordPop = sourceWordPop(element, sourceId, style, rules)
        let effect = wordPop ? {} : effectTracks(document.getElementById(`effIn${sourceId}`), style, rules, start, end, warnings, layerBase)
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
        const audioConfig = source.audioElements?.find(item => item.elementId === sourceId && item.slideId === slide.id)
        // shouldPlay is the vendor player's autoplay-retry flag: it starts false,
        // becomes true when play() is blocked, and resets on stop. It is not mute.
        if (audioConfig?.volume !== undefined && typeof audioConfig.volume !== 'number') throw new Error(`Audio ${sourceId}: invalid source volume`)
        const volume = audioConfig?.volume === undefined ? audio.volume : audioConfig.volume / 100
        if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error(`Audio ${sourceId}: invalid source volume`)
        const offset = audioConfig?.startTime === undefined ? 0 : audioConfig.startTime
        if (!Number.isFinite(offset) || offset < 0) throw new Error(`Audio ${sourceId}: invalid source clip offset`)
        if (offset !== 0) throw new Error(`Audio ${sourceId}: source clip offset ${offset}s requires exported-clip reconciliation`)
        if (audioConfig?.soundOnHover) throw new Error(`Audio ${sourceId}: hover playback requires an audio adapter`)
        const stages = [audioConfig?.buildIn, audioConfig?.buildMid, audioConfig?.buildOut].filter(Boolean)
        if (stages.some(stage => stage.type === 'fadeAudio')) throw new Error(`Audio ${sourceId}: source fades require exported-clip reconciliation`)
        if (stages.some(stage => !['none', 'instant', 'audio'].includes(stage.type))) throw new Error(`Audio ${sourceId}: unsupported source audio effect`)
        const delay = audioConfig?.buildIn?.delay
        if (delay !== undefined && (!Number.isFinite(delay) || delay < 0 || Math.abs(slide.start + delay - start) > 1e-6)) throw new Error(`Audio ${sourceId}: source audio presence requires reconciliation`)
        layers.push({ ...layerBase, id: id++, type: 'audio', name: `Audio ${sourceId}`, src: localAsset(sources[0].getAttribute('src')), x: 0, y: 0, w: 1, h: 1, volume, ...(audio.muted || audio.hasAttribute('muted') || audioConfig?.muted === true ? { muted: true } : {}) })
      } else if (type === 'video') {
        // Bounded video adapter: one local muted autoplay clip that starts at media
        // time zero with its layer. Trim starts, sound, hover playback, playback past
        // the slide and non-centred or transformed framing remain explicit holds.
        const videos = [...element.querySelectorAll('video')]
        if (videos.length !== 1 || !videos[0].getAttribute('src')) throw new Error(`Video ${sourceId}: unsupported video source`)
        const video = videos[0]
        const src = localAsset(video.getAttribute('src'))
        if (!/\.mp4$/i.test(src)) throw new Error(`Video ${sourceId}: only MP4 video is supported`)
        const config = source.videoElements?.find(item => item.elementId === sourceId && item.slideId === slide.id)
        if (!config || localAsset(String(config.src || '')) !== src) throw new Error(`Video ${sourceId}: missing or mismatched source video settings`)
        if (config.autoplay !== true) throw new Error(`Video ${sourceId}: click-to-play video requires an adapter`)
        if (config.soundOnHover) throw new Error(`Video ${sourceId}: hover playback requires an adapter`)
        if (config.keepPlayingPastSlide) throw new Error(`Video ${sourceId}: playback past its slide requires an adapter`)
        if (typeof config.volume !== 'number' || config.volume < 0 || config.volume > 100) throw new Error(`Video ${sourceId}: invalid source volume`)
        if (config.volume > 0 && !(video.muted || video.hasAttribute('muted'))) throw new Error(`Video ${sourceId}: audible video requires an audio adapter`)
        const mediaStart = config.startTime ?? 0
        const mediaEnd = config.endTime
        if (!Number.isFinite(mediaStart) || mediaStart !== 0) throw new Error(`Video ${sourceId}: source clip start ${mediaStart}s requires exported-clip reconciliation`)
        if (!Number.isFinite(mediaEnd) || mediaEnd <= mediaStart || mediaEnd > 300) throw new Error(`Video ${sourceId}: invalid source clip end`)
        const delay = config.delay ?? 0
        if (!Number.isFinite(delay) || delay < 0 || Math.abs(slide.start + delay - start) > 1e-3) throw new Error(`Video ${sourceId}: source video start requires reconciliation with its layer`)
        if (typeof config.loop !== 'boolean') throw new Error(`Video ${sourceId}: invalid source loop setting`)
        const videoCss = style(video)
        let fit = videoCss.objectFit || 'fill'
        if (!['cover', 'contain', 'fill'].includes(fit)) throw new Error(`Video ${sourceId}: unsupported video fit ${fit}`)
        if (videoCss.objectPosition && !['50% 50%', 'center', 'center center'].includes(videoCss.objectPosition)) throw new Error(`Video ${sourceId}: unsupported video position`)
        for (const node of [element, ...element.querySelectorAll('div')]) {
          const nodeCss = style(node)
          if (nodeCss.transform && nodeCss.transform !== 'none') throw new Error(`Video ${sourceId}: transformed video requires an adapter`)
          if (nodeCss.borderRadius && !/^0(px)?( 0(px)?)*$/.test(nodeCss.borderRadius)) throw new Error(`Video ${sourceId}: rounded video requires an adapter`)
        }
        if (videoCss.borderRadius && !/^0(px)?( 0(px)?)*$/.test(videoCss.borderRadius)) throw new Error(`Video ${sourceId}: rounded video requires an adapter`)
        // TheBrief frames a clip by sizing the <video> to cover its clipping wrapper and
        // shifting it. That is native cover framing with a focal point; any zoom beyond
        // cover, rotation or scale stays held. The packager checks the file's aspect.
        let focalX = 50, focalY = 50
        const boxW = px(videoCss.width), boxH = px(videoCss.height)
        const shift = /^(?:translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\))?(?:\s*rotate\(0(?:deg)?\))?$/.exec((videoCss.transform && videoCss.transform !== 'none') ? videoCss.transform.trim() : '')
        if (!shift) throw new Error(`Video ${sourceId}: transformed video requires an adapter`)
        const left = (px(videoCss.left) || 0) + Number(shift[1] || 0), top = (px(videoCss.top) || 0) + Number(shift[2] || 0)
        if (Number.isFinite(boxW) && Number.isFinite(boxH) && (Math.abs(boxW - layerBase.w) > 1 || Math.abs(boxH - layerBase.h) > 1 || Math.abs(left) > 1 || Math.abs(top) > 1)) {
          const coversWidth = Math.abs(boxW - layerBase.w) <= 1 && boxH >= layerBase.h - 1
          const coversHeight = Math.abs(boxH - layerBase.h) <= 1 && boxW >= layerBase.w - 1
          if (!(coversWidth || coversHeight) || left > 1 || top > 1 || left + boxW < layerBase.w - 1 || top + boxH < layerBase.h - 1) throw new Error(`Video ${sourceId}: cropped video framing requires an adapter`)
          const percent = (offset, free) => Math.abs(free) <= 1 ? 50 : Math.min(100, Math.max(0, Math.round(offset / free * 10000) / 100))
          focalX = percent(left, layerBase.w - boxW)
          focalY = percent(top, layerBase.h - boxH)
          fit = 'cover'
          videoFrames.push({ layerId: id, src, aspect: boxW / boxH })
        }
        layers.push({ ...layerBase, id: id++, type: 'video', name: `Video ${sourceId}`, src, fit, focalX, focalY, mediaStart, mediaEnd, ...(config.loop ? { mediaLoop: true } : {}) })
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
        const rowHeights = []
        for (const [rowIndex, row] of rows.entries()) {
          const rowCss = style(row)
          const span = [...row.querySelectorAll('span')].find(item => item.textContent.trim() && !item.closest('sup')) || row
          const textCss = style(span)
          if (textCss.fontStyle && !['normal', 'italic'].includes(textCss.fontStyle)) throw new Error('Unsupported text font style')
          // Animated word wrappers inherit their visible child's typography but
          // can report an empty computed colour in offline CSS parsing. Compare
          // the painted leaf spans, not both a wrapper and its child.
          const runs = [...row.querySelectorAll('span')].filter(item => item.textContent.trim() && !item.children.length)
          const signature = node => ['fontFamily', 'fontWeight', 'fontStyle', 'color', 'letterSpacing'].map(key => style(node)[key]).join('|')
          const plainRuns = runs.filter(item => !item.closest('sup'))
          if (new Set(plainRuns.map(signature)).size > 1) throw new Error('Mixed styled text within a line needs an adapter')
          const hasInlineSizes = new Set(plainRuns.map(item => style(item).fontSize)).size > 1
          const paintedCss = style(runs.find(item => !item.closest('sup')) || span)
          const textTransform = paintedCss.textTransform || textCss.textTransform || rowCss.textTransform || 'none'
          if (!['none', 'uppercase', 'lowercase', 'capitalize'].includes(textTransform)) throw new Error('Unsupported text transform')
          const textContainer = row.closest('.text-content')
          const containerCss = textContainer ? style(textContainer) : rowCss
          // Native text layers have no decoration; a struck-through price would lose its meaning.
          for (const node of new Set([row, span, ...runs, ...(textContainer ? [textContainer] : [])])) {
            const css = style(node)
            const lines = [css.getPropertyValue('text-decoration-line'), css.getPropertyValue('text-decoration'), ...sourceDeclarations(document, node, 'text-decoration|text-decoration-line')]
            if (lines.some(value => /line-through|underline|overline/i.test(value || ''))) throw new Error('Text decoration needs an adapter')
          }
          const textStroke = containerCss.getPropertyValue('-webkit-text-stroke') || ''
          const textShadow = normaliseTextShadow(containerCss.textShadow)
          if (textStroke && !/^\d+(?:\.\d+)?px #[0-9a-f]{6}$/i.test(textStroke)) throw new Error('Unsupported text stroke')
          if (textStroke && !['stroke', ''].includes(containerCss.paintOrder)) throw new Error('Unsupported text paint order')
          // Text clipped to a background paints that background, not its colour.
          // Keeping only the colour would silently replace a gradient fill.
          for (const node of new Set([row, span, ...runs, ...(textContainer ? [textContainer] : [])])) {
            const css = style(node)
            const plainFills = ['', 'currentcolor', 'inherit', (css.color || '').toLowerCase()]
            const fills = [css.getPropertyValue('-webkit-text-fill-color'), ...sourceDeclarations(document, node, '-webkit-text-fill-color')]
            if ([css.getPropertyValue('background-clip'), css.getPropertyValue('-webkit-background-clip'), ...sourceDeclarations(document, node, 'background-clip|-webkit-background-clip')].includes('text')
              || fills.some(fill => !plainFills.includes((fill || '').toLowerCase()))) {
              throw new Error('Gradient or clipped text fill needs an adapter')
            }
          }
          const textRuns = []
          if (row.querySelector('sup') || hasInlineSizes) {
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
                  textRuns.push({ text: node.textContent, ...(runCss.fontSize !== textCss.fontSize ? { fontSize: px(runCss.fontSize) } : {}) })
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
          if (row.textContent.trim()) layers.push({ ...layerBase, linkId: `source:${sourceId}:row:${rowIndex}`, id: id++, type: 'text', name: row.textContent.trim().slice(0, 60), y, h: height, ...(layerBase.transformOrigin ? { transformOrigin: { x: layerBase.transformOrigin.x, y: layerBase.transformOrigin.y - (y - layerBase.y) } } : {}), text: row.textContent.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ''), ...(textRuns.length ? { text: row.textContent, textRuns } : {}), ...(wordPop ? { wordPop } : {}), textTransform, fontFamily: textCss.fontFamily.replace(/["']/g, ''), fontStyle: textCss.fontStyle === 'italic' ? 'italic' : 'normal', fontSize, lineBoxFontSize, textAntialias: style(document.documentElement).getPropertyValue('-webkit-font-smoothing') === 'antialiased', fontWeight: Number(textCss.fontWeight) || 400, lineHeight, color: paintedCss.color || textCss.color || '#fff', ...(textStroke ? { textStroke } : {}), ...(textShadow ? { textShadow } : {}), textAlign: textCss.textAlign || 'left', letterSpacing: !textCss.letterSpacing || textCss.letterSpacing === 'normal' ? '0px' : textCss.letterSpacing })
          y += height
          rowHeights.push(height)
        }
        // Rows are stacked one line box apart. When the source box is taller than
        // that stack, a row soft-wraps and any row below it would overlap its extra
        // lines. Only the last row may wrap safely (the native box wraps to the same
        // width); accept that only when the extra height is a whole number of its
        // line boxes and of no other row's, so the wrapping row is unambiguous.
        const extra = layerBase.h - (y - layerBase.y)
        if (rows.length > 1 && extra > 0.4 * Math.min(...rowHeights)) {
          const wholeLines = height => extra / height >= 0.9 && Math.abs(extra / height - Math.round(extra / height)) < 0.1
          if (!wholeLines(rowHeights.at(-1)) || rowHeights.slice(0, -1).some(wholeLines)) throw new Error('Wrapped text across stacked rows needs an adapter')
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
        const transformed = [...element.querySelectorAll('div')].filter(div => style(div).transform && style(div).transform !== 'none')
        const mirrored = transformed.filter(div => /^rotate\(0(?:deg)?\)\s+scale\((?:-1,\s*1|1,\s*-1)\)$/.test(style(div).transform))
        const rotated = transformed.filter(div => !mirrored.includes(div)).map(div => style(div).transform)
        if (rotated.some(t => !/^rotate\(-?[\d.]+deg\)$/.test(t)) || mirrored.length > 1
          || (mirrored.length && (rotated.some(t => Number.parseFloat(t.slice(7)) !== 0)
            || style(mirrored[0]).width !== '100%' || style(mirrored[0]).height !== '100%'
            || !['', '50% 50%', 'center center', 'center'].includes(style(mirrored[0]).transformOrigin)))) throw new Error('Unsupported static transform')
        if (mirrored.length) imageTransforms.push({ layerId: id, operation: /scale\(-1/.test(style(mirrored[0]).transform) ? 'flop' : 'flip' })
        let contentOpacity = 1
        const imageFilters = []
        for (let node = image || content; node && element.contains(node); node = node.parentElement) {
          const nodeCss = style(node)
          const opacity = nodeCss.opacity === '' ? 1 : Number(nodeCss.opacity)
          if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error('Unsupported image opacity')
          if (nodeCss.animationName && nodeCss.animationName !== 'none' && opacity !== 1) throw new Error('Animated image with nonidentity underlying opacity needs an adapter')
          contentOpacity *= opacity
          if (nodeCss.filter && nodeCss.filter !== 'none') imageFilters.push(nodeCss.filter)
          if (node === element) break
        }
        layerBase.opacity = contentOpacity
        layerBase.keyframes = { ...layerBase.keyframes, opacity: layerBase.keyframes.opacity.map(frame => ({ ...frame, value: frame.value * contentOpacity })) }
        const visualFilter = imageFilters.join(' ')
        if (visualFilter) {
          if (!isSafeBannerImageFilter(visualFilter)) throw new Error('Unsupported static image filter')
          if (mirrored.length && visualFilter.includes('drop-shadow(')) throw new Error('Mirrored nested image shadow needs an adapter')
          layerBase.visualFilter = visualFilter
        }
        layers.push({ ...layerBase, id: id++, type: 'image', name: `Artwork ${sourceId}`, src: localAsset(raw), fit, rotation: rotated.reduce((sum, t) => sum + Number.parseFloat(t.slice(7)), 0) })
      } else if (type === 'shape') {
        const content = document.getElementById(`c-${sourceId}`) || legacyLayerContent(element, style, 'shape')
        const transforms = [...element.querySelectorAll('div')].map(div => style(div).transform).filter(t => t && t !== 'none')
        if (transforms.some(t => !/^rotate\(-?[\d.]+deg\)$/.test(t))) throw new Error('Unsupported static shape transform')
        let rotation = transforms.reduce((sum, t) => sum + Number.parseFloat(t.slice(7)), 0)
        const contentCss = style(content)
        const radii = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map(key => contentCss[key] || '0px')
        let borderRadius
        let rectShape
        // Uniform percentages of 50% or more resolve to the inscribed ellipse in CSS.
        // Any other corner geometry would be flattened, so it is held for an adapter.
        const percent = /^(\d+(?:\.\d+)?)%$/.exec(radii[0])
        if (new Set(radii).size === 1 && Number.isFinite(px(radii[0])) && px(radii[0]) >= 0) borderRadius = px(radii[0])
        else if (new Set(radii).size === 1 && percent && Number(percent[1]) >= 50) rectShape = 'ellipse'
        else throw new Error(`${element.id}: unequal or partial-percentage corner radii need an adapter`)
        const shapeFilters = []
        let shapeOpacity = 1
        for (let node = content; node && element.contains(node); node = node.parentElement) {
          const nodeCss = style(node)
          const opacity = nodeCss.opacity === '' ? 1 : Number(nodeCss.opacity)
          if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error('Unsupported shape opacity')
          if (nodeCss.animationName && nodeCss.animationName !== 'none' && opacity !== 1) throw new Error('Animated shape with nonidentity underlying opacity needs an adapter')
          shapeOpacity *= opacity
          if (nodeCss.filter && nodeCss.filter !== 'none') shapeFilters.push(nodeCss.filter)
          if (nodeCss.boxShadow && nodeCss.boxShadow !== 'none') throw new Error(`${element.id}: shape box shadow needs an adapter`)
          if (node === element) break
        }
        layerBase.opacity = shapeOpacity
        layerBase.keyframes = { ...layerBase.keyframes, opacity: layerBase.keyframes.opacity.map(frame => ({ ...frame, value: frame.value * shapeOpacity })) }
        const visualFilter = shapeFilters.join(' ')
        if (visualFilter && !isSafeBannerImageFilter(visualFilter)) throw new Error('Unsupported static shape filter')
        const shapeEffects = { ...(rectShape ? { rectShape } : {}), ...(visualFilter ? { visualFilter } : {}) }
        // happy-dom can omit a shorthand gradient from computed backgroundImage.
        // Read only the bounded inline gradient value in that case; the strict
        // composition checks below still decide whether it is representable.
        const inlineGradient = content?.getAttribute('style')?.match(/(?:^|;)\s*background\s*:\s*((?:linear|radial)-gradient\([^;]+\))/i)?.[1]
        let backgroundImage = contentCss.backgroundImage || inlineGradient || ''
        const declaredGradients = [...sourceDeclarations(document, content, 'background|background-image')].filter(value => /gradient\(/i.test(value))
        if (declaredGradients.length && !/gradient\(/.test(backgroundImage)) {
          // Only a single bare gradient is recoverable; position, size or layered
          // backgrounds in the dropped shorthand cannot be checked below.
          if (declaredGradients.length > 1 || !/^(?:linear|radial)-gradient\((?:[^()]|\([^()]*\))*\)$/.test(declaredGradients[0])) {
            throw new Error('Unsupported gradient shape composition')
          }
          backgroundImage = declaredGradients[0]
        }
        const borders = ['Top', 'Right', 'Bottom', 'Left'].map(side => px(contentCss[`border${side}Width`] || '0px'))
        if (rotation && (keyframes.scaleX || keyframes.scaleY || keyframes.rotation)) {
          // A 90-degree solid divider can be represented as a swapped rectangle.
          // Keep the outer scale origin in canvas coordinates while baking the
          // inner static rotation into its geometry. Other compositions still
          // require a matrix-aware adapter.
          const canBake = Math.abs(rotation) === 90 && !keyframes.rotation
            && keyframes.scaleY?.length && (keyframes.scaleX || []).every(frame => frame.value === 1)
            && (!backgroundImage || backgroundImage === 'none') && borderRadius === 0
            && borders.every(width => width === 0) && /^#[0-9a-f]{3,8}$/i.test(contentCss.backgroundColor)
          if (!canBake) throw new Error(`${element.id}: nested static rotation with animated scale/rotation needs an adapter`)
          const { x, y, w, h } = layerBase
          const origin = layerBase.transformOrigin || { x: w / 2, y: h / 2 }
          layerBase.x = x + (w - h) / 2
          layerBase.y = y + (h - w) / 2
          layerBase.w = h
          layerBase.h = w
          layerBase.transformOrigin = { x: origin.x - (w - h) / 2, y: origin.y - (h - w) / 2 }
          rotation = 0
          warnings.push(`${element.id}: 90-degree solid divider rotation baked into native geometry; review its entrance motion`)
        }
        if (/^(linear|radial)-gradient\(/.test(backgroundImage)) {
          if (!/^[\w\s#(),.%+-]+$/.test(backgroundImage)
            // A gradient has no intrinsic size, so TheBrief's shared shape frame
            // (cover, centred, no-repeat) paints exactly the default full box.
            || !['', 'initial', 'auto', 'auto auto', 'cover'].includes(contentCss.backgroundSize)
            || !['', 'initial', '0% 0%', '50% 50%'].includes(contentCss.backgroundPosition)
            || !['', 'initial', 'repeat', 'no-repeat'].includes(contentCss.backgroundRepeat)
            || !['', 'initial', 'normal'].includes(contentCss.getPropertyValue('background-blend-mode'))
            || borders.some(width => width !== 0)) {
            throw new Error('Unsupported gradient shape composition')
          }
          const color = contentCss.backgroundColor
          const fillColor = `${backgroundImage}${color && color !== 'initial' ? ` ${color}` : ''}`
          layers.push({ ...layerBase, id: id++, type: 'rect', name: `Shape ${sourceId}`, rotation, ...(borderRadius !== undefined ? { borderRadius } : {}), ...shapeEffects, fillColor })
        } else if (backgroundImage && backgroundImage !== 'none') {
          const asset = /^url\(["']?([^"')]+)["']?\)$/.exec(backgroundImage)
          // The native image layer reproduces only a centred, borderless frame
          // with cover sizing. Other CSS backgrounds need their own adapter.
          if (!asset || contentCss.backgroundSize !== 'cover' || contentCss.backgroundPosition !== '50% 50%'
            || contentCss.backgroundRepeat !== 'no-repeat' || borderRadius !== 0 || visualFilter || borders.some(width => width !== 0)
            || (contentCss.backgroundColor && !['transparent', 'rgba(0, 0, 0, 0)'].includes(contentCss.backgroundColor))) {
            throw new Error('Unsupported shape background composition')
          }
          layers.push({ ...layerBase, id: id++, type: 'image', name: `Shape ${sourceId}`, rotation, src: localAsset(asset[1]), fit: 'cover' })
        } else {
          if (borders.some(width => width !== 0)) throw new Error(`${element.id}: shape border needs an adapter`)
          layers.push({ ...layerBase, id: id++, type: 'rect', name: `Shape ${sourceId}`, rotation, ...(borderRadius !== undefined ? { borderRadius } : {}), ...shapeEffects, fillColor: contentCss.backgroundColor || 'transparent' })
        }
      } else {
        throw new Error(`Unsupported layer type: ${type}`)
      }
      sourceElements.push({ sourceId, slideId: slide.id, type, nativeLayerIds: layers.slice(before).map(layer => layer.id), start, end })
    }
    return { schemaVersion: 1, adapter: slides.length === 1 ? 'thebrief-css-single-slide-pilot' : 'thebrief-css-hard-cut-slides', fidelityVerified: false, fonts, externalFontStylesheets, imageTransforms, source: { designHash: source.designHash || null, width: source.width, height: source.height, duration, loopCount: source.loopCount, elementCount: elements.length }, videoFrames, canvasData: { [`custom_${source.width}x${source.height}`]: { slides: slides.map((slide, index) => ({ id: `source-slide:${slide.id}`, name: `Slide ${index + 1}`, duration: slide.end - slide.start })), playback: { duration, loopCount: source.loopCount }, layers, bgColor: background } }, sourceElements, warnings }
  } finally {
    await window.happyDOM.close()
  }
}
