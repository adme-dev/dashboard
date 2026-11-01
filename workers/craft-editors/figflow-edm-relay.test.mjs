import assert from 'node:assert/strict'
import test from 'node:test'
import { createEdmRelay, fetchPublicImage, installEdmRelay } from './figflow-edm-relay.mjs'

const PARENT = 'https://app.xeroflow.io'
const HEX = 'ab'.repeat(16)

function png(width, height) {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 0)
  bytes[16] = (width >>> 24) & 255
  bytes[17] = (width >>> 16) & 255
  bytes[18] = (width >>> 8) & 255
  bytes[19] = width & 255
  bytes[20] = (height >>> 24) & 255
  bytes[21] = (height >>> 16) & 255
  bytes[22] = (height >>> 8) & 255
  bytes[23] = height & 255
  return bytes
}

function imageResponse(bytes, type = 'image/png', length = bytes.byteLength) {
  return {
    ok: true,
    headers: { get(name) {
      if (name === 'content-type') return type
      if (name === 'content-length') return String(length)
      return null
    } },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }
}

function ok(binding, result) {
  return { ok: true, ...binding, result }
}

function design(blocks = {}) {
  return { blocks: { heading: { type: 'Heading', data: { props: { text: 'Hello' } } }, ...blocks } }
}

function relayFixture(options = {}) {
  const calls = []
  const posted = []
  let binding = { instanceId: HEX, documentId: '10', revision: '3' }
  const parent = { postMessage(message, origin) { posted.push({ message, origin }) } }
  const bridge = {
    request(raw) {
      const envelope = JSON.parse(raw)
      calls.push(envelope)
      if (options.onRequest) return options.onRequest(envelope, binding, raw)
      if (envelope.action === 'status') {
        binding = { ...binding, revision: options.nextRevision ? options.nextRevision(binding.revision) : binding.revision }
        return ok(binding, { supportedActions: ['edm_import', 'edm_snapshot', 'edm_required_snapshot_images'] })
      }
      if (envelope.action === 'edm_import') {
        binding = { instanceId: binding.instanceId, documentId: '42', revision: '4' }
        return ok(binding, { imported: true })
      }
      if (envelope.action === 'edm_required_snapshot_images') return ok(binding, { images: [] })
      if (envelope.action === 'edm_snapshot') {
        binding = { ...binding, revision: '5' }
        return ok(binding, options.snapshot || { blocks: { heading: { type: 'Heading', data: { props: { text: 'Edited' } } } } })
      }
      return { ok: false, error: { code: 'unsupported_action' } }
    }
  }
  const relay = createEdmRelay(bridge, parent, options.relay)
  return {
    calls,
    posted,
    send(data, overrides = {}) {
      return relay.handleMessage({
        origin: overrides.origin ?? PARENT,
        source: overrides.source ?? parent,
        data
      })
    }
  }
}

const connect = (channel = 'channel-1', payload) => ({
  protocol: 'xeroflow-edm-v1',
  channel,
  requestId: 'request-1',
  type: 'connect',
  payload: payload || { handoffId: 'handoff-1', design: design() }
})

test('ignores a message from the wrong origin or source', async () => {
  const fixture = relayFixture()
  await fixture.send(connect(), { origin: 'https://evil.example' })
  await fixture.send(connect(), { source: {} })
  assert.equal(fixture.posted.length, 0)
  assert.equal(fixture.calls.length, 0)
})

test('connect reads status, imports once, and posts ready only after imported:true', async () => {
  const fixture = relayFixture({ nextRevision: () => '7' })
  await fixture.send(connect())
  const actions = fixture.calls.map(call => call.action)
  assert.deepEqual(actions, ['status', 'status', 'edm_import'])
  const imported = fixture.calls[2]
  assert.equal(imported.instanceId, HEX)
  assert.equal(imported.documentId, '10')
  assert.equal(imported.expectedRevision, '7')
  assert.equal(imported.params.images && Object.keys(imported.params.images).length, 0)
  assert.deepEqual(fixture.posted, [{
    origin: PARENT,
    message: { protocol: 'xeroflow-edm-v1', channel: 'channel-1', requestId: 'request-1', type: 'ready' }
  }])
})

