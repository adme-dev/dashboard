/**
 * Browser relay between the XeroFlow composer frame and the native FigFlow tab.
 * It does not draw an editor, call the app server, or put image bytes in the
 * canonical document. Image bytes stay in the native import/snapshot packet.
 *
 * Native contract, owned by the Rust bridge:
 * - window.__xfFigBridge.request accepts a JSON string envelope
 *   {requestId, action, instanceId, documentId, expectedRevision, params}
 *   and resolves a JSON string or object. It may appear after this module loads.
 * - requestId is 8–96 ASCII letters, digits, hyphen, or underscore.
 * - instanceId is a string (the bridge generates 32 lowercase hex characters).
 *   documentId, revision, revisionBefore, and expectedRevision are decimal strings.
 * - action "status" is the current-revision read. Its result includes
 *   supportedActions. Import may replace documentId with the new native tab.
 * - action "edm_import" params are {design, images}. images has one standard
 *   Base64 entry per Image block, or {}. The ok result is {imported:true}.
 * - action "edm_required_snapshot_images" is read-only, params are {}, and the
 *   ok result is {images:[{block_id, url}]}. No changes means {images:[]}.
 *   It must be listed in status.supportedActions. A missing capability does
 *   not snapshot.
 * - action "edm_snapshot" params are {} or {images} for exactly those changes.
 *   result is the canonical EmailDesignDocument, not a wrapper. The image list
 *   and the snapshot must share one instance, document, and revision. A later
 *   status that moved is not given the bytes already fetched.
 * - A timed-out import or snapshot is retried with the same request bytes,
 *   including the next parent message for that attempt. EDM packets
 *   are larger than the old 16 KiB automation limit; the bridge admits them.
 */

const PARENT_ORIGIN = 'https://app.xeroflow.io'
const PROTOCOL = 'xeroflow-edm-v1'
const MAX_DESIGN_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 8192
const MAX_IMAGE_PIXELS = 16_777_216
const MAX_IMAGE_COUNT = 300
const MAX_URL_LENGTH = 8192
const FETCH_TIMEOUT_MS = 10_000
const CONNECT_IMAGE_DEADLINE_MS = 12_000
const SNAPSHOT_IMAGE_DEADLINE_MS = 8_000
const BRIDGE_TIMEOUT_MS = 5_000
const BRIDGE_READY_MS = 10_000
const HEADER_SCAN_BYTES = 262144
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

const PARENT_CODES = new Set([
  'rejected',
  'timeout',
  'image_fetch_failed',
  'image_unsupported',
  'image_too_large',
  'native_refused'
])

function relayError(code) {
  const allowed = PARENT_CODES.has(code) ? code : 'native_refused'
  const error = new Error(allowed)
  error.code = allowed
  return error
}

function randomRequestId() {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

function bytesToBase64(bytes) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

function u32be(bytes, offset) {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0
}

function u16be(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function u16le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function isPublicHttps(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH) return false
  if (/[\u0000-\u0020<>"']/.test(value)) return false
  let url
  try { url = new URL(value) } catch { return false }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return false
  if (host === 'localhost' || host.includes(':') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false
  return true
}

function imageBlocks(design) {
  const blocks = design && typeof design === 'object' ? design.blocks : null
  if (!blocks || typeof blocks !== 'object' || Array.isArray(blocks)) throw relayError('rejected')
  const images = []
  for (const [blockId, block] of Object.entries(blocks)) {
    if (!block || block.type !== 'Image') continue
    const url = block.data && block.data.props ? block.data.props.url : undefined
    if (typeof url !== 'string' || !isPublicHttps(url)) throw relayError('image_unsupported')
    images.push({ blockId, url })
  }
  if (images.length > MAX_IMAGE_COUNT) throw relayError('image_too_large')
  return images
}

function matchesMagic(bytes, type) {
  if (type === 'image/png') return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (type === 'image/gif') return bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38
  if (type === 'image/webp') return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  return false
}

function assertDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw relayError('image_unsupported')
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || height > Math.floor(MAX_IMAGE_PIXELS / width)) {
    throw relayError('image_too_large')
  }
}

function pngSize(bytes) {
  if (bytes.length < 24 || bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    throw relayError('image_unsupported')
  }
  return [u32be(bytes, 16), u32be(bytes, 20)]
}

function jpegSize(bytes) {
  let offset = 2
  let seen = 0
  while (seen < 64 && offset < HEADER_SCAN_BYTES && offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) throw relayError('image_unsupported')
    offset += 1
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.length) break
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0x01) continue
    if (marker === 0xd9 || marker === 0xda) break
    if (offset + 2 > bytes.length) break
    const length = u16be(bytes, offset)
    if (length < 2 || offset + length > bytes.length) throw relayError('image_unsupported')
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (sof) {
      if (length < 7) throw relayError('image_unsupported')
      return [u16be(bytes, offset + 5), u16be(bytes, offset + 3)]
    }
    offset += length
    seen += 1
  }
  throw relayError('image_unsupported')
}

