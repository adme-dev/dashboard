/** Shared by the editor and exported GSAP timeline. Keep self-contained for export. */
export function addBannerTextMotion(timeline, frame, tracking, sweep, width, end, ease) {
  if (!frame) return
  const body = frame.querySelector('[data-banner-text-body]')
  const paint = frame.querySelector('[data-banner-sweep]')
  if (tracking && body) {
    // Count characters on the original wrapped lines, using layout coordinates so
    // zooming the artboard never changes the tracking displacement.
    let longest = 1, count = 0, lastTop
    const walker = frame.ownerDocument.createTreeWalker(body, 4)
    const range = frame.ownerDocument.createRange()
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (let i = 0; i < node.length; i++) {
        range.setStart(node, i)
        range.setEnd(node, i + 1)
        const top = range.getBoundingClientRect().top
        if (lastTop !== undefined && Math.abs(top - lastTop) > 1) count = 0
        if (!/[\r\n\u200b]/.test(node.data[i])) count++
        lastTop = top
        longest = Math.max(longest, count)
      }
    }
    const extra = longest * tracking.from * tracking.glyphScale
    timeline.set(body, { width: tracking.width + extra, left: -extra / 2, letterSpacing: tracking.from, immediateRender: false }, 0)
    timeline.to(body, { width: tracking.width, left: 0, letterSpacing: tracking.to, duration: tracking.duration, ease, immediateRender: false }, tracking.at)
  }
  if (sweep && paint && sweep.duration > 0 && sweep.iterations > 0 && sweep.iterations <= 50) {
    const x = sweep.wholeRow ? 0 : paint.offsetLeft
    const finish = Math.min(end, sweep.at + sweep.duration * sweep.iterations)
    if (finish <= sweep.at) return
    timeline.set(paint, { backgroundImage: sweep.gradient, backgroundSize: (2 * width) + 'px auto', backgroundClip: 'text', webkitBackgroundClip: 'text', webkitTextFillColor: 'transparent', immediateRender: false }, sweep.at)
    for (let i = 0; i < Math.ceil(sweep.iterations); i++) {
      const at = sweep.at + i * sweep.duration
      const duration = Math.min(sweep.duration, finish - at)
      if (duration <= 0) break
      timeline.set(paint, { backgroundPosition: (-2 * width - x) + 'px center', immediateRender: false }, at)
      timeline.to(paint, { backgroundPosition: (-2 * width * (1 - duration / sweep.duration) - x) + 'px center', duration, ease: 'none', immediateRender: false }, at)
    }
    timeline.set(paint, { clearProps: 'backgroundImage,backgroundSize,backgroundPosition,backgroundClip,webkitBackgroundClip,webkitTextFillColor', immediateRender: false }, finish)
  }
}