test('import failure posts an error and does not post ready', async () => {
  const fixture = relayFixture({
    onRequest(envelope, binding) {
      if (envelope.action === 'status') return ok(binding, { supportedActions: ['edm_import'] })
      return { ok: false, error: { code: 'engine_refused' } }
    }
  })
  await fixture.send(connect())
  assert.equal(fixture.posted.length, 1)
  assert.deepEqual(fixture.posted[0].message.payload, { code: 'native_refused' })
  assert.equal(fixture.posted.some(entry => entry.message.type === 'ready'), false)
})

test('a second connect and a different channel do not call native again', async () => {
  const fixture = relayFixture()
  await fixture.send(connect())
  const afterImport = fixture.calls.length
  await fixture.send({ ...connect(), requestId: 'request-2' })
  await fixture.send({ ...connect('channel-2'), requestId: 'request-3', type: 'snapshot' })
  assert.equal(fixture.calls.length, afterImport)
  assert.equal(fixture.posted.at(-2).message.payload.code, 'rejected')
  assert.equal(fixture.posted.at(-1).message.payload.code, 'rejected')
})

test('snapshot requires the read-only image action and posts the canonical document', async () => {
  const image = 'QQ=='
  const fixture = relayFixture({
    relay: { fetchImage: async () => image },
    onRequest(envelope) {
      const current = {
        instanceId: envelope.instanceId === '0' ? HEX : envelope.instanceId,
        documentId: envelope.documentId === '0' ? '10' : envelope.documentId,
        revision: envelope.expectedRevision === '0' ? '3' : envelope.expectedRevision
      }
      if (envelope.action === 'status') return ok(current, { supportedActions: ['edm_snapshot', 'edm_required_snapshot_images'] })
      if (envelope.action === 'edm_import') return ok({ instanceId: current.instanceId, documentId: '42', revision: '8' }, { imported: true })
      if (envelope.action === 'edm_required_snapshot_images') {
        return ok({ instanceId: HEX, documentId: '42', revision: '8' }, { images: [{ block_id: 'hero', url: 'https://cdn.example.com/a.png' }] })
      }
      if (envelope.action === 'edm_snapshot') {
        assert.equal(envelope.documentId, '42')
        assert.equal(envelope.instanceId, HEX)
        assert.equal(envelope.expectedRevision, '8')
        assert.equal(envelope.params.images.hero, image)
        return ok({ instanceId: HEX, documentId: '42', revision: '9' }, { blocks: { hero: { type: 'Image', data: { props: { url: 'https://cdn.example.com/a.png' } } } } })
      }
      return { ok: false, error: { code: 'unsupported_action' } }
    }
  })
  await fixture.send(connect())
  await fixture.send({ ...connect(), requestId: 'snap-1', type: 'snapshot' })
  const snapshot = fixture.posted.at(-1).message
  assert.equal(snapshot.type, 'snapshot')
  assert.equal(snapshot.payload.blocks.hero.data.props.url, 'https://cdn.example.com/a.png')
  assert.equal(JSON.stringify(snapshot).includes(image), false)
  assert.equal(fixture.calls.some(call => call.action === 'edm_snapshot'), true)
})

test('a missing snapshot-image capability does not call edm_snapshot', async () => {
  const fixture = relayFixture({
    onRequest(envelope, binding) {
      if (envelope.action === 'status') return ok(binding, { supportedActions: ['edm_snapshot'] })
      if (envelope.action === 'edm_import') return ok({ ...binding, documentId: '42', revision: '4' }, { imported: true })
      return { ok: false, error: { code: 'unsupported_action' } }
    }
  })
  await fixture.send(connect())
  await fixture.send({ ...connect(), requestId: 'snap-1', type: 'snapshot' })
  assert.equal(fixture.calls.some(call => call.action === 'edm_snapshot' || call.action === 'edm_required_snapshot_images'), false)
  assert.equal(fixture.posted.at(-1).message.payload.code, 'native_refused')
})

test('an unsupported image query does not continue into an empty snapshot', async () => {
  const fixture = relayFixture({
    onRequest(envelope, binding) {
      if (envelope.action === 'status') return ok(binding, { supportedActions: ['edm_snapshot', 'edm_required_snapshot_images'] })
      if (envelope.action === 'edm_import') return ok({ ...binding, documentId: '42', revision: '4' }, { imported: true })
      return { ok: false, error: { code: 'unsupported_action' } }
    }
  })
  await fixture.send(connect())
  await fixture.send({ ...connect(), requestId: 'snap-1', type: 'snapshot' })
  assert.equal(fixture.calls.some(call => call.action === 'edm_snapshot'), false)
  assert.equal(fixture.posted.at(-1).message.payload.code, 'native_refused')
})