function gifSize(bytes) {
  if (bytes.length < 10) throw relayError('image_unsupported')
  return [u16le(bytes, 6), u16le(bytes, 8)]
}

function webpSize(bytes) {
  if (bytes.length < 30) throw relayError('image_unsupported')
  const kind = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15])
  if (kind === 'VP8X') {
    return [
      1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
    ]
  }
  if (kind === 'VP8 ') {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) throw relayError('image_unsupported')
    return [u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff]
  }
  if (kind === 'VP8L') {
    if (bytes[20] !== 0x2f) throw relayError('image_unsupported')
    const b0 = bytes[21]
    const b1 = bytes[22]
    const b2 = bytes[23]
    const b3 = bytes[24]
    return [
      1 + (((b1 & 0x3f) << 8) | b0),
      1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
    ]
  }
  throw relayError('image_unsupported')
}

function assertHeaderDimensions(bytes, type) {
  const [width, height] = type === 'image/png'
    ? pngSize(bytes)
    : type === 'image/jpeg'
      ? jpegSize(bytes)
      : type === 'image/gif'
        ? gifSize(bytes)
        : webpSize(bytes)
  assertDimensions(width, height)
}

async function readBounded(response) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) throw relayError('image_too_large')
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = new Uint8Array(await response.arrayBuffer())
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
      throw relayError(buffer.byteLength === 0 ? 'image_unsupported' : 'image_too_large')
    }
    return buffer
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const step = await reader.read()
    if (step.done) break
    total += step.value.byteLength
    if (total > MAX_IMAGE_BYTES) throw relayError('image_too_large')
    chunks.push(step.value)
  }
  if (total === 0) throw relayError('image_unsupported')
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function fetchPublicImage(url, fetchImpl = globalThis.fetch, limits = {}) {
  if (!isPublicHttps(url)) throw relayError('image_unsupported')
  const deadlineAt = typeof limits.deadlineAt === 'number' ? limits.deadlineAt : Number.POSITIVE_INFINITY
  const remaining = deadlineAt - Date.now()
  if (remaining <= 0) throw relayError('timeout')
  let response
  try {
    response = await fetchImpl(url, {
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(Math.min(FETCH_TIMEOUT_MS, remaining))
    })
  } catch (error) {
    if (error && error.code && PARENT_CODES.has(error.code)) throw error
    throw relayError('image_fetch_failed')
  }
  if (!response.ok) throw relayError('image_fetch_failed')
  const type = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase()
  if (!IMAGE_TYPES.has(type)) throw relayError('image_unsupported')
  const bytes = await readBounded(response)
  if (!matchesMagic(bytes, type)) throw relayError('image_unsupported')
  assertHeaderDimensions(bytes, type)
  return bytesToBase64(bytes)
}

async function imageMap(requests, fetchImage, deadlineAt, now) {
  if (requests.length > MAX_IMAGE_COUNT) throw relayError('image_too_large')
  const images = {}
  let total = 0
  for (const request of requests) {
    if (now() >= deadlineAt) throw relayError('timeout')
    const encoded = await fetchImage(request.url, deadlineAt)
    if (now() >= deadlineAt) throw relayError('timeout')
    if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length % 4 !== 0) throw relayError('image_unsupported')
    const bytes = Math.floor(encoded.length * 3 / 4)
    if (bytes === 0 || bytes > MAX_IMAGE_BYTES || total + bytes > MAX_TOTAL_IMAGE_BYTES) throw relayError('image_too_large')
    total += bytes
    images[request.blockId] = encoded
  }
  return images
}

function listedImages(result) {
  const list = result && Array.isArray(result.images) ? result.images : null
  if (!list) throw relayError('native_refused')
  return list.map((entry) => {
    const blockId = entry && (entry.block_id || entry.blockId)
    const url = entry && entry.url
    if (typeof blockId !== 'string' || !isPublicHttps(url)) throw relayError('image_unsupported')
    return { blockId, url }
  })
}

