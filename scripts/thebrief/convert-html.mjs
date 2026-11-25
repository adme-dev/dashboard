import { isBannerImageBackground } from '../../shared/bannerImageBackground.mjs'
import { isBannerInlineTextColor, isBannerInlineTextGradient } from '../../shared/bannerTextColor.mjs'
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
  const radii = corners.map(corner => {
    const value = legacy[`border${corner}Radius`] || '0px'
    return kind === 'shape' && value === '100%' ? 100 : px(value)
  })
  if (content.children.length || legacy.width !== '100%' || legacy.height !== '100%'
    || !['', 'block'].includes(legacy.display) || !['', 'visible'].includes(contentVisibility)
    || (kind === 'image' && (legacy.backgroundSize !== 'cover' || legacy.backgroundPosition !== '50% 50%' || legacy.backgroundRepeat !== 'no-repeat'))
    || (kind !== 'shape' && sides.some(side => px(legacy[`border${side}Width`] || '0px') !== 0))
    || sides.some(side => px(legacy[`padding${side}`] || '0px') !== 0 || px(legacy[`margin${side}`] || '0px') !== 0)
    || ['top', 'right', 'bottom', 'left'].some(side => !['', 'auto', '0px'].includes(legacy[side]))
    || radii.some(radius => !Number.isFinite(radius) || radius < 0) || new Set(radii).size !== 1
    || (kind === 'image' && radii.some(radius => radius !== 0))
    || (kind === 'image' && !['', 'transparent', 'rgba(0, 0, 0, 0)'].includes(legacy.backgroundColor))
    || (legacy.opacity !== '' && (!Number.isFinite(Number(legacy.opacity)) || Number(legacy.opacity) < 0 || Number(legacy.opacity) > 1))
    || !['', 'none'].includes(legacy.filter)
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
  // TheBrief pads its X-axis flip with two identity rotations.
  const flip = /^rotateX\((0|-?(?:\d*\.)?\d+deg)\)(?:\s+rotateY\(0(?:deg)?\)\s+rotate3d\(1,\s*1,\s*0,\s*0deg\))?$/.exec(text)
  const flipY = /^rotateX\(0(?:deg)?\)\s+rotateY\((-?(?:\d*\.)?\d+deg)\)\s+rotate3d\(1,\s*1,\s*0,\s*0deg\)$/.exec(text)
  if (flipY && Number.parseFloat(flipY[1]) !== 0) return { rotationY: Number.parseFloat(flipY[1]) }
  if (flip) return { rotationX: Number.parseFloat(flip[1]) }
  // A planar scale3d with a unit depth is exactly the two planar scale axes.
  const planarScale = /^scale3d\((-?(?:\d*\.)?\d+),\s*(-?(?:\d*\.)?\d+),\s*1\)$/.exec(text)
  if (planarScale) return { scaleX: Number(planarScale[1]), scaleY: Number(planarScale[2]) }
  const values = {}
  const pattern = /(translateX|translateY|translateZ|translate|rotateX|rotate|scaleX|scaleY|scale)\(([^)]+)\)/g
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
    const unit = name.startsWith('rotate') ? 'deg' : name.startsWith('translate') ? 'px' : ''
    if (!new RegExp(`^-?(?:\\d*\\.)?\\d+(?:${unit})?$`).test(raw)) throw new Error(`Unsupported transform ${text}`)
    const value = Number.parseFloat(raw)
    // Native GSAP composes translation, then rotation, then scale. A translation
    // after a scale/rotation would require matrix-aware interpolation, not just
    // multiplying endpoint coordinates (which changes the path between them).
    if (name.startsWith('translate') && value !== 0 && hasRotationOrScale) throw new Error('Unsupported ordered translation after rotation/scale')
    if (name.startsWith('rotate') && hasScale) throw new Error('Unsupported rotation after scale')
    if (name.startsWith('rotate') || name.startsWith('scale')) hasRotationOrScale = true
    if (name.startsWith('scale')) hasScale = true
    const properties = name === 'scale' ? ['scaleX', 'scaleY'] : [{ translateX: 'x', translateY: 'y', translateZ: 'z', rotate: 'rotation', rotateX: 'rotationX', scaleX: 'scaleX', scaleY: 'scaleY' }[name]]
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
  const rows = [...element.querySelectorAll('.row')]
  if (wrapper.id !== `effIn${sourceId}` || !rows.length || rows.length > 20) throw new Error('Unsupported word animation structure')
  const words = [...wrapper.querySelectorAll('span.word.in')]
  if (!words.length || words.length > 500) throw new Error('Unsupported word animation count')
  const settings = words.map((word, index) => {
    const css = style(word)
    if (Number(word.getAttribute('data-index')) !== index || !word.textContent.trim() || css.animationIterationCount !== '1' || css.animationDirection !== 'normal' || css.animationFillMode !== 'backwards') throw new Error('Unsupported word animation settings')
    return { name: css.animationName, duration: seconds(css.animationDuration), delay: seconds(css.animationDelay), ease: cssEase(css.animationTimingFunction) }
  })
  const first = settings[0]
  if (first.duration <= 0 || first.duration > 5 || settings.some(item => item.name !== first.name || item.duration !== first.duration || item.ease !== first.ease || item.delay < 0 || item.delay > 5)) throw new Error('Unsupported word animation stagger')
  const rule = rules.findLast(item => item.name === first.name)
  const frames = rule && [...rule.cssRules].map(frame => [frame.keyText, frame.style.transform, frame.style.filter, frame.style.opacity])
  const signature = JSON.stringify(frames)
  const variants = [
    ['pop', [['0%', 'translateY(0) scale(.6)', 'blur(10px)', '0'], ['40%', '', '', '1'], ['70%', 'translateY(0) scale(1.05)', '', ''], ['100%', 'translateY(0) scale(1)', 'blur(0px)', '']]],
    ['blur', [['0%', '', 'blur(5px)', '0'], ['30%', '', '', '1'], ['100%', '', 'blur(0px)', '']]],
    ['blurLeft', [['0%', 'translateX(-20px) scale(1)', 'blur(10px)', '0'], ['40%', '', '', '1'], ['100%', 'translateX(0) scale(1)', 'blur(0px)', '']]],
    ['blurUp', [['0%', 'translateY(20px) scale(1)', 'blur(10px)', '0'], ['40%', '', '', '1'], ['100%', 'translateY(0) scale(1)', 'blur(0px)', '']]],
    ['zoomOut', [['0%', 'translateY(0) scale(1.3)', 'blur(10px)', '0'], ['40%', '', '', '1'], ['100%', 'translateY(0) scale(1)', 'blur(0px)', '']]],
    ['typewriter', [['0%', '', '', '0'], ['100%', '', '', '1']]],
    ['fade', [['0%', '', '', '0'], ['100%', '', '', '1']]]
  ]
  const variant = variants.find(([name, expected]) => JSON.stringify(expected) === signature && (name !== 'typewriter' || [...rule.cssRules][0].style.animationTimingFunction === 'step-end'))?.[0]
  if (!variant || (variant === 'typewriter' && [...rule.cssRules][0].style.animationTimingFunction !== 'step-end')) throw new Error('Unsupported word animation keyframes')
  const character = words.every(word => word.hasAttribute('data-chars-split'))
  if (words.some(word => word.hasAttribute('data-chars-split')) && (!character || words.some(word => Array.from(word.textContent.trim()).length !== 1))) throw new Error('Unsupported character animation structure')
  return { rows: rows.map((row) => {
    const delays = words.flatMap((word, index) => word.closest('.row') === row ? [settings[index].delay] : [])
    if (!delays.length) throw new Error('Missing word animation row')
    const stagger = delays.length > 1 ? delays[1] - delays[0] : 0
    const uniform = stagger >= 0 && delays.every((delay, index) => sameTime(delay, delays[0] + index * stagger))
    return { duration: first.duration, stagger: uniform ? stagger : 0, ease: first.ease, ...(variant !== 'pop' ? { variant } : {}), ...(character ? { unit: 'character' } : {}), ...(uniform ? (delays[0] ? { offset: delays[0] } : {}) : { delays }) }
  }) }
}

function sourceReveal(effect, style, rules) {
  if (!effect) return null
  const css = style(effect)
  const rule = rules.findLast(item => item.name === css.animationName)
  if (!rule) return null
  const text = rule.cssText.replace(/\s+/g, '')
  let type
  if (text.includes('mask-position:148%center') && text.includes('linear-gradient(90deg,black0%,black50%,transparent74%)')) type = 'softWipe'
  else if (text.includes('--tv-collapse-mask-w:400%') && text.includes('--tv-collapse-mask-h:3px') && text.includes('brightness(3.2)saturate(.15)')) type = 'tvExpand'
  if (!type) return null
  // Match the complete reviewed recipe, including all keyframe offsets and values.
  const expected = type === 'softWipe'
    ? [
        ['0%', { 'mask-image': 'linear-gradient(90deg,black 0%,black 50%,transparent 74%)', '-webkit-mask-image': 'linear-gradient(90deg,black 0%,black 50%,transparent 74%)', 'mask-repeat': 'no-repeat', '-webkit-mask-repeat': 'no-repeat', 'mask-size': '200% 100%', '-webkit-mask-size': '200% 100%', 'mask-position': '148% center', '-webkit-mask-position': '148% center', 'opacity': '0' }],
        ['15%', { opacity: '1' }],
        ['100%', { 'mask-image': 'linear-gradient(90deg,black 0%,black 50%,transparent 74%)', '-webkit-mask-image': 'linear-gradient(90deg,black 0%,black 50%,transparent 74%)', 'mask-repeat': 'no-repeat', '-webkit-mask-repeat': 'no-repeat', 'mask-size': '200% 100%', '-webkit-mask-size': '200% 100%', 'mask-position': '0% center', '-webkit-mask-position': '0% center' }]
      ]
    : [
        ['0%', { '--tv-collapse-mask-w': '100%', '--tv-collapse-mask-h': '3px', 'filter': 'brightness(3.2) saturate(.15)', 'opacity': '0', '--tv-collapse-glow': '0.6' }], ['8%', { opacity: '1' }], ['22%', { '--tv-collapse-mask-w': '100%', '--tv-collapse-mask-h': '3px', '--tv-collapse-glow': '0.6' }], ['55%', { '--tv-collapse-glow': '0' }], ['60%', { '--tv-collapse-mask-w': '100%', '--tv-collapse-mask-h': '100%', 'filter': 'brightness(3.2) saturate(.15)' }], ['100%', { '--tv-collapse-mask-w': '400%', '--tv-collapse-mask-h': '400%', 'filter': 'brightness(1) saturate(1)', 'opacity': '1', '--tv-collapse-glow': '0' }]
      ]
  const actual = [...rule.cssRules]
  if (actual.length !== expected.length || actual.some((frame, index) => {
    const [offset, values] = expected[index]
    const properties = Array.from({ length: frame.style.length }, (_, i) => frame.style.item(i))
    return frame.keyText !== offset || properties.length !== Object.keys(values).length || properties.some(property => frame.style.getPropertyValue(property).replace(/\s+/g, '') !== (values[property] || '').replace(/\s+/g, ''))
  })) throw new Error('Unsupported reveal keyframes')
  if (type === 'tvExpand') {
    const staticRules = [...effect.ownerDocument.styleSheets].flatMap(sheet => [...sheet.cssRules]).filter(rule => rule.selectorText)
    const classes = [...effect.classList]
    const check = (suffix, expected) => {
      const rule = staticRules.findLast(rule => classes.some(name => rule.selectorText === `.${name}${suffix}`))
      return rule && rule.style.length === Object.keys(expected).length && Object.entries(expected).every(([property, value]) => rule.style.getPropertyValue(property).replace(/\s+/g, '') === value.replace(/\s+/g, ''))
    }
    if (!check('>*', { 'mask-image': 'linear-gradient(#000,#000)', '-webkit-mask-image': 'linear-gradient(#000,#000)', 'mask-repeat': 'no-repeat', '-webkit-mask-repeat': 'no-repeat', 'mask-position': 'center', '-webkit-mask-position': 'center', 'mask-size': 'var(--tv-collapse-mask-w) var(--tv-collapse-mask-h)', '-webkit-mask-size': 'var(--tv-collapse-mask-w) var(--tv-collapse-mask-h)' })
      || !check('::after', { 'content': '\'\'', 'pointer-events': 'none', 'opacity': 'var(--tv-collapse-glow)', 'left': '0px', 'right': '0px', 'top': '50%', 'height': '2px', 'margin-top': '-1px', 'background-image': 'linear-gradient(90deg,transparent,#fff 12%,#fff 88%,transparent)', 'box-shadow': '0 0 13.6px 1.2px rgba(255,255,255,.77)', 'background-position-x': 'initial', 'background-position-y': 'initial', 'background-size': 'initial', 'background-repeat': 'initial', 'background-attachment': 'initial', 'background-origin': 'initial', 'background-clip': 'initial', 'background-color': 'initial' })) throw new Error('Unsupported TV reveal composition')
  }
  const duration = seconds(css.animationDuration)
  if (seconds(css.animationDelay || '0s') !== 0 || css.animationIterationCount !== '1' || css.animationDirection !== 'normal' || css.animationFillMode !== 'backwards' || !(duration > 0 && duration <= 5)) throw new Error('Unsupported reveal timing')
  return { type, duration, ease: cssEase(css.animationTimingFunction) }
}

