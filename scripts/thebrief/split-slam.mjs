import { SOFT_WIPE_STOPS, SPLIT_SLAM_PROPERTIES, SPLIT_SLAM_STOPS, imageEntranceClip } from '../../shared/bannerImageEntrance.mjs'

const compact = value => value.replace(/\s+/g, '')
export function sourceImageEntrance(element, id, style, rules, start, end) {
  const content = element.querySelector(`[id="c-${id}"]`)
  const entrance = element.querySelector(`[id="effIn${id}"]`), entranceCss = entrance && style(entrance)
  const entranceRule = rules.findLast(rule => rule.name === entranceCss?.animationName)
  if (entranceRule && [...entranceRule.cssRules].some(frame => frame.style.getPropertyValue('mask-image'))) {
    const observed = [...entranceRule.cssRules].map(frame => [frame.keyText, Object.fromEntries(Array.from({ length: frame.style.length }, (_, i) => {
      const k = frame.style.item(i)
      return [k, compact(frame.style.getPropertyValue(k))]
    }))])
    const expected = SOFT_WIPE_STOPS.map(([at, props]) => [at, Object.fromEntries(Object.entries(props).map(([k, v]) => [k, compact(v)]))])
    const canonical = entries => JSON.stringify(entries.map(([at, props]) => [at, Object.entries(props).sort(([a], [b]) => a.localeCompare(b))]))
    const duration = /^\d*\.?\d+s$/.test(entranceCss.animationDuration) ? Number.parseFloat(entranceCss.animationDuration) : NaN
    const delay = entranceCss.animationDelay === '-1ms' ? 0 : /^\d*\.?\d+s$/.test(entranceCss.animationDelay) ? Number.parseFloat(entranceCss.animationDelay) : NaN
    if (!['image', 'svg'].includes(element.getAttribute('data-eltype')) || canonical(observed) !== canonical(expected)
      || entranceCss.animationIterationCount !== '1' || entranceCss.animationDirection !== 'normal'
      || !['both', 'backwards'].includes(entranceCss.animationFillMode) || !(duration > 0 && duration <= 5 && delay >= 0 && start + delay + duration <= end)) throw new Error(`Image ${id}: unsupported soft wipe composition`)
    return { kind: 'softWipe', start: Number((start + delay).toFixed(9)), duration, ease: entranceCss.animationTimingFunction }
  }
  if (!content) return null
  const declared = {}
  for (const sheet of element.ownerDocument.styleSheets) for (const rule of sheet.cssRules) {
    if (!rule.selectorText?.split(',').some(sel => !sel.includes('::') && content.matches(sel.trim()))) continue
    for (let i = 0; i < rule.style.length; i++) {
      const key = rule.style.item(i)
      declared[key] = rule.style.getPropertyValue(key)
    }
  }
  if (!declared.transform?.includes('--split-slam-')) return null
  const fail = (reason) => {
    throw new Error(`Image ${id}: unsupported Split Slam ${reason}`)
  }
  const effect = element.querySelector(`[id="effIn${id}"]`), css = effect && style(effect)
  const frameRule = rules.findLast(rule => rule.name === css?.animationName)
  if (!effect || !frameRule || element.getAttribute('data-eltype') !== 'image'
    || css.animationIterationCount !== '1' || css.animationDirection !== 'normal' || css.animationFillMode !== 'both'
    || css.getPropertyValue('--split-slam-artwork') || content.children.length
    || compact(declared.transform) !== 'scaleX(var(--split-slam-k))'
    || compact(declared.filter) !== 'blur(var(--split-slam-blur))brightness(var(--split-slam-flash))'
    || style(content).visibility !== 'hidden'
    || !['', '0px'].includes(style(content).borderRadius)) fail('structure')
  const sourceCss = [...element.ownerDocument.querySelectorAll('style')].map(node => node.textContent).join('\n')
  for (const [i, property] of SPLIT_SLAM_PROPERTIES.entries()) {
    const declarations = [...sourceCss.matchAll(new RegExp(`@property\\s+--split-slam-${property}\\s*\\{([^}]*)\\}`, 'g'))]
    const syntax = i === 2 ? '<length>' : i >= 5 ? '<percentage>' : '<number>'
    const initial = i === 2 ? '0px' : i >= 5 ? '0%' : '1'
    if (declarations.length !== 1 || !declarations[0][1].includes(`syntax:'${syntax}'`)
      || !compact(declarations[0][1]).includes('inherits:true;') || !compact(declarations[0][1]).includes(`initial-value:${initial}`)) fail('property registration')
  }
  const actual = [...frameRule.cssRules].map(frame => [frame.keyText, SPLIT_SLAM_PROPERTIES.map(p => frame.style.getPropertyValue(`--split-slam-${p}`).trim())])
  if (JSON.stringify(actual) !== JSON.stringify(SPLIT_SLAM_STOPS)
    || [...frameRule.cssRules].some(frame => frame.style.length !== SPLIT_SLAM_PROPERTIES.length)) fail('keyframes')
  const duration = /^\d*\.?\d+s$/.test(css.animationDuration) ? Number.parseFloat(css.animationDuration) : NaN
  const delay = css.animationDelay === '-1ms' ? 0 : /^\d*\.?\d+s$/.test(css.animationDelay) ? Number.parseFloat(css.animationDelay) : NaN
  if (!(duration > 0 && duration <= 5 && delay >= 0 && start + delay + duration <= end)) fail('timing')
  // Validate the source's split clipping/transform rather than accepting any effect
  // that happens to reuse its custom-property names.
  for (const side of ['top', 'bottom']) {
    const pseudo = side === 'top' ? 'before' : 'after', values = {}
    for (const sheet of element.ownerDocument.styleSheets) for (const rule of sheet.cssRules) {
      if (!rule.selectorText?.split(',').some(sel => sel.trim().endsWith(`::${pseudo}`) && content.matches(sel.trim().replace(/::(?:before|after)$/, '')))) continue
      for (let i = 0; i < rule.style.length; i++) {
        const key = rule.style.item(i)
        values[key] = rule.style.getPropertyValue(key)
      }
    }
    if (compact(values['clip-path'] || '') !== compact(imageEntranceClip(side, '--split-slam-'))
      || compact(values.transform || '') !== `scaleX(var(--split-slam-inv-k))translateX(var(--split-slam-${side}-x))scale(var(--split-slam-scale))`
      || values['background-image'] !== 'inherit' || values['background-size'] !== 'inherit' || values['transform-origin'] !== 'center'
      || values.visibility !== 'visible' || values.position !== 'absolute' || values.inset !== '0') fail('clipping ' + side)
  }
  return { kind: 'splitSlam', start: Number((start + delay).toFixed(9)), duration, ease: css.animationTimingFunction }
}
