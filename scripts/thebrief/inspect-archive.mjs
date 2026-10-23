import { createHash } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'

// Offline preflight only. Never evaluate imported code, fetch resources, or write
// archive paths to disk. This is not an approval to execute or publish a package.
const defaults = { maxArchiveBytes: 20 * 1024 * 1024, maxFileBytes: 10 * 1024 * 1024, maxTotalBytes: 40 * 1024 * 1024, maxFiles: 500, maxDepth: 1 }
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = (message) => {
  throw new Error(message)
}

function safePath(name) {
  if (!name || /[\\:]/.test(name) || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || name.startsWith('/') || name.includes('%')) fail('Unsafe ZIP path')
  const parts = name.replace(/\/$/, '').split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || part.trim() !== part)) fail('Unsafe ZIP path')
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function entries(bytes, limits, budget) {
  if (bytes.length > limits.maxArchiveBytes) fail('ZIP exceeds archive limit')
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) {
      end = i
      break
    }
  }
  if (end < 0) fail('Invalid or truncated ZIP')
  const count = bytes.readUInt16LE(end + 10)
  const size = bytes.readUInt32LE(end + 12)
  const start = bytes.readUInt32LE(end + 16)
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== count) fail('Multi-disk ZIP unsupported')
  if (count === 65535 || size === 0xffffffff || start === 0xffffffff) fail('ZIP64 unsupported')
  if (start + size !== end) fail('Invalid ZIP directory')
  budget.files += count
  if (budget.files > limits.maxFiles) fail('ZIP file count exceeds limit')
  const names = new Set()
  const results = []
  let cursor = start
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const ranges = []
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) fail('Invalid ZIP entry')
    const flags = bytes.readUInt16LE(cursor + 8)
    const method = bytes.readUInt16LE(cursor + 10)
    const crc = bytes.readUInt32LE(cursor + 16)
    const compressed = bytes.readUInt32LE(cursor + 20)
    const expanded = bytes.readUInt32LE(cursor + 24)
    const nameLength = bytes.readUInt16LE(cursor + 28)
    const extraLength = bytes.readUInt16LE(cursor + 30)
    const commentLength = bytes.readUInt16LE(cursor + 32)
    const mode = bytes.readUInt32LE(cursor + 38) >>> 16
    const local = bytes.readUInt32LE(cursor + 42)
    const next = cursor + 46 + nameLength + extraLength + commentLength
    if (next > end) fail('Invalid ZIP entry length')
    if (flags & 0x2041) fail('Encrypted ZIP unsupported')
    if (method !== 0 && method !== 8) fail('Unsupported ZIP compression')
    if ((mode & 0xf000) === 0xa000) fail('ZIP symlink unsupported')
    if (bytes.readUInt16LE(cursor + 34)) fail('Multi-disk ZIP unsupported')
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength)
    if (!(flags & 0x800) && nameBytes.some(byte => byte > 127)) fail('Non-UTF8 ZIP filenames unsupported')
    const name = decoder.decode(nameBytes)
    safePath(name)
    const key = name.normalize('NFC').toLowerCase().replace(/\/$/, '')
    if (names.has(key)) fail('Duplicate ZIP path')
    names.add(key)
    if (expanded > limits.maxFileBytes || budget.bytes + expanded > limits.maxTotalBytes) fail('ZIP expansion exceeds limit')
    if (local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50) fail('Invalid ZIP local header')
    const localNameLength = bytes.readUInt16LE(local + 26)
    const dataStart = local + 30 + localNameLength + bytes.readUInt16LE(local + 28)
    const dataEnd = dataStart + compressed
    if (dataEnd > start || dataStart > start || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) fail('Conflicting ZIP local header')
    if (!nameBytes.equals(bytes.subarray(local + 30, local + 30 + localNameLength))) fail('Conflicting ZIP path')
    if (ranges.some(([a, b]) => local < b && dataEnd > a)) fail('Overlapping ZIP entries')
    ranges.push([local, dataEnd])
    const packed = bytes.subarray(dataStart, dataEnd)
    const cap = Math.min(limits.maxFileBytes, limits.maxTotalBytes - budget.bytes)
    if (cap <= 0) fail('ZIP expansion exceeds limit')
    const data = method === 8 ? inflateRawSync(packed, { maxOutputLength: cap }) : packed
    if (data.length > cap || data.length !== expanded || crc32(data) !== crc) fail('ZIP size or checksum mismatch')
    budget.bytes += data.length
    if (!name.endsWith('/')) results.push({ name, data })
    cursor = next
  }
  if (cursor !== end) fail('Invalid ZIP directory size')
  return results
}

