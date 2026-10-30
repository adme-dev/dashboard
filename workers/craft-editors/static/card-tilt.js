// A small pointer-following tilt; touch, keyboard and reduced-motion use a still card.
const motion = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)')
const cards = [...document.querySelectorAll('.editor')]
const resetters = []
const invalidateBounds = []

for (const card of cards) {
  let frame = 0
  let point = null
  let bounds = null
  const reset = () => {
    cancelAnimationFrame(frame)
    frame = 0
    point = null
    bounds = null
    card.classList.remove('is-tilting')
    card.style.removeProperty('--tilt-x')
    card.style.removeProperty('--tilt-y')
  }
  resetters.push(reset)
  invalidateBounds.push(() => { bounds = null })
  card.addEventListener('pointerenter', event => {
    if (!motion.matches || event.pointerType === 'touch') return
    bounds = card.getBoundingClientRect()
    card.classList.add('is-tilting')
  })
  card.addEventListener('pointermove', event => {
    if (!motion.matches || event.pointerType === 'touch') return
    if (!bounds) bounds = card.getBoundingClientRect()
    card.classList.add('is-tilting')
    point = { x: event.clientX, y: event.clientY }
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (!point) return
      if (!bounds) bounds = card.getBoundingClientRect()
      const x = Math.max(-1, Math.min(1, (point.x - bounds.left) / bounds.width * 2 - 1))
      const y = Math.max(-1, Math.min(1, (point.y - bounds.top) / bounds.height * 2 - 1))
      card.style.setProperty('--tilt-x', `${(-y * 5).toFixed(2)}deg`)
      card.style.setProperty('--tilt-y', `${(x * 6).toFixed(2)}deg`)
    })
  })
  card.addEventListener('pointerleave', reset)
  card.addEventListener('pointercancel', reset)
}

motion.addEventListener('change', () => resetters.forEach(reset => reset()))
window.addEventListener('blur', () => resetters.forEach(reset => reset()))
window.addEventListener('scroll', () => invalidateBounds.forEach(invalidate => invalidate()), { passive: true })
window.addEventListener('resize', () => resetters.forEach(reset => reset()))
