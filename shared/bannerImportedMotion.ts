/** Reviewed native entrances. Imported HTML/CSS is never executed or retained. */
export interface BannerReveal { type: 'softWipe' | 'tvExpand', duration: number, ease: string }
export interface BannerWordEntrance { duration: number, stagger: number, ease: string, variant?: 'pop' | 'blur' | 'blurLeft' | 'blurUp' | 'zoomOut' | 'typewriter' | 'fade', unit?: 'word' | 'character', delays?: number[], offset?: number }
export type MotionCommand = { target: 'effect' | 'content' | 'glow', property: string, from: string | number, to: string | number, start: number, duration: number, ease: string }
const safeEase = (ease: string) => typeof ease === 'string' && /^[a-z][a-z0-9.,() -]{0,100}$/i.test(ease) ? ease : 'linear'
export function safeWordEntrance(effect?: BannerWordEntrance): BannerWordEntrance | undefined {
  if (!effect || !Number.isFinite(effect.duration) || effect.duration <= 0 || effect.duration > 300 || !Number.isFinite(effect.stagger) || effect.stagger < 0 || effect.stagger > 300) return
  if (effect.offset !== undefined && (!Number.isFinite(effect.offset) || effect.offset < 0 || effect.offset > 300)) return
  if (effect.delays && (!Array.isArray(effect.delays) || effect.delays.length > 500 || effect.delays.some(delay => !Number.isFinite(delay) || delay < 0 || delay > 300))) return
  return { ...effect, ease: safeEase(effect.ease) }
}
export function wordEntranceDelay(effect: BannerWordEntrance, index: number) {
  const delays = effect.delays || []
  if (delays[index] !== undefined) return delays[index]!
  if (!delays.length) return index * effect.stagger
  const step = delays.length > 1 ? (delays.at(-1)! - delays[0]!) / (delays.length - 1) : effect.stagger
  return delays.at(-1)! + (index - delays.length + 1) * Math.max(0, step)
}
export const revealLabel = (type?: string) => type === 'tvExpand' ? 'TV reveal' : 'Soft wipe'
export const wordEntranceLabel = (variant?: string) => ({ blur: 'Words blur in', fade: 'Words fade', blurLeft: 'Words blur from left', blurUp: 'Words blur from below', zoomOut: 'Words zoom out', typewriter: 'Typewriter' }[variant || ''] || 'Words Pop')
export const REVEAL_WRAPPER_STYLE = 'position:relative;width:100%;height:100%;'
export const REVEAL_GLOW_STYLE = 'position:absolute;pointer-events:none;left:0;right:0;top:50%;height:2px;margin-top:-1px;opacity:0;background:linear-gradient(90deg,transparent,#fff 12%,#fff 88%,transparent);box-shadow:0 0 13.6px 1.2px rgba(255,255,255,.77);'
export function revealContentStyle(type: string) {
  return type === 'tvExpand' ? 'width:100%;height:100%;mask-image:linear-gradient(#000,#000);-webkit-mask-image:linear-gradient(#000,#000);mask-repeat:no-repeat;-webkit-mask-repeat:no-repeat;mask-position:center;-webkit-mask-position:center;' : 'width:100%;height:100%;'
}
export function revealCommands(reveal: BannerReveal | undefined, height: number): MotionCommand[] {
  if (!reveal || !['softWipe', 'tvExpand'].includes(reveal.type) || !(reveal.duration > 0 && reveal.duration <= 300) || !Number.isFinite(height) || height <= 0) return []
  const d = reveal.duration, ease = safeEase(reveal.ease)
  const cmd = (target: MotionCommand['target'], property: string, from: string | number, to: string | number, start: number, duration: number): MotionCommand => ({ target, property, from, to, start: start * d, duration: duration * d, ease })
  if (reveal.type === 'softWipe') return [
    cmd('effect', 'opacity', 0, 1, 0, 0.15),
    ...['maskPosition', 'webkitMaskPosition'].map(property => cmd('content', property, '148% 50%', '0% 50%', 0, 1))
  ]
  return [cmd('effect', 'opacity', 0, 1, 0, 0.08), cmd('effect', 'filter', 'brightness(3.2) saturate(0.15)', 'brightness(1) saturate(1)', 0.6, 0.4), cmd('glow', 'opacity', 0.6, 0, 0.22, 0.33),
    ...['maskSize', 'webkitMaskSize'].flatMap(property => [cmd('content', property, '100% 3px', `100% ${height}px`, 0.22, 0.38), cmd('content', property, `100% ${height}px`, `400% ${height * 4}px`, 0.6, 0.4)])]
}
export function wordEntranceSteps(effect: BannerWordEntrance): Array<{ property: string, from: number | string, to: number | string, start: number, duration: number, ease?: string }> {
  const d = effect.duration
  if (effect.variant === 'blur') return [{ property: 'opacity', from: 0, to: 1, start: 0, duration: d * 0.3 }, { property: 'filter', from: 'blur(5px)', to: 'blur(0px)', start: 0, duration: d }]
  if (effect.variant === 'fade') return [{ property: 'opacity', from: 0, to: 1, start: 0, duration: d }]
  if (effect.variant === 'typewriter') return [{ property: 'opacity', from: 0, to: 1, start: 0, duration: d, ease: 'step-end' }]
  const result = [{ property: 'opacity', from: 0, to: 1, start: 0, duration: d * 0.4 }, { property: 'filter', from: 'blur(10px)', to: 'blur(0px)', start: 0, duration: d }]
  if (effect.variant === 'blurLeft' || effect.variant === 'blurUp') result.push({ property: effect.variant === 'blurLeft' ? 'x' : 'y', from: effect.variant === 'blurLeft' ? -20 : 20, to: 0, start: 0, duration: d })
  else if (effect.variant === 'zoomOut') result.push({ property: 'scale', from: 1.3, to: 1, start: 0, duration: d })
  else result.push({ property: 'scale', from: 0.6, to: 1.05, start: 0, duration: d * 0.7 }, { property: 'scale', from: 1.05, to: 1, start: d * 0.7, duration: d * 0.3 })
  return result
}

