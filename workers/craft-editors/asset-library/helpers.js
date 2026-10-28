// Explicit host contracts keep file drops away from preview or decorative canvases.
const canvases = Object.freeze({
  photoflow: 'photocraft_canvas', photocraft: 'photocraft_canvas',
  vectorflow: 'vectorcraft_canvas', vectorcraft: 'vectorcraft_canvas',
  effectflow: 'effectcraft_canvas', effectcraft: 'effectcraft_canvas',
  filmflow: 'filmcraft_canvas', filmcraft: 'filmcraft_canvas',
  figflow: 'figcraft_canvas', figcraft: 'figcraft_canvas',
})
export function canvasIdForPath(pathname) { return canvases[pathname.split('/')[1]] || null }
export function editorCanvas(doc = document, pathname = location.pathname) {
  const id = canvasIdForPath(pathname), view = doc.defaultView
  if (!id || !view) return null
  for (const element of doc.querySelectorAll(`canvas#${id}`)) {
    if (!(element instanceof view.HTMLCanvasElement) || !element.isConnected) continue
    const bounds = element.getBoundingClientRect(), style = view.getComputedStyle(element)
    if (bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.right > 0 && bounds.top < view.innerHeight && bounds.left < view.innerWidth && style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && Number(style.opacity) > 0) return element
  }
  return null
}
const extensions = Object.freeze({
  'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'],
  'image/avif': ['avif'], 'image/svg+xml': ['svg'], 'application/pdf': ['pdf'],
  'font/woff2': ['woff2'], 'font/woff': ['woff'], 'font/ttf': ['ttf'], 'font/otf': ['otf'],
})
export function assetFilename(asset) {
  const name = String(asset.name || '').replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '-').slice(0, 140) || 'Motorstack asset'
  const valid = extensions[String(asset.mime || '').toLowerCase().split(';')[0].trim()]
  if (!valid) return name
  const lower = name.toLowerCase()
  return valid.some(ext => lower.endsWith('.' + ext)) ? name : name + '.' + valid[0]
}
export function catalogWarnings(value) {
  return (Array.isArray(value) ? value : []).filter(message => typeof message === 'string').slice(0, 5).map(message => message.slice(0, 240))
}