function bridgeResult(value) {
  const response = typeof value === 'string' ? JSON.parse(value) : value
  if (!response || response.ok !== true || typeof response.instanceId !== 'string' || typeof response.documentId !== 'string' || typeof response.revision !== 'string') {
    const code = response && response.error && typeof response.error.code === 'string' ? response.error.code : ''
    throw relayError(/^[a-z0-9_]{1,64}$/.test(code) && PARENT_CODES.has(code) ? code : 'native_refused')
  }
  return response
}

function supported(result, action) {
  return !!result && Array.isArray(result.supportedActions) && result.supportedActions.includes(action)
}

/**
 * @param {{ request: (input: string) => Promise<string | object> }} bridge
 * @param {{ postMessage: (message: object, origin: string) => void }} parent
 * @param {{ fetchImage?: (url: string, deadlineAt: number) => Promise<string>, resolveBridge?: () => Promise<void>, now?: () => number, bridgeTimeoutMs?: number, connectImageMs?: number, snapshotImageMs?: number }} [options]
 */
export function createEdmRelay(bridge, parent, options = {}) {
  const now = options.now || (() => Date.now())
  const bridgeTimeoutMs = options.bridgeTimeoutMs ?? BRIDGE_TIMEOUT_MS
  const fetchImage = options.fetchImage || ((url, deadlineAt) => fetchPublicImage(url, globalThis.fetch, { deadlineAt }))
  const resolveBridge = options.resolveBridge || (async () => {
    if (!bridge || typeof bridge.request !== 'function') throw relayError('native_refused')
  })
  let binding = { instanceId: '0', documentId: '0', revision: '0' }
  let handoffId = ''
  let boundChannel = ''
  let unresolvedImport = null
  let unresolvedSnapshot = null
  let busy = false

  function withTimeout(promise) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(relayError('timeout')), bridgeTimeoutMs)
      Promise.resolve(promise).then((value) => {
        clearTimeout(timer)
        resolve(value)
      }, (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
  }

  function accept(response, action) {
    if (action !== 'status' && action !== 'edm_import' && (response.instanceId !== binding.instanceId || response.documentId !== binding.documentId)) {
      throw relayError('native_refused')
    }
    binding = { instanceId: response.instanceId, documentId: response.documentId, revision: response.revision }
    return response.result
  }

  async function sendRaw(raw) {
    const action = JSON.parse(raw).action
    const once = async () => accept(bridgeResult(await withTimeout(bridge.request(raw))), action)
    try {
      return await once()
    } catch (error) {
      if (!error || error.code !== 'timeout') {
        throw error && PARENT_CODES.has(error.code) ? error : relayError('native_refused')
      }
      return await once()
    }
  }

  function call(action, params) {
    return sendRaw(JSON.stringify({
      requestId: randomRequestId(),
      action,
      instanceId: binding.instanceId,
      documentId: binding.documentId,
      expectedRevision: binding.revision,
      params
    }))
  }

  function reply(message, type, payload) {
    const body = { protocol: PROTOCOL, channel: message.channel, requestId: message.requestId, type }
    if (payload !== undefined) body.payload = payload
    parent.postMessage(body, PARENT_ORIGIN)
  }

  async function onConnect(message) {
    if (handoffId) throw relayError('rejected')
    const payload = message.payload
    if (!payload || typeof payload.handoffId !== 'string' || payload.handoffId.length < 1 || payload.handoffId.length > 128) {
      throw relayError('rejected')
    }
    if (!payload.design || typeof payload.design !== 'object' || byteLength(payload.design) > MAX_DESIGN_BYTES) {
      throw relayError('rejected')
    }
    const images = imageBlocks(payload.design)
    await resolveBridge()
    if (unresolvedImport && unresolvedImport.handoffId === payload.handoffId) {
      const imported = await sendRaw(unresolvedImport.raw)
      if (!imported || imported.imported !== true) throw relayError('native_refused')
      unresolvedImport = null
      handoffId = payload.handoffId
      boundChannel = message.channel
      return
    }
    await call('status', {})
    const encoded = await imageMap(images, fetchImage, now() + (options.connectImageMs ?? CONNECT_IMAGE_DEADLINE_MS), now)
    await call('status', {})
    const raw = JSON.stringify({
      requestId: randomRequestId(),
      action: 'edm_import',
      instanceId: binding.instanceId,
      documentId: binding.documentId,
      expectedRevision: binding.revision,
      params: { design: payload.design, images: encoded }
    })
    unresolvedImport = { handoffId: payload.handoffId, raw }
    try {
      const imported = await sendRaw(raw)
      if (!imported || imported.imported !== true) throw relayError('native_refused')
      unresolvedImport = null
      handoffId = payload.handoffId
      boundChannel = message.channel
    } catch (error) {
      if (!error || error.code !== 'timeout') unresolvedImport = null
      throw error
    }
  }

  function assertDesign(design) {
    if (!design || typeof design !== 'object' || Array.isArray(design) || byteLength(design) > MAX_DESIGN_BYTES) {
      throw relayError('native_refused')
    }
  }

  function sameBinding(left) {
    return binding.instanceId === left.instanceId && binding.documentId === left.documentId && binding.revision === left.revision
  }

  async function snapshotParams() {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const status = await call('status', {})
      if (!supported(status, 'edm_snapshot') || !supported(status, 'edm_required_snapshot_images')) {
        throw relayError('native_refused')
      }
      const requests = listedImages(await call('edm_required_snapshot_images', {}))
      const captured = { instanceId: binding.instanceId, documentId: binding.documentId, revision: binding.revision }
      const encoded = await imageMap(requests, fetchImage, now() + (options.snapshotImageMs ?? SNAPSHOT_IMAGE_DEADLINE_MS), now)
      await call('status', {})
      if (!sameBinding(captured)) continue
      return requests.length ? { images: encoded } : {}
    }
    throw relayError('native_refused')
  }

  async function onSnapshot(message) {
    if (!handoffId || message.channel !== boundChannel) throw relayError('rejected')
    if (unresolvedSnapshot) {
      try {
        const design = await sendRaw(unresolvedSnapshot)
        assertDesign(design)
        unresolvedSnapshot = null
        reply(message, 'snapshot', design)
        return
      } catch (error) {
        if (!error || error.code !== 'timeout') unresolvedSnapshot = null
        throw error
      }
    }
    const params = await snapshotParams()
    const raw = JSON.stringify({
      requestId: randomRequestId(),
      action: 'edm_snapshot',
      instanceId: binding.instanceId,
      documentId: binding.documentId,
      expectedRevision: binding.revision,
      params
    })
    unresolvedSnapshot = raw
    try {
      const design = await sendRaw(raw)
      assertDesign(design)
      unresolvedSnapshot = null
      reply(message, 'snapshot', design)
    } catch (error) {
      if (!error || error.code !== 'timeout') unresolvedSnapshot = null
      throw error
    }
  }

  async function handleMessage(event) {
    if (!event || event.origin !== PARENT_ORIGIN || event.source !== parent) return
    const message = event.data
    if (!message || message.protocol !== PROTOCOL || typeof message.channel !== 'string' || typeof message.requestId !== 'string') return
    if (message.type !== 'connect' && message.type !== 'snapshot') return
    if (boundChannel && message.channel !== boundChannel) {
      reply(message, 'error', { code: 'rejected' })
      return
    }
    if (busy) {
      reply(message, 'error', { code: 'rejected' })
      return
    }
    busy = true
    try {
      if (message.type === 'connect') {
        await onConnect(message)
        reply(message, 'ready')
      } else {
        await onSnapshot(message)
      }
    } catch (error) {
      const code = error && PARENT_CODES.has(error.code) ? error.code : 'native_refused'
      reply(message, 'error', { code })
    } finally {
      busy = false
    }
  }

  return { handleMessage }
}