export const MEDIA_TOP_FADE = 'linear-gradient(0deg,rgba(0,0,0,1) 45%,rgba(0,0,0,0.8) 78%,rgba(0,0,0,0) 100%)'
const scallopedCorner = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" preserveAspectRatio="none"><path d="M318.114,0H0l0,318.114c0,12.926,9.21,24.441,22.012,26.232c0.086,0.012,0.173,0.024,0.26,0.035 l13.967,1.858l6.084,12.71c7.549,15.771,24.731,24.525,41.927,21.363l13.858-2.549l9.714,10.208 c12.053,12.666,31.099,15.683,46.476,7.361l12.392-6.706l12.393,6.707c15.377,8.322,34.423,5.305,46.476-7.362l9.713-10.208 l13.858,2.549c17.196,3.163,34.378-5.591,41.927-21.362l6.084-12.71l13.968-1.859c17.332-2.306,30.967-15.942,33.273-33.273 l1.859-13.968l12.71-6.084c15.771-7.549,24.526-24.731,21.363-41.927l-2.549-13.858l10.208-9.713 c12.666-12.053,15.683-31.099,7.361-46.476l-6.707-12.392l6.707-12.393c8.322-15.377,5.305-34.423-7.361-46.476l-10.208-9.713 l2.549-13.858c3.163-17.196-5.592-34.378-21.363-41.927l-12.709-6.083l-1.858-13.968c-0.012-0.087-0.023-0.174-0.035-0.26 C342.555,9.21,331.04,0,318.114,0z"/></svg>`
const scallopedMask = `url(data:image/svg+xml,${encodeURIComponent(scallopedCorner)})`
export function mediaMaskCss(mask?: string) {
  const image = mask === 'fadeTop' ? MEDIA_TOP_FADE : mask === 'scallopedCorner' ? scallopedMask : ''
  return image ? `mask-image:${image};-webkit-mask-image:${image};mask-repeat:no-repeat;-webkit-mask-repeat:no-repeat;mask-position:center;-webkit-mask-position:center;mask-size:100% 100%;-webkit-mask-size:100% 100%;mask-origin:content-box;-webkit-mask-origin:content-box;backdrop-filter:opacity(1);` : ''
}