// Only sequential wrappers that settle back to identity can share a native
// transform. Overlapping/nested transforms need matrix-aware composition.
function appendEffect(current, effect, start) {
  if (!effect.tracks || !Object.keys(effect.tracks).length) return current
  if (effect.textTilt || current.textTilt && Object.keys(effect.tracks).some(property => !['opacity', 'x', 'y'].includes(property))) throw new Error('Nested 3D text effects need an adapter')
  const at = Math.min(...Object.values(effect.tracks).map(frames => frames[0].time))
  if (Object.entries(current.tracks || {}).some(([property, frames]) => frames.at(-1).time > at + 1e-9 || (!(current.textTilt && property === 'originY') && frames.at(-1).value !== identityValue(property)))) throw new Error('Overlapping or unsettled nested effects need an adapter')
  let pivot = effect.transformOrigin || current.transformOrigin
  if (effect.transformOrigin && current.transformOrigin && (effect.transformOrigin.x !== current.transformOrigin.x || effect.transformOrigin.y !== current.transformOrigin.y)) {
    // A sequential planar scale about Q is a scale about P followed by
    // (Q-P)*(1-scale). Both tracks use the same easing, including fractional cycles.
    const translationOnly = Object.keys(effect.tracks).every(key => ['opacity', 'x', 'y'].includes(key))
    if (!translationOnly && Object.keys(effect.tracks).some(key => !['opacity', 'scaleX', 'scaleY'].includes(key))) throw new Error('Nested effects with different origins need an adapter')
    for (const [axis, scale] of [['x', 'scaleX'], ['y', 'scaleY']]) {
      const delta = effect.transformOrigin[axis] - current.transformOrigin[axis]
      if (delta && effect.tracks[scale]) effect.tracks[axis] = effect.tracks[scale].map(frame => ({ ...frame, value: delta * (1 - frame.value) }))
    }
    pivot = current.transformOrigin
  }
  const tracks = structuredClone(current.tracks || {})
  for (const [property, frames] of Object.entries(effect.tracks)) {
    if (frames[0].value !== identityValue(property)) throw new Error('Nested effect must begin at identity')
    const previous = tracks[property] || [{ time: start, value: identityValue(property), easing: 'linear' }]
    previous.at(-1).easing = 'linear'
    if (sameTime(previous.at(-1).time, frames[0].time)) previous.pop()
    tracks[property] = [...previous, ...frames]
    if (tracks[property].length > 500) throw new Error('Too many effect keyframes')
  }
  return { tracks, transformOrigin: pivot, perspective: current.perspective || effect.perspective, ...(current.textTilt ? { textTilt: current.textTilt } : {}) }
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
  if (at < 0 || duration <= 0 || (!intermediate && iterations !== 1 && animationEnd > end + 1e-9)) throw new Error('Animation crosses slide boundary')
  if ((intermediate || iterations > 1) && ((!['', 'none'].includes(css.transform)) || !['', '1'].includes(css.opacity))) throw new Error('Intermediate effect has nonidentity underlying styles')
  const tracks = {}
  const owner = effect.parentElement
  const ownerCss = style(owner)
  const recipeFrames = [...rule.cssRules]
  const isTextTilt = ['text', 'video'].includes(owner.getAttribute('data-eltype'))
    && effect.id === owner.id.replace('element-', 'effIn') && !intermediate && iterations === 1
    && ['', 'normal'].includes(css.animationDirection) && recipeFrames.length === 2
    && recipeFrames[0].keyText === '0%' && recipeFrames[1].keyText === '100%'
    && recipeFrames[0].style.transform === 'translateY(-200px) rotateX(-30deg) scale(0)'
    && recipeFrames[1].style.transform === 'translateY(0) rotateX(0) scale(1)'
    && recipeFrames[0].style.transformOrigin === '50% 100%' && recipeFrames[1].style.transformOrigin === '50% 480px'
  const textTilt = isTextTilt ? { perspective: px(ownerCss.getPropertyValue('perspective')), width: geometry.w, height: geometry.h } : undefined
  if (textTilt && (!Number.isFinite(textTilt.perspective) || textTilt.perspective < 1 || textTilt.perspective > 100000
    || !['center', 'center center', '50% 50%'].includes(ownerCss.getPropertyValue('perspective-origin'))
    || !['', 'none'].includes(ownerCss.transform) || !['', 'none'].includes(css.transform))) throw new Error('Unsupported 3D text perspective')
  const parsedFrames = []
  let transformOrigin
  for (const frame of rule.cssRules) {
    const selectors = frame.keyText.split(',').map(selector => selector.trim())
    if (selectors.length > 50 || selectors.some(selector => !/^(?:from|to|(?:\d*\.)?\d+%)$/.test(selector))) throw new Error('Unsupported keyframe selector')
    const fractions = selectors.map(selector => selector === 'from' ? 0 : selector === 'to' ? 1 : Number.parseFloat(selector) / 100)
    if (fractions.some(fraction => !Number.isFinite(fraction) || fraction < 0 || fraction > 1)) throw new Error('Unsupported keyframe selector')
    const properties = Array.from({ length: frame.style.length }, (_, index) => frame.style.item(index))
    const blur = /^blur\((\d+(?:\.\d+)?)px\)$/.exec(frame.style.filter)
    const noOpBlur = /^blur\(0(?:\.0+)?(?:px)?\)$/.test(frame.style.filter)
    if (noOpBlur && css.filter && css.filter !== 'none' && !/^blur\(0(?:\.0+)?(?:px)?\)$/.test(css.filter)) throw new Error('Unsupported underlying filter')
    if (properties.some(p => !['transform', 'transform-origin', 'opacity', 'animation-timing-function'].includes(p) && !(p === 'filter' && (noOpBlur || blur && Number(blur[1]) <= 100 && recipeFrames.every(f => !f.style.filter || /^blur\(\d+(?:\.\d+)?px\)$/.test(f.style.filter)) && recipeFrames.filter(f => f.style.filter).length >= 2)))) throw new Error(`Unsupported animated properties: ${properties.join(', ')}`)
    const values = transformValues(frame.style.transform || '')
    if (blur && recipeFrames.some(f => /^blur\((?!0(?:px)?\))/.test(f.style.filter))) values.blur = Number(blur[1])
    if (frame.style.opacity !== '') values.opacity = Number(frame.style.opacity)
    if (fractions.includes(0) || fractions.includes(1) || frame.style.transformOrigin) {
      const origin = originPixels(frame.style.transformOrigin || css.transformOrigin, geometry.w, geometry.h)
      if (!textTilt && transformOrigin && (origin.x !== transformOrigin.x || origin.y !== transformOrigin.y)) throw new Error('Changing transform origins need an adapter')
      if (textTilt) values.originY = origin.y
      else transformOrigin = origin
    }
    for (const fraction of fractions) parsedFrames.push({ fraction, values: { ...values }, hasTransform: Boolean(frame.style.transform), easing: cssEase(frame.style.animationTimingFunction || css.animationTimingFunction) })
  }
  if (parsedFrames.some(frame => frame.values.rotationY) && !parsedFrames.some(frame => frame.values.rotationX)) {
    for (const frame of parsedFrames) if (frame.values.rotationX === 0) { delete frame.values.rotationX; frame.values.rotationY = 0 }
  }
  const transformProperties = new Set(parsedFrames.flatMap(frame => Object.keys(frame.values).filter(key => key !== 'opacity' && key !== 'blur')))
  let perspective
  if (transformProperties.has('z')) {
    const owner = effect.closest('[data-eltype]') || effect.parentElement
    const ownerCss = style(owner)
    perspective = px(ownerCss.getPropertyValue('perspective'))
    const centre = transformOrigin && sameTime(transformOrigin.x, geometry.w / 2) && sameTime(transformOrigin.y, geometry.h / 2)
    if (!['image', 'svg', 'text'].includes(owner.getAttribute('data-eltype')) || !['effIn', 'effOut'].some(prefix => effect.id === owner.id.replace('element-', prefix))
      || [...transformProperties].some(property => !['z', 'rotation', 'rotationX'].includes(property)) || !centre
      || !['center', 'center center', '50% 50%'].includes(ownerCss.getPropertyValue('perspective-origin'))
      || !['', 'none'].includes(css.transform) || !['', 'none'].includes(ownerCss.transform)
      || !Number.isFinite(perspective) || perspective < 1 || perspective > 100000
      || parsedFrames.some(frame => (frame.values.z ?? 0) >= perspective - 1 || (frame.values.z ?? 0) < -100000)) {
      throw new Error('Unsupported depth entrance composition')
    }
  }
  if ((transformProperties.has('rotationX') || transformProperties.has('rotationY')) && !transformProperties.has('z') && !textTilt) {
    const owner = effect.closest('[data-eltype]') || effect.parentElement
    const ownerCss = style(owner)
    perspective = px(ownerCss.getPropertyValue('perspective'))
    const centre = transformOrigin && sameTime(transformOrigin.x, geometry.w / 2) && sameTime(transformOrigin.y, geometry.h / 2)
    if (!['image', 'text'].includes(owner.getAttribute('data-eltype')) || !['effIn', 'effOut'].some(prefix => effect.id === owner.id.replace('element-', prefix))
      || transformProperties.size !== 1 || !centre || css.getPropertyValue('backface-visibility') !== 'hidden'
      || !['center', 'center center', '50% 50%'].includes(ownerCss.getPropertyValue('perspective-origin'))
      || !['', 'none'].includes(css.transform) || !['', 'none'].includes(ownerCss.transform)
      || !Number.isFinite(perspective) || perspective < 1 || perspective > 100000
      || parsedFrames.some(frame => Math.abs(frame.values.rotationX ?? frame.values.rotationY ?? 0) > 90)) {
      throw new Error('Unsupported 3D image flip composition')
    }
  }
  if (['scaleX', 'scaleY', 'rotation', 'rotationX', 'rotationY'].some(property => transformProperties.has(property))) {
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
    if (property === 'opacity' && frames[0]?.time === at && frames.at(-1).time < at + duration && !intermediate && css.opacity !== '0') frames.push({ time: at + duration, value: css.opacity === '' ? 1 : Number(css.opacity) })
    if (frames.length < 2 || !sameTime(frames[0].time, at) || !sameTime(frames.at(-1).time, at + duration)) throw new Error('Keyframes need explicit start and end values')
    if (css.animationDirection === 'reverse') {
      const original = structuredClone(frames)
      frames.splice(0, frames.length, ...original.toReversed().map((frame, index) => ({
        time: Number((2 * at + duration - frame.time).toFixed(9)), value: frame.value,
        ...(index < original.length - 1 ? { easing: reverseEase(original[original.length - index - 2].easing || cssEase(css.animationTimingFunction)) } : {})
      })))
    }
    if (!(textTilt && property === 'originY') && !intermediate && frames.at(-1).value !== identityValue(property) && !['forwards', 'both'].includes(css.animationFillMode)) throw new Error('Animation reset after completion needs an adapter')
    if (!intermediate && iterations === 1 && animationEnd > end + 1e-9) {
      // The source slide hides this wrapper before its animation completes.
      // Preserve the visible portion and original easing, not a faster tween.
      frames.splice(0, frames.length, ...boundedRepeatedFrames(frames, at, duration, end, identityValue(property), false, false))
    } else if (intermediate && ((iterations > 1 && (!Number.isInteger(iterations) || animationEnd > end + 1e-9)) || frames[0].value !== identityValue(property))) {
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
  return { tracks, transformOrigin, perspective, ...(textTilt ? { textTilt } : {}) }
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

// Some legacy authoring exports repeat numeric IDs. The authored timeline and
// painted DOM are both ordered. Reconcile only when every timed occurrence maps
// one-to-one, before looking up content, effects or native link IDs.
function reconcileLegacyIds(document, source) {
  const root = document.getElementById('designContainer')
  if (!root || !Array.isArray(source.animations)) return false
  const containers = [...root.querySelectorAll('[id^="slide-"]')]
  const elements = [...root.querySelectorAll('[data-eltype][id^="element-"]')]
  if (elements.length > 199 || containers.length > 50) throw new Error('Too many elements or slides')
  const duplicated = nodes => new Set(nodes.filter((node, i) => nodes.findIndex(other => other.id === node.id) < i).map(node => node.id))
  const repeatedSlides = duplicated(containers), repeatedElements = duplicated(elements)
  if (!repeatedSlides.size && !repeatedElements.size) return false
  if (containers.length !== source.animations.length || containers.some((node, i) => node.id !== `slide-${source.animations[i].id}`)) throw new Error('Ambiguous slide ownership')
  const used = [...containers, ...elements].map(node => Number(node.id.split('-')[1]))
  if (!used.every(Number.isSafeInteger) || Math.max(...used) >= 1000000) throw new Error('Invalid legacy source ID')
  let next = Math.max(...used) + 1
  const seenSlides = new Set(), seenElements = new Set()
  const css = [...document.querySelectorAll('style')].map(sheet => sheet.textContent).join('\n')
  const media = [...source.audioElements || [], ...source.videoElements || [], ...source.customAnimations || []]
  for (const [i, node] of containers.entries()) {
    const slide = source.animations[i]
    if (!Array.isArray(slide.elements)) throw new Error('Invalid slide metadata')
    if (repeatedSlides.has(node.id) && (slide.effInDuration || slide.effOutDuration || media.some(m => m.slideId === slide.id) || css.includes('#' + node.id))) throw new Error('Ambiguous slide ownership')
    if (seenSlides.has(node.id)) { slide.id = next++; node.id = `slide-${slide.id}` }
    seenSlides.add(node.id)
    const children = [...node.querySelectorAll('[data-eltype][id^="element-"]')]
    const ids = children.map(child => Number(child.id.slice(8)))
    const timings = slide.elements.filter(item => ids.includes(item.id))
    const timed = ids.filter(id => timings.some(item => item.id === id))
    if (timed.length !== timings.length || timed.some((id, k) => timings[k].id !== id)) throw new Error('Ambiguous element ownership')
    let j = 0
    for (const child of children) {
      const original = child.id, id = Number(original.slice(8))
      const timing = timings[j]?.id === id ? timings[j++] : undefined
      if (seenElements.has(original)) {
        const names = [original, ...['effIn', 'effMid', 'effOut', 'c-'].map(prefix => prefix + id)]
        if (!timing || media.some(m => m.elementId === id) || names.some(name => new RegExp('#' + name + '(?![\\w-])').test(css))) throw new Error('Ambiguous element ownership')
        const replacement = next++
        for (const inner of child.querySelectorAll('[id]')) {
          if (names.slice(1).includes(inner.id)) inner.id = inner.id.slice(0, -String(id).length) + replacement
        }
        child.id = 'element-' + replacement
        timing.id = replacement
      }
      seenElements.add(original)
    }
  }
  return true
}

/** Offline CSS export adapter for bounded, hard-cut slide sequences. Source scripts are parsed, never run. */
export async function convertTheBriefHtml(html, { reviewedRowLines = {}, reviewedRowHeights = {} } = {}) {
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
    const reconciledIds = reconcileLegacyIds(document, source)
    if (!source.animations?.length || source.animations.length > 50) throw new Error('Unsupported slide sequence or custom animations')
    const trackingIds = new Set()
    for (const animation of source.customAnimations || []) {
      const id = animation.elementId
      if (animation.type !== 'tracking' || animation.buildType !== 'buildIn' || animation.props?.letterSpacing !== 5 || trackingIds.has(id)
        || document.getElementById('element-' + id)?.getAttribute('data-eltype') !== 'text') throw new Error('Unsupported custom animations')
      trackingIds.add(id)
    }
    let duration = 0
    const hasSlideFades = source.animations.some(slide => slide.effInDuration > 0 || slide.effOutDuration > 0)
    const slides = source.animations.map((slide, index, all) => {
      if (slide.type !== 'slide' || !Array.isArray(slide.elements)) throw new Error('Invalid slide metadata')
      // The source player schedules slide overlap from the effect durations.
      // Some exports retain a "cross" label after both durations become zero.
      const zeroDurationCross = slide.crossTypeOut === 'cross' && slide.effInDuration === 0 && slide.effOutDuration === 0
      const fadeSequence = hasSlideFades && [slide.effInDuration, slide.effOutDuration].every(value => typeof value === 'number' && value >= 0 && value <= 5000)
        && (slide.effInDuration === (all[index - 1]?.effOutDuration ?? (slide.crossTypeOut === 'hide' ? all.at(-1).effOutDuration : 0)))
        && (slide.crossTypeOut === 'hide' || (index === all.length - 1 ? slide.effOutDuration === 0 && (!slide.crossTypeOut || ['show', 'cross'].includes(slide.crossTypeOut)) : !slide.crossTypeOut || slide.crossTypeOut === 'show'))
      if (slide.stop || (hasSlideFades ? !fadeSequence : slide.effInDuration || slide.effOutDuration || (slide.crossTypeOut && slide.crossTypeOut !== 'hide' && !zeroDurationCross))) throw new Error('Slide transitions/stop are not supported')
      if (!Number.isFinite(slide.duration) || slide.duration <= 0) throw new Error('Invalid slide duration')
      const start = duration
      // The source skips the cyclic entrance on first play. The final outgoing
      // overlap runs against the initial composition at the end of the cycle.
      const entranceMs = index === 0 ? 0 : slide.effInDuration
      duration += (slide.duration + (hasSlideFades ? entranceMs : 0)) / 1000
      return { ...slide, start, end: duration, visibleEnd: duration + (hasSlideFades ? slide.effOutDuration / 1000 : 0), entranceDuration: hasSlideFades ? entranceMs / 1000 : 0 }
    })
    const wrap = slides.at(-1).visibleEnd - duration
    duration += wrap
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
    if (elements.length > 199) throw new Error('Too many elements')
    const rules = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules].filter(rule => rule.type === 7))
    if (!Number.isInteger(source.loopCount) || source.loopCount < 0 || source.loopCount > 1000) throw new Error('Unsupported source loop count')
    const warnings = []
    if (reconciledIds) warnings.push('Repeated legacy IDs were separated using the matching authored timeline and source DOM order; review playback against the original design')
    const reviewedElements = new Set()
    if (hasSlideFades) {
      for (const slide of slides) {
        const outgoing = document.getElementById(`effOut${slide.id}`)
        if (outgoing || slide.crossTypeOut === 'hide' && slide.effOutDuration) {
          const css = outgoing && style(outgoing)
          const d = slide.effOutDuration / 1000
          if (!css || slide.crossTypeOut !== 'hide' || seconds(css.animationDuration) !== d || seconds(css.animationDelay) !== (slide.duration + slide.effInDuration) / 1000) throw new Error('Slide transitions/stop: outgoing timing differs from source')
          const rule = rules.findLast(rule => rule.name === css.animationName)
          const frames = rule && [...rule.cssRules]
          if (!frames || frames.length !== 2 || frames.some((f,i) => f.style.length !== 1 || f.keyText !== (i ? '100%' : '0%') || f.style.opacity !== String(i)) || css.animationDirection !== 'reverse' || css.animationIterationCount !== '1') throw new Error('Slide transitions/stop: unsupported outgoing effect')
          slide.exit = { at: slide.end, duration: d, ease: reverseEase(cssEase(css.animationTimingFunction)) }
        }
        const entrance = document.getElementById(`effIn${slide.id}`)
        if (!entrance && slide.crossTypeOut === 'hide' || !slide.entranceDuration) {
          if (entrance) throw new Error('Slide transitions/stop: unexpected scene entrance')
          continue
        }
        if (!entrance || seconds(style(entrance).animationDuration) !== slide.entranceDuration || seconds(style(entrance).animationDelay || '0s') !== 0) throw new Error('Slide transitions/stop: scene fade timing differs from metadata')
        const effect = effectTracks(entrance, style, rules, slide.start, slide.end, warnings, { w: source.width, h: source.height })
        const opacity = effect.tracks.opacity
        if (Object.keys(effect.tracks).length !== 1 || opacity?.length !== 2 || opacity[0].time !== slide.start || opacity[0].value !== 0 || opacity[1].value !== 1 || opacity[1].time !== slide.start + slide.entranceDuration) throw new Error('Slide transitions/stop: only complete scene fade-ins are supported')
        slide.fadeEase = opacity[0].easing
      }
      warnings.push('Scene fade-ins retain composited slide groups and overlapping source holds; review every transition before export')
    }
    const fonts = fontManifest(document, warnings)
    const externalFontStylesheets = [...document.querySelectorAll('link[rel="stylesheet"][href]')].map(link => link.getAttribute('href')).filter(href => /^https:\/\/fonts\.googleapis\.com\//i.test(href))
    if (source.hasClickTag || document.querySelector('a[href], [onclick]')) warnings.push('Click destinations are not migrated by this pilot')
    const layers = []
    const imageTransforms = []
    const audioTransforms = []
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
      let effectStart = slide.start + slide.entranceDuration + (timing.from || 0) / 1000
      let start = timing.from ? effectStart : slide.start
      let end = Math.min(slide.visibleEnd, timing.duration === undefined ? slide.visibleEnd : effectStart + timing.duration / 1000)
      let sourceInactiveTiming
      if (slides.length === 1 && !hasSlideFades && Number.isFinite(start) && start >= slide.end && start < 300
        && timing.duration === undefined && ['image', 'text', 'shape'].includes(element.getAttribute('data-eltype'))) {
        sourceInactiveTiming = { start, loopEnd: slide.end }
        // This element never becomes visible in the source loop. Retain its
        // editable content as a hidden layer and record the original schedule.
        // Its local entrance remains editable if a designer later unhides it.
        effectStart = start = slide.start
        end = slide.end
        warnings.push(`${element.id}: scheduled at ${sourceInactiveTiming.start}s after the ${slide.end}s loop; retained as a hidden editable layer with its original schedule recorded`)
      }
      if (!(start >= 0 && end > start)) throw new Error('Invalid element presence')
      const clipToPresence = slides.length > 1 || end < duration
      const layerBase = { ...base, slideId: `source-slide:${slide.id}`, linkId: `source:${sourceId}`, x: px(css.left), y: px(css.top), w: px(css.width), h: px(css.height), zIndex: id, startTime: start, endTime: end, ...(clipToPresence ? { clipToPresence: true } : {}) }
      // Only the source element owns designer group membership. Inner slate-* markers describe text content.
      const groupNumber = /^cgroup-(\d{1,16})$/.exec(element.getAttribute('data-elgroup') || '')?.[1]
      if (groupNumber) layerBase.timelineGroup = { id: `${layerBase.slideId}:cgroup-${groupNumber}`, name: `Group ${groupNumber}` }
      if (sourceInactiveTiming) Object.assign(layerBase, { hidden: true, sourceInactiveTiming })
      if (hasSlideFades) {
        layerBase.slideFade = { id: layerBase.slideId, start: slide.start, end: slide.visibleEnd, duration: slide.fadeEase ? slide.entranceDuration : 0, ...(slide.exit ? { exit: slide.exit } : {}), ease: slide.fadeEase || 'cubic-bezier(0,0,1,1)' }
        layerBase.animInStart = effectStart
      }
      if ([layerBase.x, layerBase.y, layerBase.w, layerBase.h].some(n => !Number.isFinite(n))) throw new Error('Unsupported element geometry')
      if (css.mixBlendMode && css.mixBlendMode !== 'normal') {
        if (/^(multiply|screen|overlay|darken|lighten|color-dodge|color-burn|hard-light|soft-light|difference|exclusion|hue|saturation|color|luminosity)$/.test(css.mixBlendMode)) layerBase.mixBlendMode = css.mixBlendMode
        else warnings.push(`${element.id}: unsupported native blend mode ${css.mixBlendMode}`)
      }
      let keyframes = {}
      let wordPop = null
      try {
        wordPop = sourceWordPop(element, sourceId, style, rules)
        const entrance = document.getElementById(`effIn${sourceId}`)
        const reveal = sourceReveal(entrance, style, rules)
        if (reveal) {
          if (start + reveal.duration > end + 1e-6) throw new Error('Reveal crosses layer boundary')
          layerBase.reveal = reveal
        }
        let tracking
        if (trackingIds.has(sourceId)) {
          const target = [entrance, element.querySelector('.text-content')].find(node => node && rules.some(rule => rule.name === style(node).animationName))
          const css = target && style(target)
          const frames = css && [...rules.findLast(rule => rule.name === css.animationName).cssRules]
          const first = frames?.[0]?.style, last = frames?.[1]?.style
          if (frames?.length !== 2 || frames[0].keyText !== '0%' || frames[1].keyText !== '100%' || first.length !== 5 || last.length !== 5
            || first.opacity !== '0' || last.opacity !== '1' || first.letterSpacing !== '5px' || !Number.isFinite(px(last.letterSpacing))
            || first.width !== `var(--eff-tracking-buildIn-${sourceId}-width)` || first.left !== `var(--eff-tracking-buildIn-${sourceId}-left)`
            || first.position !== 'absolute' || last.position !== 'absolute' || px(last.left) !== 0 || !Number.isFinite(px(last.width))
            || css.animationIterationCount !== '1' || css.animationDirection !== 'normal') throw new Error('Unsupported text tracking recipe')
          const at = effectStart + seconds(css.animationDelay || '0s'), d = seconds(css.animationDuration)
          const ease = cssEase(css.animationTimingFunction)
          layerBase.textTracking = { at, duration: d, ease, from: 5, to: px(last.letterSpacing), width: px(last.width), glyphScale: Number(element.querySelector('.text-content')?.dataset.glyphScaleX || 1) }
          tracking = { tracks: { opacity: [{ time: at, value: 0, easing: ease }, { time: at + d, value: 1 }] } }
        }
        let effect = tracking || (wordPop || reveal ? {} : effectTracks(document.getElementById(`effIn${sourceId}`), style, rules, effectStart, end, warnings, layerBase))
        const middle = document.getElementById(`effMid${sourceId}`)
        const glyphs = middle && [...middle.querySelectorAll('[data-gradient-glyph="true"]')]
        const whole = middle?.querySelector('.text-content')
        const wholeSweep = whole && rules.some(rule => rule.name === style(whole).animationName && [...rule.cssRules].some(f => f.style.backgroundClip === 'text'))
        if (wholeSweep) glyphs.push(whole)
        if (glyphs?.length) {
          const glyph = glyphs[0], css = style(glyph)
          const rule = rules.findLast(rule => rule.name === css.animationName)
          const frames = rule && [...rule.cssRules]
          const g = frames?.[0]?.style.backgroundImage
          const validated = /^linear-gradient\(-270deg,\s*#([\da-f]{3}|[\da-f]{6}) 0,\s*#([\da-f]{3}|[\da-f]{6}) 100%(?:,\s*#([\da-f]{3}|[\da-f]{6}) 100%)?\)$/i.exec(g || '')
          const raw = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n')
          const recipe = raw.split('@keyframes ' + css.animationName + '{').at(-1)?.split('}}')[0] || ''
          if (glyphs.length !== 1 || glyph.textContent.trim() !== element.textContent.trim() || !validated || frames?.length !== 2
            || frames[0].keyText !== '100%' || frames[1].keyText !== '0%' || frames[1].style.backgroundImage !== g
            || !(wholeSweep ? recipe.includes('background-position:200% center') && recipe.includes('background-position:0 center') : [0, -2].every(n => recipe.includes(' * ' + n + ' - var(--ctp-gw-wx,0px)) center')))
            || !frames.every(frame => frame.style.backgroundClip === 'text' && (wholeSweep && frame.style.backgroundSize === '200% auto' || /^calc\(var\(--ctp-gw-tw,[\d.]+px\) \* 2\) auto$/.test(frame.style.backgroundSize)))
            || css.animationTimingFunction !== 'linear' || css.animationFillMode !== 'none' || css.animationDirection !== 'normal') throw new Error('Unsupported gradient text motion')
          const hex = s => '#' + (s.length === 3 ? [...s].map(c => c + c).join('') : s)
          const gradient = 'linear-gradient(-270deg,' + validated.slice(1).filter(Boolean).map((s,i) => hex(s) + (i ? ' 100%' : ' 0%')).join(',') + ')'
          layerBase.textSweep = { gradient, ...(wholeSweep ? { wholeRow: true } : {}), at: effectStart + seconds(css.animationDelay), duration: seconds(css.animationDuration), iterations: Number(css.animationIterationCount) }
        } else if (middle) {
          try {
            effect = appendEffect(effect, effectTracks(middle, style, rules, effectStart, end, warnings, layerBase, true), effectStart)
          } catch (cause) {
            throw new Error(`${middle.id}: ${cause.message}`, { cause })
          }
        }
        const exit = document.getElementById(`effOut${sourceId}`)
        if (exit) {
          const exitStart = effectStart + seconds(style(exit).animationDelay || '0s')
          if (exitStart >= end) warnings.push(`${exit.id}: exit at ${exitStart}s is outside the ${duration}s loop`)
          else {
            let target = exit
            if (wordPop && exit.getAttribute('data-words-animation') === 'true') {
              // A single painted token covers the whole text layer. Its exit
              // opacity therefore composes exactly with the native word entrance.
              const tokens = [...exit.querySelectorAll('span.word.out')]
              const token = tokens[0]
              const rule = token && rules.findLast(r => r.name === style(token).animationName)
              if (tokens.length !== 1 || token.textContent.trim() !== element.textContent.trim()
                || !rule || [...rule.cssRules].some(frame => frame.style.length !== 1 || frame.style.item(0) !== 'opacity')) throw new Error('Staggered word exit needs an adapter')
              target = token
            }
            effect = appendEffect(effect, effectTracks(target, style, rules, effectStart, end, warnings, layerBase), effectStart)
          }
        }
        keyframes = effect.tracks || {}
        if (effect.textTilt) layerBase.textTilt = effect.textTilt
        if (effect.perspective) {
          const allowed = keyframes.z ? ['opacity', 'z', 'rotation', 'rotationX', 'scaleX', 'scaleY'] : ['opacity', 'rotationX', 'rotationY', 'scaleX', 'scaleY']
          if (Object.keys(keyframes).some(property => !allowed.includes(property))) throw new Error('Nested 3D transforms need an adapter')
          layerBase.imageFlipPerspective = effect.perspective
          const forward = Math.max(0, ...(keyframes.z || []).map(frame => frame.value))
          if (forward > 0) {
            // Keep the native depth track behind its camera while preserving
            // the exact source projection d/(d-z) at every point on the curve.
            const camera = effect.perspective - forward
            const scale = effect.perspective / camera
            if (camera < 1 || scale > 8 || keyframes.scaleX || keyframes.scaleY) throw new Error('Unsupported forward-depth scale composition')
            layerBase.imageFlipPerspective = camera
            keyframes.z = keyframes.z.map(frame => ({ ...frame, value: frame.value - forward }))
            for (const axis of ['scaleX', 'scaleY']) keyframes[axis] = [{ time: start, value: scale, easing: 'linear' }, { time: end, value: scale }]
          }
        }
        if (effect.transformOrigin) layerBase.transformOrigin = effect.transformOrigin
      } catch (error) {
        warnings.push(`${element.id}: ${error.message}; animation not converted`)
        keyframes = {}
        delete layerBase.transformOrigin
        delete layerBase.imageFlipPerspective
        delete layerBase.textTilt
      }
      // Explicit holds avoid Banner Studio's default entrance/exit fades and
      // preserve the full source duration when the entrance finishes early.
      if (hasSlideFades && effectStart > start) {
        const entrance = document.getElementById(`effIn${sourceId}`)
        if (entrance && !wordPop && !['backwards', 'both'].includes(style(entrance).animationFillMode)) throw new Error(`${element.id}: scene entrance requires a backwards-filled layer effect`)
        for (const frames of Object.values(keyframes)) if (frames[0].time > start) {
          frames.unshift({ time: start, value: frames[0].value, easing: 'linear' })
        }
      }
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
        if (audioConfig?.soundOnHover) throw new Error(`Audio ${sourceId}: hover playback requires an audio adapter`)
        const stages = [audioConfig?.buildIn, audioConfig?.buildMid, audioConfig?.buildOut].filter(Boolean)
        if (stages.some(stage => !['none', 'instant', 'audio', 'fadeAudio'].includes(stage.type))) throw new Error(`Audio ${sourceId}: unsupported source audio effect`)
        const hasAudioFade = stages.some(stage => stage.type === 'fadeAudio')
        const stageDuration = stages.reduce((sum, stage) => sum + stage.duration, 0)
        if (hasAudioFade && (stages.length !== 3 || stages.some(stage => !Number.isFinite(stage.duration) || stage.duration < 0 || stage.duration > 300 || stage.delay !== 0) || audioConfig.buildMid.type !== 'audio' || !(stageDuration > 0))) throw new Error(`Audio ${sourceId}: source fades require exported-clip reconciliation: unsupported fade timing`)
        const delay = audioConfig?.buildIn?.delay
        if (delay !== undefined && (!Number.isFinite(delay) || delay < 0 || Math.abs(slide.start + delay - start) > 1e-6)) throw new Error(`Audio ${sourceId}: source audio presence requires reconciliation`)
        let verifyExportedDuration
        if (audioConfig?.endTime !== undefined && audioConfig?.duration !== undefined) {
          const clipDuration = audioConfig.endTime - offset
          if (!Number.isFinite(clipDuration) || clipDuration <= 0 || clipDuration > 300) throw new Error(`Audio ${sourceId}: invalid clip duration`)
          const genericDuration = Math.abs(clipDuration - audioConfig.duration) < 1e-6
          const hasPlainPlaybackStages = audioConfig.buildMid?.type === 'audio'
            && stages.every((stage, index) => stage.delay === (index === 0 ? delay ?? 0 : 0))
          // The editor still plays the whole clip with no middle effect and an
          // instant exit delayed by that middle interval.
          const hasInstantExit = audioConfig.buildIn?.type === 'instant' && audioConfig.buildIn.delay === 0
            && audioConfig.buildMid?.type === 'none' && audioConfig.buildMid.delay === 0
            && audioConfig.buildOut?.type === 'instant' && audioConfig.buildOut.delay === audioConfig.buildMid.duration
          const hasMatchingStages = stages.length === 3 && (hasPlainPlaybackStages || hasInstantExit)
            && stages.every(stage => Number.isFinite(stage.duration) && stage.duration >= 0)
            // Exported MP3 trims can be rounded to codec frame boundaries.
            // Package assembly independently verifies the actual file duration.
            && Math.abs(stageDuration - clipDuration) <= 0.05
          const visibleDuration = Math.min(clipDuration, slide.end - start)
          if (offset || (!genericDuration && !hasAudioFade) || clipDuration > visibleDuration + 1e-6) {
            if (!hasMatchingStages || Math.abs(end - (start + visibleDuration)) > 1e-6) {
              throw new Error(offset ? `Audio ${sourceId}: source clip offset ${offset}s requires exported-clip reconciliation` : `Audio ${sourceId}: clip duration requires reconciliation`)
            }
            verifyExportedDuration = clipDuration
            warnings.push(`Audio ${sourceId}: source trim ${offset}–${audioConfig.endTime}s verified against the exported soundtrack file before import`)
          } else if (!genericDuration && !hasMatchingStages) throw new Error(`Audio ${sourceId}: clip duration requires reconciliation`)
          if (Math.abs(layerBase.endTime - (start + visibleDuration)) > 1e-6) {
            layerBase.endTime = start + visibleDuration
            layerBase.keyframes = { opacity: holdOpacity(start, layerBase.endTime) }
            warnings.push(`Audio ${sourceId}: presence reconciled to the authored ${clipDuration}s clip trim rather than the generic element duration; review soundtrack timing`)
          }
        } else if (offset) throw new Error(`Audio ${sourceId}: source clip offset ${offset}s requires exported-clip reconciliation`)
        if (hasAudioFade) {
          // Keep fades at their authored positions in the full exported clip.
          // A shorter slide stops playback; it must not compress the fade into
          // the visible interval or discard the original soundtrack tail.
          if (Math.abs(layerBase.endTime - start - Math.min(stageDuration, slide.end - start)) > 1e-6) throw new Error(`Audio ${sourceId}: fade stages differ from the exported clip`)
          audioTransforms.push({ layerId: id, duration: stageDuration, fadeIn: audioConfig.buildIn.type === 'fadeAudio' ? audioConfig.buildIn.duration : 0, fadeOut: audioConfig.buildOut.type === 'fadeAudio' ? audioConfig.buildOut.duration : 0 })
          warnings.push(`Audio ${sourceId}: authored volume fades are baked into a managed soundtrack; the original MP3 remains in the source ZIP`)
        } else if (verifyExportedDuration !== undefined) {
          audioTransforms.push({ layerId: id, duration: verifyExportedDuration, fadeIn: 0, fadeOut: 0 })
        }
        layers.push({ ...layerBase, id: id++, type: 'audio', name: `Audio ${sourceId}`, src: localAsset(sources[0].getAttribute('src')), x: 0, y: 0, w: 1, h: 1, volume, ...(audio.muted || audio.hasAttribute('muted') || audioConfig?.muted === true ? { muted: true } : {}) })
      } else if (type === 'video') {
        // Bounded video adapter: one local muted autoplay clip that starts at media
        // time zero with its layer. Trim starts, sound, hover playback, playback past
        // the slide and framing other than cover and centred mirrors remain holds.
        const videos = [...element.querySelectorAll('video')]
        if (videos.length !== 1 || !videos[0].getAttribute('src')) throw new Error(`Video ${sourceId}: unsupported video source`)
        const video = videos[0]
        if (video.hasAttribute('controls')) throw new Error(`Video ${sourceId}: player controls require an adapter`)
        const src = localAsset(video.getAttribute('src'))
        if (!/\.mp4$/i.test(src)) throw new Error(`Video ${sourceId}: only MP4 video is supported`)
        const config = source.videoElements?.find(item => item.elementId === sourceId && item.slideId === slide.id)
        if (!config || localAsset(String(config.src || '')) !== src) throw new Error(`Video ${sourceId}: missing or mismatched source video settings`)
        if (config.autoplay !== true) throw new Error(`Video ${sourceId}: click-to-play video requires an adapter`)
        if (config.soundOnHover) throw new Error(`Video ${sourceId}: hover playback requires an adapter`)
        if (config.keepPlayingPastSlide) throw new Error(`Video ${sourceId}: playback past its slide requires an adapter`)
        if (typeof config.volume !== 'number' || config.volume < 0 || config.volume > 100) throw new Error(`Video ${sourceId}: invalid source volume`)
        const audible = config.volume > 0 && !(video.muted || video.hasAttribute('muted'))
        const mediaStart = config.startTime ?? 0
        const mediaEnd = config.endTime
        if (!Number.isFinite(mediaStart) || mediaStart !== 0) throw new Error(`Video ${sourceId}: source clip start ${mediaStart}s requires exported-clip reconciliation`)
        if (!Number.isFinite(mediaEnd) || mediaEnd <= mediaStart || mediaEnd > 300) throw new Error(`Video ${sourceId}: invalid source clip end`)
        const delay = config.delay ?? 0
        if (!Number.isFinite(delay) || delay < 0 || Math.abs(slide.start + delay - start) > 1e-3) throw new Error(`Video ${sourceId}: source video start requires reconciliation with its layer`)
        if (typeof config.loop !== 'boolean') throw new Error(`Video ${sourceId}: invalid source loop setting`)
        const videoCss = style(video)
        // Preserve composition on the actual media ancestry. Flattening these
        // wrappers without their alpha/filter makes blended video too bright.
        const ancestry = []
        for (let node = video; node; node = node.parentElement) {
          ancestry.push(node)
          if (node === element) break
        }
        let videoOpacity = 1
        const videoFilters = []
        for (const node of ancestry) {
          const nodeCss = style(node)
          const opacity = nodeCss.opacity === '' ? 1 : Number(nodeCss.opacity)
          if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error(`Video ${sourceId}: unsupported opacity`)
          if (nodeCss.animationName && nodeCss.animationName !== 'none' && opacity !== 1) throw new Error(`Video ${sourceId}: animated underlying opacity requires an adapter`)
          videoOpacity *= opacity
          if (node !== element && nodeCss.mixBlendMode && nodeCss.mixBlendMode !== 'normal') throw new Error(`Video ${sourceId}: nested blend mode requires an adapter`)
          if (nodeCss.filter && nodeCss.filter !== 'none') {
            if (nodeCss.animationName && nodeCss.animationName !== 'none') throw new Error(`Video ${sourceId}: animated filter requires an adapter`)
            videoFilters.push(nodeCss.filter)
          }
        }
        let masks = 0
        for (const node of ancestry) {
          const values = [...sourceDeclarations(document, node, 'mask-image|-webkit-mask-image'), style(node).getPropertyValue('mask-image'), style(node).getPropertyValue('-webkit-mask-image'), node.style.getPropertyValue('mask-image'), node.style.getPropertyValue('-webkit-mask-image')].filter(value => value && value !== 'none')
          if (!values.length) continue
          const expected = 'linear-gradient(0deg,rgba(0,0,0,1)45%,rgba(0,0,0,0.8)78%,rgba(0,0,0,0)100%)'
          if (++masks > 1 || values.some(value => value.replace(/\s+/g, '') !== expected)
            || [...sourceDeclarations(document, node, 'mask-repeat|-webkit-mask-repeat')].some(value => value !== 'no-repeat')
            || [...sourceDeclarations(document, node, 'mask-position|-webkit-mask-position')].some(value => value !== 'center')
            || [...sourceDeclarations(document, node, 'mask-size|-webkit-mask-size')].some(value => value !== '100% 100%')
            || [...sourceDeclarations(document, node, 'mask-origin|-webkit-mask-origin')].some(value => value !== 'content-box')) throw new Error(`Video ${sourceId}: unsupported media mask composition`)
          layerBase.mediaMask = 'fadeTop'
        }
        const videoFilter = videoFilters.join(' ')
        if (videoFilter && !isSafeBannerImageFilter(videoFilter)) throw new Error(`Video ${sourceId}: unsupported static filter`)
        if (videoFilters.length > 1 || /(?:blur|drop-shadow)\(/.test(videoFilter)) throw new Error(`Video ${sourceId}: spatial or nested filters require an adapter`)
        layerBase.opacity = videoOpacity
        layerBase.keyframes = { ...layerBase.keyframes, opacity: layerBase.keyframes.opacity.map(frame => ({ ...frame, value: frame.value * videoOpacity })) }
        if (videoFilter) layerBase.visualFilter = videoFilter
        let fit = videoCss.objectFit || 'fill'
        if (!['cover', 'contain', 'fill'].includes(fit)) throw new Error(`Video ${sourceId}: unsupported video fit ${fit}`)
        if (videoCss.objectPosition && !['50% 50%', 'center', 'center center'].includes(videoCss.objectPosition)) throw new Error(`Video ${sourceId}: unsupported video position`)
        let flipX = false, flipY = false
        for (const node of [element, ...element.querySelectorAll('div')]) {
          const nodeCss = style(node)
          if (nodeCss.transform && nodeCss.transform !== 'none') {
            // This wrapper mirrors the clipped viewport as a unit. Studio's
            // content flip does the same without re-encoding the source clip.
            const mirror = /^rotate\(0(?:deg)?\)\s+scale\((-?1),\s*(-?1)\)$/.exec(nodeCss.transform)
            const rotation = /^rotate\((-?\d+(?:\.\d+)?)deg\)$/.exec(nodeCss.transform)
            if ((!mirror && !rotation) || (node.parentElement !== element && !(rotation && node.parentElement?.closest('[data-eltype]') === element && /^eff(?:Out|In)\d+$/.test(node.parentElement.id))) || (rotation && Number(rotation[1]) % 90 !== 0 && !keyframes.scaleX) || !node.contains(video)
              || nodeCss.width !== '100%' || nodeCss.height !== '100%'
              || !['', 'center', '50% 50%'].includes(nodeCss.transformOrigin)
              || !['', '0px', 'auto'].includes(nodeCss.left) || !['', '0px', 'auto'].includes(nodeCss.top)
              || (nodeCss.animationName && nodeCss.animationName !== 'none') || masks) {
              throw new Error(`Video ${sourceId}: transformed video requires an adapter`)
            }
            if (rotation) {
              if (keyframes.rotation || JSON.stringify(keyframes.scaleX) !== JSON.stringify(keyframes.scaleY)) throw new Error(`Video ${sourceId}: rotated video with animated rotation or scale requires an adapter`)
              layerBase.rotation = Number(rotation[1])
            }
            flipX = mirror?.[1] === '-1'
            flipY = mirror?.[2] === '-1'
          }
          if (nodeCss.borderRadius && !/^0(px)?( 0(px)?)*$/.test(nodeCss.borderRadius)) throw new Error(`Video ${sourceId}: rounded video requires an adapter`)
        }
        if (videoCss.borderRadius && !/^0(px)?( 0(px)?)*$/.test(videoCss.borderRadius)) throw new Error(`Video ${sourceId}: rounded video requires an adapter`)
        // A cover crop uses a focal point. Extra zoom needs the visible
        // rectangle in source coordinates. Both leave the MP4 untouched.
        let focalX = 50, focalY = 50
        let videoCrop
        const boxW = px(videoCss.width), boxH = px(videoCss.height)
        const shift = /^(?:translate\((0|-?(?:\d+\.?\d*|\.\d+)px),\s*(0|-?(?:\d+\.?\d*|\.\d+)px)\))?(?:\s*rotate\(0(?:deg)?\))?$/.exec((videoCss.transform && videoCss.transform !== 'none') ? videoCss.transform.trim() : '')
        if (!shift) throw new Error(`Video ${sourceId}: transformed video requires an adapter`)
        const left = (px(videoCss.left) || 0) + (Number.parseFloat(shift[1]) || 0)
        const top = (px(videoCss.top) || 0) + (Number.parseFloat(shift[2]) || 0)
        if (Number.isFinite(boxW) && Number.isFinite(boxH) && (Math.abs(boxW - layerBase.w) > 1 || Math.abs(boxH - layerBase.h) > 1 || Math.abs(left) > 1 || Math.abs(top) > 1)) {
          const coversWidth = Math.abs(boxW - layerBase.w) <= 1 && boxH >= layerBase.h - 1
          const coversHeight = Math.abs(boxH - layerBase.h) <= 1 && boxW >= layerBase.w - 1
          const { w, h } = layerBase
          if (left > 1 || top > 1 || left + boxW < w - 1 || top + boxH < h - 1) throw new Error(`Video ${sourceId}: cropped video framing requires an adapter`)
          if (coversWidth || coversHeight) {
            const percent = (offset, free) => Math.abs(free) <= 1 ? 50 : Math.min(100, Math.max(0, Math.round(offset / free * 10000) / 100))
            focalX = percent(left, w - boxW)
            focalY = percent(top, h - boxH)
          } else {
            const viewport = style(video.parentElement)
            if (fit !== 'cover' || masks || viewport.overflow !== 'hidden' || viewport.width !== '100%' || viewport.height !== '100%'
              || left > 0 || top > 0 || left + boxW < w || top + boxH < h
              || w / boxW < 0.01 || h / boxH < 0.01) throw new Error(`Video ${sourceId}: cropped video framing requires an adapter`)
            videoCrop = { x: -left / boxW, y: -top / boxH, w: w / boxW, h: h / boxH }
          }
          fit = 'cover'
          videoFrames.push({ layerId: id, src, aspect: boxW / boxH })
        }
        layers.push({ ...layerBase, id: id++, type: 'video', name: `Video ${sourceId}`, src, fit, focalX, focalY, ...(videoCrop ? { videoCrop } : {}), ...(flipX ? { flipX } : {}), ...(flipY ? { flipY } : {}), mediaStart, mediaEnd, ...(config.loop ? { mediaLoop: true } : {}) })
        if (audible) {
          // Native video remains muted. Its verified embedded soundtrack becomes
          // a normal editable audio layer using the identical presence/clip clock.
          layers.push({ ...base, id: id++, zIndex: id, type: 'audio', name: `Video ${sourceId} soundtrack`,
            linkId: `source:${sourceId}:soundtrack`, src, x: 0, y: 0, w: 1, h: 1,
            slideId: layerBase.slideId,
            startTime: layerBase.startTime, endTime: layerBase.endTime,
            keyframes: { opacity: holdOpacity(layerBase.startTime, layerBase.endTime) },
            volume: config.volume / 100, mediaStart, mediaEnd,
            ...(layerBase.hidden ? { hidden: true } : {}), ...(config.loop ? { loopAudio: true } : {}) })
        }
      } else if (type === 'text') {
        const rows = [...element.querySelectorAll('.row')]
        if (!rows.length) throw new Error('Unsupported text layout')
        const transformed = [...element.querySelectorAll('div')].filter(div => style(div).transform && style(div).transform !== 'none')
        if (transformed.some(div => !/^rotate\(-?[\d.]+deg\)$/.test(style(div).transform)) || transformed.length > 1) throw new Error('Unsupported static text transform')
        const rotation = transformed.length ? Number.parseFloat(style(transformed[0]).transform.slice(7)) : 0
        if (rotation && (keyframes.scaleX || keyframes.scaleY || keyframes.rotation)) {
          const origin = layerBase.transformOrigin
          if (!layerBase.textTilt && (keyframes.rotation || !keyframes.scaleX || JSON.stringify(keyframes.scaleX) !== JSON.stringify(keyframes.scaleY)
            || (origin && (Math.abs(origin.x - layerBase.w / 2) > 0.001 || Math.abs(origin.y - layerBase.h / 2) > 0.001)))) {
            throw new Error('Nested text rotation with scale/rotation needs an adapter')
          }
          // Uniform scale and a static rotation commute when both use the
          // same center. Each intervening box must fill the source element.
          for (let node = transformed[0]; node !== element; node = node.parentElement) {
            const css = style(node)
            if (css.width !== '100%' || css.height !== '100%' || !['', 'center', '50% 50%'].includes(css.transformOrigin)
              || [css.left, css.top, css.marginLeft, css.marginTop, css.paddingLeft, css.paddingTop].some(v => !['', 'auto', '0', '0px'].includes(v))) {
              throw new Error('Nested text rotation with scale/rotation needs an adapter')
            }
          }
        }
        if (layerBase.textTilt && rows.length !== 1) throw new Error('3D text entrance requires one source row')
        if (rotation) {
          layerBase.rotation = rotation
          layerBase.transformOrigin = { x: layerBase.w / 2, y: layerBase.h / 2 }
        }
        let y = layerBase.y
        const rowHeights = []
        for (const [rowIndex, row] of rows.entries()) {
          const rowCss = style(row)
          const span = [...row.querySelectorAll('span')].find(item => item.textContent.trim() && !item.children.length && !item.closest('sup')) || row
          const textCss = style(span)
          if (textCss.fontStyle && !['normal', 'italic'].includes(textCss.fontStyle)) throw new Error('Unsupported text font style')
          // Animated word wrappers inherit their visible child's typography but
          // can report an empty computed colour in offline CSS parsing. Compare
          // the painted leaf spans, not both a wrapper and its child.
          const runs = [...row.querySelectorAll('span')].filter(item => item.textContent.trim() && !item.children.length)
          const unadaptedSignature = node => style(node).letterSpacing
          const plainRuns = runs.filter(item => !item.closest('sup'))
          if (new Set(plainRuns.map(unadaptedSignature)).size > 1) throw new Error('Mixed styled text within a line needs an adapter')
          const hasInlineStyles = new Set(plainRuns.map(item => ['fontSize', 'color', 'fontFamily', 'fontWeight', 'fontStyle'].map(key => style(item)[key]).join('|'))).size > 1
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
          let textStroke = containerCss.getPropertyValue('-webkit-text-stroke') || ''
          const rgbStroke = /^(\d+(?:\.\d+)?px) rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(1(?:\.0+)?))?\s*\)$/i.exec(textStroke)
          if (rgbStroke && rgbStroke.slice(2, 5).every(channel => Number(channel) <= 255)) textStroke = `${rgbStroke[1]} #${rgbStroke.slice(2, 5).map(channel => Number(channel).toString(16).padStart(2, '0')).join('')}`
          const textShadow = normaliseTextShadow(containerCss.textShadow)
          if (textStroke && !/^\d+(?:\.\d+)?px #[0-9a-f]{6}$/i.test(textStroke)) throw new Error('Unsupported text stroke')
          const paintOrder = (containerCss.paintOrder || 'normal').trim().replace(/\s+/g, ' ')
          if (textStroke && !['normal', 'fill', 'fill stroke', 'stroke', 'stroke fill'].includes(paintOrder)) throw new Error('Unsupported text paint order')
          const textPaintOrder = paintOrder.startsWith('stroke') ? 'stroke' : 'fill'
          // Text clipped to a background paints that background, not its colour.
          // Keeping only the colour would silently replace a gradient fill.
          const gradients = new Map()
          for (const node of new Set([row, span, ...runs, ...(textContainer ? [textContainer] : [])])) {
            const css = style(node)
            const plainFills = ['', 'currentcolor', 'inherit', (css.color || '').toLowerCase()]
            const fills = [css.getPropertyValue('-webkit-text-fill-color'), ...sourceDeclarations(document, node, '-webkit-text-fill-color')]
            if ([css.getPropertyValue('background-clip'), css.getPropertyValue('-webkit-background-clip'), ...sourceDeclarations(document, node, 'background-clip|-webkit-background-clip')].includes('text')
              || fills.some(fill => !plainFills.includes((fill || '').toLowerCase()))) {
              const gradient = (css.backgroundImage || '').replace(/(#[0-9a-f]{6}\s+)0(?=\s*[,\)])/gi, (_, color) => color + '0%')
              if (node.tagName !== 'SPAN' || node.children.length || !isBannerInlineTextGradient(gradient)
                || ![css.getPropertyValue('background-clip'), css.getPropertyValue('-webkit-background-clip')].includes('text')) throw new Error('Gradient or clipped text fill needs an adapter')
              gradients.set(node, gradient)
            }
          }
          const textRuns = []
          if (row.querySelector('sup') || hasInlineStyles || gradients.size) {
            const walk = (node) => {
              if (node.nodeType === 3 && node.textContent) {
                const parent = node.parentElement
                const runCss = style(parent)
                if (node.textContent.trim() && runCss.letterSpacing !== textCss.letterSpacing) throw new Error('Mixed styled superscript needs an adapter')
                const color = runCss.color && runCss.color !== textCss.color ? runCss.color : undefined
                if (color && !isBannerInlineTextColor(color)) throw new Error('Unsupported inline text colour')
                const run = { text: node.textContent }
                if (gradients.has(parent)) run.gradient = gradients.get(parent)
                if (color) run.color = color
                if (node.textContent.trim() && (runCss.fontFamily !== textCss.fontFamily || runCss.fontWeight !== textCss.fontWeight || runCss.fontStyle !== textCss.fontStyle)) {
                  const fontWeight = Number(runCss.fontWeight) || (runCss.fontWeight === 'bold' ? 700 : 400)
                  const fontStyle = runCss.fontStyle || 'normal'
                  if (!['normal', 'italic'].includes(fontStyle)) throw new Error('Unsupported inline font style')
                  run.fontFamily = runCss.fontFamily.replace(/["']/g, '')
                  run.fontWeight = fontWeight
                  run.fontStyle = fontStyle
                }
                const sup = parent.closest('sup')
                if (sup) {
                  const supCss = style(sup)
                  if (supCss.position !== 'relative' || supCss.verticalAlign !== 'baseline' || !Number.isFinite(px(supCss.top))) throw new Error('Unsupported superscript positioning')
                  run.fontSize = px(runCss.fontSize)
                  run.top = px(supCss.top)
                } else if (Number.isFinite(px(runCss.fontSize)) && runCss.fontSize !== textCss.fontSize) {
                  run.fontSize = px(runCss.fontSize)
                }
                textRuns.push(run)
              } else for (const child of node.childNodes) walk(child)
            }
            walk(row)
          }
          const fontSize = px(textCss.fontSize)
          const lineBoxFontSize = Math.max(fontSize, ...[...row.querySelectorAll('span')].map(item => px(style(item).fontSize)))
          const lineHeight = /^\d*\.?\d+$/.test(rowCss.lineHeight) ? Number(rowCss.lineHeight) : px(rowCss.lineHeight) / fontSize
          const height = lineBoxFontSize * lineHeight
          if (!Number.isFinite(height)) throw new Error('Unsupported text line height')
          if (row.textContent.trim()) layers.push({ ...layerBase, linkId: `source:${sourceId}:row:${rowIndex}`, id: id++, type: 'text', name: row.textContent.trim().slice(0, 60), y, h: height, ...(layerBase.transformOrigin ? { transformOrigin: { x: layerBase.transformOrigin.x, y: layerBase.transformOrigin.y - (y - layerBase.y) } } : {}), text: row.textContent.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ''), ...(textRuns.length ? { text: row.textContent, textRuns } : {}), ...(wordPop ? { wordPop: wordPop.rows[rowIndex] } : {}), textTransform, fontFamily: textCss.fontFamily.replace(/["']/g, ''), fontStyle: textCss.fontStyle === 'italic' ? 'italic' : 'normal', fontSize, lineBoxFontSize, textAntialias: style(document.documentElement).getPropertyValue('-webkit-font-smoothing') === 'antialiased', fontWeight: Number(textCss.fontWeight) || 400, lineHeight, color: paintedCss.color || textCss.color || '#fff', ...(textStroke ? { textStroke, textPaintOrder } : {}), ...(textShadow ? { textShadow } : {}), textAlign: textCss.textAlign || 'left', letterSpacing: !textCss.letterSpacing || textCss.letterSpacing === 'normal' ? '0px' : textCss.letterSpacing })
          y += height
          rowHeights.push(height)
        }
        // Native text wraps to the source width. Allocate extra line boxes before
        // positioning later rows so wrapped text stays editable without overlap.
        const extra = layerBase.h - (y - layerBase.y)
        if (rows.length > 1 && extra > 0.4 * Math.min(...rowHeights)) {
          const wholeLines = height => extra / height >= 0.9 && Math.abs(extra / height - Math.round(extra / height)) < 0.1
          const candidates = rowHeights.flatMap((height, index) => wholeLines(height) ? [index] : [])
          const allocations = candidates.map(index => rowHeights.map((_, rowIndex) => rowIndex === index ? extra : 0))
          if (rows.length === 2) {
            const [first, second] = rowHeights
            // Integer source dimensions round the combined line boxes. Use a
            // one-pixel tolerance, and hold if more than one layout fits.
            for (let count = 1; count <= 64 && count * first + second <= extra + 1; count++) {
              const remainder = extra - count * first
              const lines = Math.round(remainder / second)
              if (lines >= 1 && lines <= 64 && Math.abs(remainder - lines * second) <= 1) {
                allocations.push([count * first, remainder])
              }
            }
          }
          const reviewed = Object.hasOwn(reviewedRowLines, element.id) ? reviewedRowLines[element.id] : undefined
          let allocation = allocations[0]
          if (reviewed !== undefined) {
            if (!Array.isArray(reviewed) || reviewed.length !== rows.length
              || reviewed.some(lines => !Number.isSafeInteger(lines) || lines < 1 || lines > 64)) {
              throw new Error(`${element.id}: reviewed row counts do not match the source rows`)
            }
            const offsets = reviewed.map((lines, index) => (lines - 1) * rowHeights[index])
            const measured = reviewedRowHeights[element.id]
            // Some source boxes allow text to overflow their saved height. A
            // checksum-bound measurement of each original row proves its actual
            // layout independently of the stale enclosing height.
            let measuredOverflow = Array.isArray(measured) && measured.length === rows.length
              && measured.every((height, i) => Number.isFinite(height) && Math.abs(height - reviewed[i] * rowHeights[i]) <= 0.6)
            if (measuredOverflow) {
              for (let node = rows[0].parentElement; node && element.contains(node); node = node.parentElement) {
                if (!['', 'visible'].includes(style(node).overflowY) || !['', 'visible'].includes(style(node).overflow)) measuredOverflow = false
              }
            }
            if (!measuredOverflow && Math.abs(offsets.reduce((sum, offset) => sum + offset, 0) - extra) > 1) {
              throw new Error(`${element.id}: reviewed row heights do not match the source box`)
            }
            allocation = offsets
            reviewedElements.add(element.id)
            warnings.push(`${element.id}: wrapped rows use line counts measured in the source preview`)
          } else if (allocations.length !== 1) {
            throw new Error(`${element.id}: Wrapped text across stacked rows needs an adapter`)
          }
          let shift = 0
          for (const [index, extraHeight] of allocation.entries()) {
            const line = layers.find(layer => layer.linkId === `source:${sourceId}:row:${index}`)
            if (line) {
              line.h += extraHeight
              line.y += shift
              if (line.transformOrigin) line.transformOrigin.y -= shift
            }
            shift += extraHeight
          }
          warnings.push(`${element.id}: wrapped rows retain their extra line boxes and shift later editable rows; review text wrapping`)
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
            const sourceBackground = { size: contentCss.backgroundSize, position: contentCss.backgroundPosition, repeat: contentCss.backgroundRepeat }
            if (isBannerImageBackground(sourceBackground)) {
              if (contentCss.width !== '100%' || contentCss.height !== '100%'
                || ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'].some(key => !['', '0', '0px'].includes(contentCss[key]))
                || !['', 'scroll'].includes(contentCss.backgroundAttachment)
                || !['', 'padding-box'].includes(contentCss.backgroundOrigin)
                || !['', 'border-box'].includes(contentCss.backgroundClip)) throw new Error('Unsupported image background composition')
              layerBase.imageBackground = sourceBackground
            } else {
              if (!['contain', 'cover'].includes(contentCss.backgroundSize)
                || (contentCss.backgroundPosition && !['50% 50%', 'center', 'center center'].includes(contentCss.backgroundPosition))
                || (contentCss.backgroundRepeat && contentCss.backgroundRepeat !== 'no-repeat')) throw new Error('Unsupported image background fit/position')
              fit = contentCss.backgroundSize
            }
          }
        }
        const transformed = [...element.querySelectorAll('div')].filter(div => style(div).transform && style(div).transform !== 'none')
        const mirrored = transformed.filter(div => /^rotate\(0(?:deg)?\)\s+scale\((?:-1,\s*-?1|1,\s*-1)\)$/.test(style(div).transform))
        if (layerBase.imageFlipPerspective && transformed.some(div => {
          const nested = style(div)
          return nested.width !== '100%' || nested.height !== '100%'
            || !['', '50% 50%', 'center center', 'center'].includes(nested.transformOrigin)
        })) throw new Error('3D image flip has an unsupported inner transform origin')
        const rotated = transformed.filter(div => !mirrored.includes(div)).map(div => style(div).transform)
        if (rotated.some(t => !/^rotate\(-?[\d.]+deg\)$/.test(t)) || mirrored.length > 1
          || (mirrored.length && (rotated.some(t => Number.parseFloat(t.slice(7)) !== 0)
            || style(mirrored[0]).width !== '100%' || style(mirrored[0]).height !== '100%'
            || !['', '50% 50%', 'center center', 'center'].includes(style(mirrored[0]).transformOrigin)))) throw new Error('Unsupported static transform')
        if (mirrored.length && layerBase.imageBackground) throw new Error('Mirrored positioned background needs an adapter')
        if (mirrored.length) imageTransforms.push({ layerId: id, operation: /scale\(-1,\s*-1\)/.test(style(mirrored[0]).transform) ? 'rotate180' : /scale\(-1/.test(style(mirrored[0]).transform) ? 'flop' : 'flip' })
        let contentOpacity = 1
        const imageFilters = []
        const imageFilterNodes = []
        const imageMaskNodes = []
        for (let node = image || content; node && element.contains(node); node = node.parentElement) {
          const nodeCss = style(node)
          const opacity = nodeCss.opacity === '' ? 1 : Number(nodeCss.opacity)
          if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error('Unsupported image opacity')
          if (nodeCss.animationName && nodeCss.animationName !== 'none' && opacity !== 1) throw new Error('Animated image with nonidentity underlying opacity needs an adapter')
          contentOpacity *= opacity
          const masks = [nodeCss.getPropertyValue('mask-image'), nodeCss.getPropertyValue('-webkit-mask-image')].filter(value => value && value !== 'none')
          if (masks.length) {
            imageMaskNodes.push(node)
            const supported = masks.every(value => {
              const match = /^url\(["']?(data:image\/svg\+xml;charset=UTF-8,[^"')]+)["']?\)$/i.exec(value)
              if (!match) return false
              let svg
              try { svg = new window.DOMParser().parseFromString(decodeURIComponent(match[1].split(',').slice(1).join(',')), 'image/svg+xml').documentElement } catch { return false }
              const shape = svg?.children[0]
              const box = svg?.getAttribute('viewBox')?.trim().split(/\s+/).map(Number)
              const harmlessRoot = new Set(['version','id','xmlns','xmlns:xlink','x','y','viewBox','enable-background','xml:space','width','height','preserveAspectRatio'])
              const harmlessShape = new Set(['fill','cx','cy','r','data-color-group'])
              return svg?.localName === 'svg' && svg.children.length === 1 && shape?.localName === 'circle' && shape.children.length === 0
                && [...svg.attributes].every(a => harmlessRoot.has(a.name)) && [...shape.attributes].every(a => harmlessShape.has(a.name))
                && box?.length === 4 && box[0] === 0 && box[1] === 0 && box[2] > 0 && box[2] === box[3]
                && Number(shape.getAttribute('cx')) === box[2] / 2 && Number(shape.getAttribute('cy')) === box[2] / 2 && Number(shape.getAttribute('r')) === box[2] / 2
                && /^#[0-9a-f]{6}$/i.test(shape.getAttribute('fill') || '')
                && ['0', '0px', null].includes(svg.getAttribute('x')) && ['0', '0px', null].includes(svg.getAttribute('y'))
                && ['100%', null].includes(svg.getAttribute('width')) && ['100%', null].includes(svg.getAttribute('height'))
            })
            if (!supported || layerBase.borderRadius !== undefined || Math.abs(layerBase.w - layerBase.h) > 0.001
              || nodeCss.width !== '100%' || nodeCss.height !== '100%'
              || ['paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].some(key => !['', '0', '0px'].includes(nodeCss[key]))
              || [...sourceDeclarations(document, node, 'mask-composite|-webkit-mask-composite')].some(v => !['add', 'source-over'].includes(v))
              || [...sourceDeclarations(document, node, 'mask-size|-webkit-mask-size')].some(v => v !== '100% 100%')
              || [...sourceDeclarations(document, node, 'mask-position|-webkit-mask-position')].some(v => !['center', '50% 50%'].includes(v))
              || [...sourceDeclarations(document, node, 'mask-repeat|-webkit-mask-repeat')].some(v => v !== 'no-repeat')
              || [...sourceDeclarations(document, node, 'mask-mode')].some(v => !['alpha', 'match-source'].includes(v))) throw new Error(`Image ${sourceId}: unsupported mask composition`)
            layerBase.borderRadius = layerBase.w / 2
          }
          if (nodeCss.filter && nodeCss.filter !== 'none') { imageFilters.push(nodeCss.filter); imageFilterNodes.push(node) }
          if (node === element) break
        }
        layerBase.opacity = contentOpacity
        layerBase.keyframes = { ...layerBase.keyframes, opacity: layerBase.keyframes.opacity.map(frame => ({ ...frame, value: frame.value * contentOpacity })) }
        const visualFilter = imageFilters.join(' ')
        if (visualFilter) {
          // Pointwise colour filters commute with the circle alpha mask. Spatial
          // blur and shadows do not and must retain their explicit hold.
          if (layerBase.borderRadius !== undefined && /(?:blur|drop-shadow)\(/.test(visualFilter)) {
            if (!imageFilterNodes.every(filterNode => imageMaskNodes.every(maskNode => filterNode !== maskNode && filterNode.contains(maskNode)))) throw new Error('Masked image filter requires an adapter')
            layerBase.imageOuterFilter = visualFilter
          }
          if (!isSafeBannerImageFilter(visualFilter)) throw new Error('Unsupported static image filter')
          if (mirrored.length && visualFilter.includes('drop-shadow(')) throw new Error('Mirrored nested image shadow needs an adapter')
          if (!layerBase.imageOuterFilter) layerBase.visualFilter = visualFilter
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
        const center = !layerBase.transformOrigin || (Math.abs(layerBase.transformOrigin.x - layerBase.w / 2) < 0.001 && Math.abs(layerBase.transformOrigin.y - layerBase.h / 2) < 0.001)
        const uniformScale = JSON.stringify(keyframes.scaleX || []) === JSON.stringify(keyframes.scaleY || [])
        if (rotation && center && uniformScale) {
          // Uniform scale and rotations about the same centre commute. Preserve
          // the static shape angle by offsetting native absolute rotation tracks.
          if (keyframes.rotation) layerBase.keyframes.rotation = keyframes.rotation.map(frame => ({ ...frame, value: frame.value + rotation }))
        } else if (rotation && (keyframes.scaleX || keyframes.scaleY || keyframes.rotation)) {
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
          if (borders.some(width => width !== 0)) {
            const sides = ['Top', 'Right', 'Bottom', 'Left']
            const colors = sides.map(side => contentCss[`border${side}Color`])
            const styles = sides.map(side => contentCss[`border${side}Style`])
            if (new Set(borders).size !== 1 || !Number.isFinite(borders[0]) || borders[0] < 0 || borders[0] > 100 || new Set(colors).size !== 1 || styles.some(value => value !== 'solid') || (rectShape && Math.abs(layerBase.w - layerBase.h) > 1)) throw new Error(`${element.id}: shape border composition needs an adapter`)
            // Native buttons support border-box fill, uniform stroke and corners.
            // Empty text retains this shape as an editable native visual layer.
            layers.push({ ...layerBase, id: id++, type: 'button', name: `Bordered shape ${sourceId}`, text: '', rotation, ...(rectShape && layerBase.w !== layerBase.h ? { rectShape } : { borderRadius: rectShape ? layerBase.w / 2 : borderRadius || 0 }), borderWidth: borders[0], borderColor: colors[0], bgColor: contentCss.backgroundColor || 'transparent', textColor: 'transparent', ...(visualFilter ? { visualFilter } : {}) })
            warnings.push(`${element.id}: uniform bordered shape preserved as an editable native button with empty text; review border and corner geometry`)
          } else {
            layers.push({ ...layerBase, id: id++, type: 'rect', name: `Shape ${sourceId}`, rotation, ...(borderRadius !== undefined ? { borderRadius } : {}), ...shapeEffects, fillColor: contentCss.backgroundColor || 'transparent' })
          }
        }
      } else {
        throw new Error(`Unsupported layer type: ${type}`)
      }
      sourceElements.push({ sourceId, slideId: slide.id, type, nativeLayerIds: layers.slice(before).map(layer => layer.id), start: sourceInactiveTiming?.start ?? start, end, ...(effectStart !== start ? { effectStart } : {}) })
    }
    if (wrap) {
      const last = slides.at(-1)
      const firstId = 'source-slide:' + slides[0].id
      // Expose the opening pose underneath the outgoing group during loop wrap.
      // The source starts the incoming layer effects after this overlap.
      for (const layer of layers.filter(l => l.slideId === firstId && l.startTime === 0)) {
        if (layer.wordPop || layer.reveal || layer.type === 'video' || layer.type === 'audio') throw new Error('Loop opening pose needs a media adapter')
        if (layer.keyframes?.opacity?.[0]?.value === 0) continue
        const copy = structuredClone(layer)
        delete copy.slideFade
        copy.slideId = 'source-slide:' + last.id
        copy.id = id++
        copy.linkId = 'source:loop:' + layer.linkId
        copy.name += ' (loop overlap)'
        copy.startTime = last.end
        copy.endTime = duration
        copy.clipToPresence = true
        // Keep the outgoing group above the held opening pose.
        copy.zIndex = layer.zIndex
        for (const [key, frames] of Object.entries(copy.keyframes || {})) {
          copy.keyframes[key] = [{ time: last.end, value: frames[0].value, easing: 'linear' }, { time: duration, value: frames[0].value }]
        }
        layers.push(copy)
      }
      last.end = duration
    }
    for (const layer of layers) for (const face of [layer, ...layer.textRuns || []]) {
      if (!face.fontFamily?.includes(',')) continue
      const names = face.fontFamily.split(',').map(value => value.trim().replace(/^["']|["']$/g, ''))
      const declared = fonts.filter(font => names.includes(font.family) && font.weight === (face.fontWeight || 400) && font.style === (face.fontStyle || 'normal'))
      if (declared.length !== 1 || !names[0].startsWith(declared[0].family + ' file-')) throw new Error(`${layer.name}: ambiguous export font alias needs reconciliation`)
      face.fontFamily = declared[0].family
    }
    if (Object.keys(reviewedRowLines).some(id => !reviewedElements.has(id))) throw new Error('Reviewed row counts include an element without stacked wrapping')
    return { schemaVersion: 1, adapter: slides.length === 1 ? 'thebrief-css-single-slide-pilot' : 'thebrief-css-hard-cut-slides', fidelityVerified: false, fonts, externalFontStylesheets, imageTransforms, audioTransforms, source: { designHash: source.designHash || null, width: source.width, height: source.height, duration, loopCount: source.loopCount, elementCount: elements.length }, videoFrames, canvasData: { [`custom_${source.width}x${source.height}`]: { slides: slides.map((slide, index) => ({ id: `source-slide:${slide.id}`, name: `Slide ${index + 1}`, duration: slide.end - slide.start })), playback: { duration, loopCount: source.loopCount }, layers, bgColor: background } }, sourceElements, warnings }
  } finally {
    await window.happyDOM.close()
  }
}