async function waitForBridge(windowObject, holder, options) {
  const now = options.now || (() => Date.now())
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const deadline = now() + (options.bridgeReadyMs ?? BRIDGE_READY_MS)
  for (;;) {
    const current = holder.current && typeof holder.current.request === 'function'
      ? holder.current
      : windowObject.__xfFigBridge
    if (current && typeof current.request === 'function') {
      holder.current = current
      return
    }
    if (now() >= deadline) throw relayError('timeout')
    await sleep(25)
  }
}

export function installEdmRelay(windowObject = globalThis.window, bridge, options = {}) {
  if (!windowObject || !windowObject.parent || windowObject.parent === windowObject) return null
  const holder = { current: bridge && typeof bridge.request === 'function' ? bridge : null }
  const relay = createEdmRelay({
    request(input) {
      const current = holder.current || windowObject.__xfFigBridge
      if (!current || typeof current.request !== 'function') throw relayError('native_refused')
      return current.request(input)
    }
  }, windowObject.parent, {
    ...options,
    resolveBridge: () => waitForBridge(windowObject, holder, options)
  })
  windowObject.addEventListener('message', event => { void relay.handleMessage(event) })
  return relay
}

if (typeof window !== 'undefined' && window.parent && window.parent !== window) installEdmRelay(window)
