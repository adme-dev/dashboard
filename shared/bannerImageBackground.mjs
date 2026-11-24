/** Bounded CSS background framing; original image remains an editable media asset. */
export function isBannerImageBackground(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['size', 'position', 'repeat'].includes(key))) return false
  const length = /^\d+(?:\.\d+)?px$/
  const sizes = typeof value.size === 'string' ? value.size.split(' ') : []
  const positions = typeof value.position === 'string' ? value.position.split(' ') : []
  return sizes.length >= 1 && sizes.length <= 2 && sizes.every(v => length.test(v) && parseFloat(v) > 0 && parseFloat(v) <= 100000)
    && positions.length === 2 && positions.every(v => /^-?\d+(?:\.\d+)?(?:px|%)$/.test(v) && Math.abs(parseFloat(v)) <= (v.endsWith('%') ? 100 : 100000))
    && ['repeat', 'no-repeat'].includes(value.repeat)
}
export function bannerImageBackgroundCss(value) {
  return isBannerImageBackground(value) ? `background-size:${value.size};background-position:${value.position};background-repeat:${value.repeat};` : ''
}