function animationSignals(text) {
  return [
    [/@(?:-webkit-)?keyframes\b/i, 'css-keyframes'],
    [/\b(?:gsap|TweenMax|TweenLite|TimelineMax|TimelineLite)\b/, 'gsap'],
    [/\.animate\s*\(/, 'animation-api-or-library'],
    [/<(?:video|audio)\b/i, 'embedded-media']
  ].filter(([pattern]) => pattern.test(text)).map(([, label]) => label)
}

export function inspectArchive(input, options = {}) {
  const limits = { ...defaults, ...options }
  for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value < 0) fail('Invalid inspection limit')
  const bytes = Buffer.from(input)
  const report = {
    schemaVersion: 1, sha256: digest(bytes), archiveBytes: bytes.length,
    files: [], creatives: [], resourceHints: [],
    limitations: [
      'Static scan only: resource and animation signals are hints, not a complete dependency graph.',
      'No imported code was executed and no external URLs were fetched.',
      'Editable layer/timeline conversion and visual fidelity have not been verified.'
    ]
  }
  const budget = { files: 0, bytes: 0 }
  function visit(archive, prefix, depth) {
    if (depth > limits.maxDepth) fail('ZIP nesting exceeds limit')
    const unpacked = entries(archive, limits, budget)
    const texts = unpacked.filter(({ name }) => /\.(?:html?|css|m?js|json|svg)$/i.test(name))
      .map(({ name, data }) => ({ name, text: data.toString('utf8') }))
    // Package-wide signals are intentionally not claimed to belong to a specific
    // layer or entry point; the real export adapter must resolve dependencies.
    const signals = [...new Set(texts.flatMap(({ text }) => animationSignals(text)))]
    for (const { name, data } of unpacked) {
      const path = prefix + name
      report.files.push({ path, bytes: data.length, sha256: digest(data) })
      if (/\.zip$/i.test(name)) visit(data, `${path}!/`, depth + 1)
      if (/\.html?$/i.test(name)) {
        const content = data.toString('utf8')
        const meta = content.match(/<meta\b[^>]*\bname\s*=\s*["']ad\.size["'][^>]*>/i)?.[0]
          || content.match(/<meta\b[^>]*\bcontent\s*=\s*["'][^"']*["'][^>]*\bname\s*=\s*["']ad\.size["'][^>]*>/i)?.[0]
        const width = Number(meta?.match(/\bwidth\s*=\s*(\d+)/i)?.[1])
        const height = Number(meta?.match(/\bheight\s*=\s*(\d+)/i)?.[1])
        report.creatives.push({ entry: path, dimensions: width > 0 && height > 0 ? { width, height } : null, animationSignals: signals, timelineStatus: 'requires-adapter' })
      }
    }
    for (const { name, text } of texts) {
      for (const url of new Set(text.match(/(?:https?:)?\/\/[^\s"'<>`)]+/g) || [])) {
        if (report.resourceHints.length >= 200) break
        report.resourceHints.push({ file: prefix + name, url })
      }
    }
  }
  visit(bytes, '', 0)
  return { ...report, expandedBytes: budget.bytes }
}