test('a later snapshot resends the unresolved snapshot bytes before a new read', async () => {
  const snapshots = []
  let answer = false
  const actions = []
  const fixture = relayFixture({
    relay: { bridgeTimeoutMs: 15 },
    onRequest(envelope, _binding, raw) {
      actions.push(envelope.action)
      const current = {
        instanceId: envelope.instanceId === '0' ? HEX : envelope.instanceId,
        documentId: envelope.documentId === '0' ? '10' : envelope.documentId,
        revision: envelope.expectedRevision === '0' ? '3' : envelope.expectedRevision
      }
      if (envelope.action === 'status') return ok(current, { supportedActions: ['edm_import', 'edm_snapshot', 'edm_required_snapshot_images'] })
      if (envelope.action === 'edm_import') return ok({ instanceId: HEX, documentId: '42', revision: '8' }, { imported: true })
      if (envelope.action === 'edm_required_snapshot_images') return ok({ instanceId: HEX, documentId: '42', revision: '8' }, { images: [] })
      if (envelope.action === 'edm_snapshot') {
        snapshots.push(raw)
        if (!answer) return new Promise(() => {})
        return ok({ instanceId: HEX, documentId: '42', revision: '8' }, { blocks: { heading: { type: 'Heading', data: { props: { text: 'Edited' } } } } })
      }
      return { ok: false, error: { code: 'unsupported_action' } }
    }
  })
  await fixture.send(connect())
  await fixture.send({ ...connect(), requestId: 'snap-1', type: 'snapshot' })
  assert.equal(fixture.posted.at(-1).message.payload.code, 'timeout')
  assert.equal(snapshots.length, 2)
  const beforeReplay = actions.length
  answer = true
  await fixture.send({ ...connect(), requestId: 'snap-2', type: 'snapshot' })
  assert.equal(actions[beforeReplay], 'edm_snapshot')
  assert.equal(snapshots.length, 3)
  assert.equal(snapshots.every(raw => raw === snapshots[0]), true)
  assert.equal(fixture.posted.at(-1).message.type, 'snapshot')
  assert.equal(actions.filter(action => action === 'edm_required_snapshot_images').length, 1)
})

test('snapshot refuses fetched bytes when the revision moves and reads again', async () => {
  const oldImage = 'QQ=='
  const freshImage = 'Qg=='
  const fetched = []
  const script = [
    { action: 'status', revision: '8' },
    { action: 'edm_required_snapshot_images', revision: '8', url: 'https://cdn.example.com/old.png' },
    { action: 'status', revision: '9' },
    { action: 'status', revision: '9' },
    { action: 'edm_required_snapshot_images', revision: '9', url: 'https://cdn.example.com/new.png' },
    { action: 'status', revision: '9' },
    { action: 'edm_snapshot', revision: '9' }
  ]
  let step = 0
  let imported = false
  const fixture = relayFixture({
    relay: {
      fetchImage: async (url) => {
        fetched.push(url)
        return url.endsWith('/old.png') ? oldImage : freshImage
      }
    },
    onRequest(envelope) {
      if (envelope.action === 'edm_import') {
        imported = true
        return ok({ instanceId: HEX, documentId: '42', revision: '8' }, { imported: true })
      }
      if (!imported && envelope.action === 'status') {
        return ok({ instanceId: HEX, documentId: '10', revision: '3' }, { supportedActions: ['edm_import', 'edm_snapshot', 'edm_required_snapshot_images'] })
      }
      const expected = script[step]
      step += 1
      assert.equal(envelope.action, expected.action)
      assert.equal(envelope.documentId, '42')
      if (envelope.action === 'edm_snapshot') {
        assert.equal(envelope.expectedRevision, '9')
        assert.equal(envelope.params.images.hero, freshImage)
        assert.equal(JSON.stringify(envelope.params).includes(oldImage), false)
        return ok({ instanceId: HEX, documentId: '42', revision: '9' }, { blocks: { hero: { type: 'Image', data: { props: { url: 'https://cdn.example.com/new.png' } } } } })
      }
      const images = expected.url ? [{ block_id: 'hero', url: expected.url }] : undefined
      return ok(
        { instanceId: HEX, documentId: '42', revision: expected.revision },
        envelope.action === 'status'
          ? { supportedActions: ['edm_snapshot', 'edm_required_snapshot_images'] }
          : { images }
      )
    }
  })
  await fixture.send(connect())
  await fixture.send({ ...connect(), requestId: 'snap-1', type: 'snapshot' })
  assert.deepEqual(fetched, ['https://cdn.example.com/old.png', 'https://cdn.example.com/new.png'])
  assert.equal(fixture.posted.at(-1).message.type, 'snapshot')
  assert.equal(step, script.length)
})

