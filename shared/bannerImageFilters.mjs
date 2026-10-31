const decimal = '-?(?:\\d*\\.)?\\d+'
const numberPattern = new RegExp(`^${decimal}$`)
const bounded = (value, min, max) => numberPattern.test(value) && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max

function safeColor(value) {
  if (/^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(value)) return true
  const match = /^(rgb|rgba)\(([^()]*)\)$/.exec(value)
  if (!match) return false
  const channels = match[2].split(',').map(part => part.trim())
  return channels.length === (match[1] === 'rgba' ? 4 : 3)
    && channels.slice(0, 3).every(part => bounded(part, 0, 255))
    && (channels.length === 3 || bounded(channels[3], 0, 1))
}

/** Validate a bounded static filter chain without normalising its order/units. */
export function isSafeBannerImageFilter(value) {
  if (typeof value !== 'string' || !value || value.length > 500) return false
  if (value === 'none') return true
  let rest = value.trim(), count = 0
  while (rest) {
    const match = /^(brightness|contrast|saturate|grayscale|hue-rotate|blur|drop-shadow)\(/.exec(rest)
    if (!match || ++count > 8) return false
    let depth = 1, end = match[0].length
    for (; end < rest.length && depth; end++) {
      if (rest[end] === '(' && ++depth > 2) return false
      if (rest[end] === ')') depth--
    }
    if (depth) return false
    const input = rest.slice(match[0].length, end - 1).trim()
    switch (match[1]) {
      case 'brightness': case 'contrast': case 'saturate':
        if (!bounded(input, 0, 4)) return false
        break
      case 'grayscale':
        if (!bounded(input, 0, 1)) return false
        break
      case 'hue-rotate':
        if (!input.endsWith('deg') || !bounded(input.slice(0, -3), -360, 360)) return false
        break
      case 'blur':
        if (!input.endsWith('px') || !bounded(input.slice(0, -2), 0, 128)) return false
        break
      case 'drop-shadow': {
        const shadow = new RegExp(`^(${decimal})px\\s+(${decimal})px\\s+(${decimal})px\\s+(.+)$`).exec(input)
        if (!shadow || !bounded(shadow[1], -256, 256) || !bounded(shadow[2], -256, 256) || !bounded(shadow[3], 0, 128) || !safeColor(shadow[4])) return false
        break
      }
    }
    if (end < rest.length && !/^\s/.test(rest.slice(end))) return false
    rest = rest.slice(end).trimStart()
  }
  return count > 0
}