test('snapshot does not send bytes when a fresh read also moves', async () => {
  const script = [
    { action: 'status', revision: '8' },
    { action: 'edm_required_snapshot_images', revision: '8' },
    { action: 'status', revision: '9' },
    { action: 'status', revision: '9' },
    { action: 'edm_required_snapshot_images', revision: '9' },
    { action: 'status', revision: '10' }
  ]
  let step = 0
  let imported = false
  const fixture = relayFixture({
    onRequest(envelope) {
      if (envelope.action === 'edm_import') {
        imported = true
        return ok({ instanceId: HEX, documentId: '42', revision: '8' }, { imported: true })
      }
      if (!imported && envelope.action === 'status') {
        return ok({ instanceId: HEX, documentId: '10', revision: '3' }, { supportedActions: ['edm_import'] })
      }
      const expected = script[step]
      step += 1
      assert.equal(envelope.action, expected.action)
      return ok(
        { instanceId: HEX, documentId: '42', revision: expected.revision },
        envelope.action === 'status'
          ? { supportedActions: ['edm_snapshot', 'edm_required_snapshot_images'] }
          : { images: [] }
      )
    }
  })
  await fixture.send(connect())
  await fixture.send({ ...connect(), requestId: 'snap-1', type: 'snapshot' })
  assert.equal(step, script.length)
  assert.equal(fixture.calls.some(call => call.action === 'edm_snapshot'), false)
  assert.equal(fixture.posted.at(-1).message.payload.code, 'native_refused')
})

test('a timed-out import retries the same request bytes', async () => {
  const imports = []
  const fixture = relayFixture({
    relay: { bridgeTimeoutMs: 20 },
    onRequest(envelope, binding, raw) {
      if (envelope.action === 'status') return ok(binding, { supportedActions: ['edm_import'] })
      if (envelope.action === 'edm_import') {
        imports.push(raw)
        if (imports.length === 1) return new Promise(() => {})
        return ok({ instanceId: HEX, documentId: '42', revision: '4' }, { imported: true })
      }
      return { ok: false, error: { code: 'unsupported_action' } }
    }
  })
  await fixture.send(connect())
  assert.equal(imports.length, 2)
  assert.equal(imports[0], imports[1])
  assert.equal(JSON.parse(imports[0]).requestId, JSON.parse(imports[1]).requestId)
  assert.equal(fixture.posted.at(-1).message.type, 'ready')
})

test('a later connect reuses the unresolved import identity', async () => {
  const imports = []
  let answer = false
  const fixture = relayFixture({
    relay: { bridgeTimeoutMs: 15 },
    onRequest(envelope, binding, raw) {
      if (envelope.action === 'status') return ok(binding, { supportedActions: ['edm_import'] })
      if (envelope.action === 'edm_import') {
        imports.push(raw)
        if (!answer) return new Promise(() => {})
        return ok({ instanceId: HEX, documentId: '42', revision: '4' }, { imported: true })
      }
      return { ok: false, error: { code: 'unsupported_action' } }
    }
  })
  await fixture.send(connect())
  assert.equal(fixture.posted.at(-1).message.payload.code, 'timeout')
  answer = true
  await fixture.send({ ...connect(), requestId: 'request-2' })
  assert.equal(imports.every(raw => raw === imports[0]), true)
  assert.equal(fixture.posted.at(-1).message.type, 'ready')
})

test('too many images and a batch deadline stop before the remaining fetches', async () => {
  const blocks = {}
  for (let index = 0; index < 301; index += 1) blocks['image-' + index] = { type: 'Image', data: { props: { url: 'https://cdn.example.com/' + index + '.png' } } }
  let fetches = 0
  const counted = relayFixture({ relay: { fetchImage: async () => { fetches += 1; return 'QQ==' } } })
  await counted.send(connect('channel-1', { handoffId: 'handoff-1', design: design(blocks) }))
  assert.equal(fetches, 0)
  assert.equal(counted.calls.length, 0)
  assert.equal(counted.posted[0].message.payload.code, 'image_too_large')

  let clock = 0
  const slow = relayFixture({
    relay: {
      now: () => clock,
      connectImageMs: 5,
      fetchImage: async () => { clock = 10; return 'QQ==' }
    }
  })
  await slow.send(connect('channel-1', {
    handoffId: 'handoff-1',
    design: design({ hero: { type: 'Image', data: { props: { url: 'https://cdn.example.com/a.png' } } }, second: { type: 'Image', data: { props: { url: 'https://cdn.example.com/b.png' } } } })
  }))
  assert.equal(slow.posted.at(-1).message.payload.code, 'timeout')
  assert.equal(slow.calls.some(call => call.action === 'edm_import'), false)
})

test('the listener is installed before the native bridge exists', async () => {
  const posted = []
  const calls = []
  let clock = 0
  const parent = { postMessage(message, origin) { posted.push({ message, origin }) } }
  const windowObject = { parent, addEventListener(type, fn) { this.listener = fn; this.eventType = type } }
  installEdmRelay(windowObject, undefined, {
    now: () => clock,
    sleep: async () => {
      clock += 25
      windowObject.__xfFigBridge = {
        request(raw) {
          const envelope = JSON.parse(raw)
          calls.push(envelope.action)
          if (envelope.action === 'status') return ok({ instanceId: HEX, documentId: '10', revision: '3' }, {})
          return ok({ instanceId: HEX, documentId: '42', revision: '4' }, { imported: true })
        }
      }
    },
    bridgeReadyMs: 1000
  })
  assert.equal(windowObject.eventType, 'message')
  assert.equal(windowObject.__xfFigBridge, undefined)
  const dispatched = windowObject.listener({ origin: PARENT, source: parent, data: connect() })
  assert.equal(dispatched, undefined)
  const deadline = Date.now() + 1000
  while (posted.at(-1)?.message?.type !== 'ready') {
    if (Date.now() >= deadline) break
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.deepEqual(calls, ['status', 'status', 'edm_import'])
  assert.equal(posted.at(-1).message.type, 'ready')
})

test('public image fetches omit credentials and reject private or oversized sources before decode', async () => {
  let init
  let decoded = 0
  globalThis.createImageBitmap = () => { decoded += 1; throw new Error('decoded') }
  const encoded = await fetchPublicImage('https://cdn.example.com/a.png', async (_url, options) => {
    init = options
    return imageResponse(png(1, 1))
  })
  assert.equal(init.credentials, 'omit')
  assert.equal(init.redirect, 'error')
  assert.equal(init.cache, 'no-store')
  assert.match(encoded, /^[A-Za-z0-9+/]+={0,2}$/)
  assert.equal(decoded, 0)
  await assert.rejects(() => fetchPublicImage('http://cdn.example.com/a.png', async () => { throw new Error('fetched') }), error => error.code === 'image_unsupported')
  await assert.rejects(() => fetchPublicImage('https://10.1.2.3/a.png', async () => { throw new Error('fetched') }), error => error.code === 'image_unsupported')
  await assert.rejects(() => fetchPublicImage('https://cdn.example.com/a.png', async () => imageResponse(png(1, 1), 'image/png', (10 * 1024 * 1024) + 1)), error => error.code === 'image_too_large')
  await assert.rejects(() => fetchPublicImage('https://cdn.example.com/wide.png', async () => imageResponse(png(8193, 1))), error => error.code === 'image_too_large')
  await assert.rejects(() => fetchPublicImage('https://cdn.example.com/tall.jpg', async () => imageResponse(Uint8Array.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x20, 0x01, 0x00, 0x01, 0x01, 0x11, 0x00, 0x00
  ]), 'image/jpeg')), error => error.code === 'image_too_large')
  assert.match(await fetchPublicImage('https://cdn.example.com/a.jpg', async () => imageResponse(Uint8Array.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x11, 0x00, 0x00
  ]), 'image/jpeg')), /^[A-Za-z0-9+/]+={0,2}$/)
  assert.match(await fetchPublicImage('https://cdn.example.com/a.gif', async () => imageResponse(Uint8Array.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00
  ]), 'image/gif')), /^[A-Za-z0-9+/]+={0,2}$/)
  const webp = new Uint8Array(30)
  webp.set([0x52, 0x49, 0x46, 0x46, 26, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0], 0)
  assert.match(await fetchPublicImage('https://cdn.example.com/a.webp', async () => imageResponse(webp, 'image/webp')), /^[A-Za-z0-9+/]+={0,2}$/)
  assert.equal(decoded, 0)
  delete globalThis.createImageBitmap
})
