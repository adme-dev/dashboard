#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, statfs, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createGunzip } from 'node:zlib'

const IMAGE_ID = 'sha256:12158e33bb5a22ed0ff01b0f9d1cde28e24d44904f3c1819e4ef379fe4f47472'
const PACKAGE_SHA256 = '60d764cfd1fefc45e5437fe87e9cf424b2ddd5318aba53244f5b5cb9a876d339'
const CONFIG_DIGEST = 'sha256:e7bfa3ca18487c5c231229ca24164de533eff36934f1a78c29b96b57f1301805'
const TIMEOUT_MS = 180_000
const MAX_ARCHIVE_BYTES = 2 * 1024 ** 3
const MIN_FREE_BYTES = 3 * 1024 ** 3
const MAX_JSON_BYTES = 8 * 1024 ** 2
const MAX_FILESYSTEM_ENTRIES = 500_000
const MAX_PREFIX_BYTES = 192 * 1024 ** 2
const MAX_PREFIX_CACHE_BYTES = 256 * 1024 ** 2
const canaryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../workers/banner-engine/canary')
const contextRoot = path.join(canaryRoot, '.artifacts/context')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function hashFile(file) {
  const hash = createHash('sha256')
  let size = 0
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk)
    size += chunk.length
  }
  return { sha256: hash.digest('hex'), size }
}

function normalizeArchivePath(value) {
  const normalized = path.posix.normalize(value.replace(/^\/+/, '').replace(/^\.\//, ''))
  assert(normalized !== '..' && !normalized.startsWith('../') && !path.posix.isAbsolute(normalized), `Unsafe archive path: ${value}`)
  return normalized
}

function filesystemPath(value) {
  const normalized = `/${normalizeArchivePath(value)}`.replace(/^\/\.$/, '/')
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized
}

function parseNumber(buffer) {
  if (buffer[0] & 0x80) {
    let value = BigInt(buffer[0] & 0x7f)
    for (let index = 1; index < buffer.length; index += 1) value = (value << 8n) | BigInt(buffer[index])
    assert(value <= BigInt(Number.MAX_SAFE_INTEGER), 'Tar number exceeds safe integer range')
    return Number(value)
  }
  const text = buffer.toString('utf8').replace(/\0.*$/s, '').trim()
  return text ? Number.parseInt(text, 8) : 0
}

function tarString(buffer) {
  return buffer.toString('utf8').replace(/\0.*$/s, '')
}

function checksumValid(header) {
  const expected = parseNumber(header.subarray(148, 156))
  const copy = Buffer.from(header)
  copy.fill(0x20, 148, 156)
  let actual = 0
  for (const byte of copy) actual += byte
  return expected === actual
}

function parsePax(bytes) {
  const result = {}
  let offset = 0
  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset)
    assert(space >= 0, 'Malformed PAX record')
    const length = Number.parseInt(bytes.subarray(offset, space).toString('ascii'), 10)
    assert(Number.isSafeInteger(length) && length > 0 && offset + length <= bytes.length, 'Invalid PAX record length')
    const record = bytes.subarray(space + 1, offset + length - 1).toString('utf8')
    const equals = record.indexOf('=')
    if (equals >= 0) result[record.slice(0, equals)] = record.slice(equals + 1)
    offset += length
  }
  return result
}

class TarReader {
  constructor(stream, name) {
    this.iterator = stream[Symbol.asyncIterator]()
    this.name = name
    this.buffer = Buffer.alloc(0)
    this.done = false
    this.pax = {}
    this.longName = null
    this.longLink = null
  }

  async read(length) {
    while (this.buffer.length < length) {
      const next = await this.iterator.next()
      if (next.done) throw new Error(`Truncated tar archive: ${this.name}`)
      this.buffer = this.buffer.length ? Buffer.concat([this.buffer, next.value]) : next.value
    }
    const result = this.buffer.subarray(0, length)
    this.buffer = this.buffer.subarray(length)
    return result
  }

  async drain() {
    while (true) {
      const next = await this.iterator.next()
      if (next.done) return
    }
  }

  async next() {
    if (this.done) return null
    let header = await this.read(512)
    while (header.every(byte => byte === 0)) {
      header = await this.read(512)
      if (header.every(byte => byte === 0)) {
        this.done = true
        return null
      }
    }
    assert(checksumValid(header), `Invalid tar header checksum in ${this.name}`)
    const rawType = String.fromCharCode(header[156] || 48)
    const size = parseNumber(header.subarray(124, 136))
    assert(Number.isSafeInteger(size) && size >= 0, `Invalid tar entry size in ${this.name}`)
    let name = tarString(header.subarray(0, 100))
    const prefix = tarString(header.subarray(345, 500))
    if (prefix) name = `${prefix}/${name}`
    const entry = {
      name,
      size,
      mode: parseNumber(header.subarray(100, 108)),
      type: rawType,
      linkname: tarString(header.subarray(157, 257))
    }
    const padding = (512 - (size % 512)) % 512
    const read = this.read.bind(this)
    const stream = Readable.from((async function* () {
      let left = size
      while (left > 0) {
        const chunk = await read(Math.min(left, 1024 * 1024))
        left -= chunk.length
        yield chunk
      }
      if (padding) await read(padding)
    })())
    if (['x', 'g', 'L', 'K'].includes(rawType)) {
      assert(size <= MAX_JSON_BYTES, `Oversized tar metadata in ${this.name}`)
      const chunks = []
      for await (const chunk of stream) chunks.push(chunk)
      const contents = Buffer.concat(chunks)
      if (rawType === 'x') Object.assign(this.pax, parsePax(contents))
      if (rawType === 'g') this.pax = { ...parsePax(contents), ...this.pax }
      if (rawType === 'L') this.longName = contents.toString('utf8').replace(/\0.*$/s, '')
      if (rawType === 'K') this.longLink = contents.toString('utf8').replace(/\0.*$/s, '')
      return this.next()
    }
    if (this.pax.path) entry.name = this.pax.path
    if (this.pax.linkpath) entry.linkname = this.pax.linkpath
    if (this.longName) entry.name = this.longName
    if (this.longLink) entry.linkname = this.longLink
    this.pax = {}
    this.longName = null
    this.longLink = null
    entry.name = normalizeArchivePath(entry.name)
    return { ...entry, stream }
  }
}

async function peekStream(stream, minimum = 512) {
  const iterator = stream[Symbol.asyncIterator]()
  const chunks = []
  let size = 0
  while (size < minimum) {
    const next = await iterator.next()
    if (next.done) break
    chunks.push(next.value)
    size += next.value.length
    if (size >= minimum) break
  }
  const prefix = Buffer.concat(chunks)
  const replay = Readable.from((async function* () {
    if (prefix.length) yield prefix
    while (true) {
      const next = await iterator.next()
      if (next.done) return
      yield next.value
    }
  })())
  return { prefix, stream: replay }
}

async function processRegularEntry(entry, prefixCache) {
  const hash = createHash('sha256')
  const imagePath = filesystemPath(entry.name)
  const launchBinary = imagePath === '/usr/local/bin/node' || imagePath === '/bin/busybox' || /^\/(?:usr\/)?lib\//.test(imagePath)
  const capturePrefix = launchBinary && prefixCache.bytes < MAX_PREFIX_CACHE_BYTES
  const chunks = []
  let size = 0
  for await (const chunk of entry.stream) {
    hash.update(chunk)
    size += chunk.length
    if (capturePrefix && size <= MAX_PREFIX_BYTES) chunks.push(chunk)
  }
  const result = {
    name: imagePath,
    type: 'file',
    mode: entry.mode,
    size,
    sha256: hash.digest('hex')
  }
  if (capturePrefix && chunks.length) {
    const bytes = Buffer.concat(chunks)
    if (prefixCache.bytes + bytes.length <= MAX_PREFIX_CACHE_BYTES) {
      result.prefix = bytes
      prefixCache.bytes += bytes.length
    }
  }
  return result
}

async function readLayer(stream, name, prefixCache, counter) {
  const reader = new TarReader(stream, name)
  const entries = []
  while (true) {
    const entry = await reader.next()
    if (!entry) break
    counter.count += 1
    assert(counter.count <= MAX_FILESYSTEM_ENTRIES, `Layer filesystem exceeds ${MAX_FILESYSTEM_ENTRIES} entries`)
    if (entry.type === '0' || entry.type === '\0') entries.push(await processRegularEntry(entry, prefixCache))
    else {
      for await (const chunk of entry.stream) void chunk
      entries.push({
        name: filesystemPath(entry.name),
        type: entry.type === '5' ? 'directory' : entry.type === '2' ? 'symlink' : entry.type === '1' ? 'hardlink' : 'other',
        mode: entry.mode,
        size: entry.size,
        linkname: entry.linkname
      })
    }
  }
  await reader.drain()
  return entries
}

async function processArchiveEntry(entry, prefixCache, counter) {
  const peeked = await peekStream(entry.stream)
  const trimmed = peeked.prefix.toString('utf8').trimStart()
  const gzip = peeked.prefix[0] === 0x1f && peeked.prefix[1] === 0x8b
  const tar = peeked.prefix.length >= 512 && peeked.prefix.subarray(257, 262).toString('ascii') === 'ustar'
  const json = trimmed.startsWith('{') || trimmed.startsWith('[')
  const rawHash = createHash('sha256')
  const diffHash = createHash('sha256')
  let rawSize = 0
  let diffSize = 0
  const rawMeter = new Transform({
    transform(chunk, _encoding, callback) {
      rawHash.update(chunk)
      rawSize += chunk.length
      if (rawSize > MAX_ARCHIVE_BYTES) callback(new Error(`Archive entry exceeds ${MAX_ARCHIVE_BYTES} bytes: ${entry.name}`))
      else callback(null, chunk)
    }
  })
  const diffMeter = new Transform({
    transform(chunk, _encoding, callback) {
      diffHash.update(chunk)
      diffSize += chunk.length
      callback(null, chunk)
    }
  })
  peeked.stream.pipe(rawMeter)
  let contents = null
  let layer = null
  if (gzip || tar || (!json && entry.name.includes('layer.tar'))) {
    const layerStream = gzip ? rawMeter.pipe(createGunzip()).pipe(diffMeter) : rawMeter.pipe(diffMeter)
    layer = await readLayer(layerStream, entry.name, prefixCache, counter)
  } else {
    const chunks = []
    for await (const chunk of rawMeter) {
      if (json && rawSize <= MAX_JSON_BYTES) chunks.push(chunk)
    }
    if (json) {
      assert(rawSize <= MAX_JSON_BYTES, `JSON archive member exceeds ${MAX_JSON_BYTES} bytes: ${entry.name}`)
      contents = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    }
  }
  return {
    name: entry.name,
    size: rawSize,
    sha256: rawHash.digest('hex'),
    diffId: gzip || tar ? `sha256:${diffHash.digest('hex')}` : null,
    uncompressedSize: gzip || tar ? diffSize : null,
    contents,
    layer
  }
}

function removeNode(filesystem, name) {
  filesystem.delete(name)
  const prefix = `${name}/`
  for (const key of filesystem.keys()) if (key.startsWith(prefix)) filesystem.delete(key)
}

function applyLayer(filesystem, entries) {
  for (const entry of entries) {
    if (process.env.CANARY_ATTEST_DEBUG && entry.name.startsWith('/opt/canary')) console.error(`Filesystem ${entry.name}: ${entry.type} ${(entry.mode & 0o777).toString(8)}`)
    const basename = path.posix.basename(entry.name)
    const directory = path.posix.dirname(entry.name)
    if (basename === '.wh..wh..opq') {
      const prefix = `${directory}/`
      for (const key of filesystem.keys()) if (key.startsWith(prefix)) filesystem.delete(key)
      continue
    }
    if (basename.startsWith('.wh.')) {
      removeNode(filesystem, path.posix.join(directory, basename.slice(4)))
      continue
    }
    if (entry.type === 'directory' && filesystem.get(entry.name)?.type === 'directory') filesystem.set(entry.name, entry)
    else {
      removeNode(filesystem, entry.name)
      if (entry.type === 'hardlink') {
        const source = filesystem.get(filesystemPath(entry.linkname))
        assert(source?.type === 'file', `Missing hardlink target: ${entry.linkname}`)
        filesystem.set(entry.name, { ...source, name: entry.name })
      } else filesystem.set(entry.name, entry)
    }
  }
}

function resolveNode(filesystem, name) {
  let current = name
  const seen = new Set()
  for (let depth = 0; depth < 32; depth += 1) {
    assert(!seen.has(current), `Symlink loop resolving ${name}`)
    seen.add(current)
    const node = filesystem.get(current)
    if (!node) return { path: current, node: null }
    if (node.type !== 'symlink') return { path: current, node }
    current = node.linkname.startsWith('/')
      ? filesystemPath(node.linkname)
      : filesystemPath(path.posix.join(path.posix.dirname(current), node.linkname))
  }
  throw new Error(`Too many symlinks resolving ${name}`)
}

function elfString(bytes, offset) {
  assert(offset >= 0 && offset < bytes.length, 'ELF string offset outside retained prefix')
  const end = bytes.indexOf(0, offset)
  assert(end >= 0, 'Unterminated ELF string in retained prefix')
  return bytes.toString('utf8', offset, end)
}

function parseElf(bytes, name) {
  assert(bytes?.length >= 64 && bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), `${name} is not a retained ELF executable`)
  assert(bytes[4] === 2 && bytes[5] === 1 && bytes.readUInt16LE(18) === 62, `${name} is not little-endian AMD64 ELF64`)
  const phoff = Number(bytes.readBigUInt64LE(32))
  const phentsize = bytes.readUInt16LE(54)
  const phnum = bytes.readUInt16LE(56)
  assert(phentsize >= 56 && phoff + phentsize * phnum <= bytes.length, `${name} program headers exceed retained prefix`)
  const headers = []
  for (let index = 0; index < phnum; index += 1) {
    const offset = phoff + index * phentsize
    headers.push({
      type: bytes.readUInt32LE(offset),
      offset: Number(bytes.readBigUInt64LE(offset + 8)),
      vaddr: Number(bytes.readBigUInt64LE(offset + 16)),
      filesz: Number(bytes.readBigUInt64LE(offset + 32))
    })
  }
  let interpreter = null
  const dynamic = headers.find(header => header.type === 2)
  for (const header of headers.filter(item => item.type === 3)) {
    assert(header.offset + header.filesz <= bytes.length, `${name} interpreter exceeds retained prefix`)
    interpreter = bytes.toString('utf8', header.offset, header.offset + header.filesz).replace(/\0.*$/s, '')
  }
  if (!dynamic) return { interpreter, needed: [] }
  assert(dynamic.offset + dynamic.filesz <= bytes.length, `${name} dynamic table exceeds retained prefix`)
  const entries = []
  for (let offset = dynamic.offset; offset + 16 <= dynamic.offset + dynamic.filesz; offset += 16) {
    const tag = bytes.readBigUInt64LE(offset)
    const value = bytes.readBigUInt64LE(offset + 8)
    entries.push({ tag, value })
    if (tag === 0n) break
  }
  const strtab = entries.find(entry => entry.tag === 5n)?.value
  assert(strtab != null, `${name} has no dynamic string table`)
  const load = headers.find(header => header.type === 1 && strtab >= BigInt(header.vaddr) && strtab < BigInt(header.vaddr + header.filesz))
  assert(load, `${name} dynamic string table is not mapped by a retained load segment`)
  const stringOffset = load.offset + Number(strtab - BigInt(load.vaddr))
  const needed = entries.filter(entry => entry.tag === 1n).map(entry => elfString(bytes, stringOffset + Number(entry.value)))
  return { interpreter, needed }
}

function verifyElfDependencies(filesystem, name, seen = new Map()) {
  if (seen.has(name)) return seen.get(name)
  const resolved = resolveNode(filesystem, name)
  assert(resolved.node?.type === 'file', `Missing ELF file: ${name}`)
  const elf = parseElf(resolved.node.prefix, resolved.path)
  const result = { path: resolved.path, interpreter: null, libraries: [] }
  seen.set(name, result)
  if (elf.interpreter) {
    const interpreter = resolveNode(filesystem, elf.interpreter)
    assert(interpreter.node?.type === 'file', `Missing ELF interpreter ${elf.interpreter} for ${name}`)
    result.interpreter = interpreter.path
    verifyElfDependencies(filesystem, interpreter.path, seen)
  }
  for (const dependency of elf.needed) {
    const candidates = ['/lib', '/usr/lib', '/usr/local/lib'].map(directory => `${directory}/${dependency}`)
    const found = candidates.map(candidate => resolveNode(filesystem, candidate)).find(candidate => candidate.node?.type === 'file')
    assert(found, `Missing ELF library ${dependency} for ${name}`)
    result.libraries.push(found.path)
    verifyElfDependencies(filesystem, found.path, seen)
  }
  return result
}

function resolveCommand(filesystem, command, environmentPath) {
  const candidates = command.includes('/') ? [command] : environmentPath.split(':').filter(Boolean).map(directory => `${directory}/${command}`)
  const resolved = candidates.map(candidate => resolveNode(filesystem, candidate)).find(candidate => candidate.node?.type === 'file')
  assert(resolved, `Launch command not found: ${command}`)
  assert((resolved.node.mode & 0o111) !== 0, `Launch command is not executable: ${command}`)
  return resolved.path
}

function descriptorName(digest) {
  assert(/^sha256:[a-f0-9]{64}$/.test(digest), `Invalid descriptor digest: ${digest}`)
  return `blobs/sha256/${digest.slice(7)}`
}

function selectArchiveLayout(files, imageId, configDigest) {
  const index = files.get('index.json')?.contents
  if (index) {
    const descriptors = index.manifests || []
    const descriptor = descriptors.find(item => item.digest === imageId)
    assert(descriptor, `OCI index does not contain retained local manifest ${imageId}`)
    assert(!descriptor.platform || (descriptor.platform.os === 'linux' && descriptor.platform.architecture === 'amd64'), 'Retained OCI manifest platform mismatch')
    return { format: 'oci', manifestName: descriptorName(descriptor.digest), manifestRecovered: true }
  }
  const legacy = files.get('manifest.json')?.contents
  assert(Array.isArray(legacy) && legacy.length > 0, 'Archive has neither OCI index.json nor Docker manifest.json')
  const selected = legacy.find(item => item.Config === `${configDigest.slice(7)}.json`) || legacy[0]
  return { format: 'docker', manifestName: null, manifestRecovered: false, selected }
}

async function consumeSaveArchive(stream, limits, identities = { imageId: IMAGE_ID, configDigest: CONFIG_DIGEST }) {
  const reader = new TarReader(stream, 'docker image save output')
  const files = new Map()
  const prefixCache = { bytes: 0 }
  const counter = { count: 0 }
  let totalBytes = 0
  while (true) {
    const entry = await reader.next()
    if (!entry) break
    if (entry.type !== '0' && entry.type !== '\0') {
      for await (const chunk of entry.stream) void chunk
      continue
    }
    assert(!files.has(entry.name), `Duplicate outer archive member: ${entry.name}`)
    if (process.env.CANARY_ATTEST_DEBUG) console.error(`Reading ${entry.name} (${entry.size} bytes)`)
    const processed = await processArchiveEntry(entry, prefixCache, counter)
    if (process.env.CANARY_ATTEST_DEBUG) console.error(`Read ${entry.name}: ${processed.layer?.length ?? 'not a layer'} entries`)
    totalBytes += processed.size
    assert(totalBytes <= MAX_ARCHIVE_BYTES, `Streamed archive exceeds ${MAX_ARCHIVE_BYTES} bytes`)
    files.set(entry.name, processed)
  }
  const layout = selectArchiveLayout(files, identities.imageId, identities.configDigest)
  assert(layout.manifestRecovered, 'Docker archive did not expose the retained OCI local manifest digest; refusing to conflate it with config digest')
  const manifestFile = files.get(layout.manifestName)
  assert(manifestFile?.contents, `Missing outer image manifest: ${layout.manifestName}`)
  assert(`sha256:${manifestFile.sha256}` === identities.imageId, 'Outer manifest bytes do not hash to retained local manifest digest')
  const manifest = manifestFile.contents
  const configName = descriptorName(manifest.config.digest)
  const configFile = files.get(configName)
  assert(manifest.config.digest === identities.configDigest, `Outer config digest ${manifest.config.digest} differs from retained receipt ${identities.configDigest}`)
  assert(configFile?.contents, `Missing outer config: ${configName}`)
  assert(`sha256:${configFile.sha256}` === identities.configDigest, 'Outer config bytes do not hash to retained config digest')
  const config = configFile.contents
  assert(config.os === 'linux' && config.architecture === 'amd64', 'Outer config platform mismatch')
  assert(config.rootfs?.diff_ids?.length === manifest.layers.length, 'Outer config/layer count mismatch')
  const filesystem = new Map()
  const layers = []
  for (let index = 0; index < manifest.layers.length; index += 1) {
    const descriptor = manifest.layers[index]
    const file = files.get(descriptorName(descriptor.digest))
    assert(file?.layer, `Missing or unreadable outer layer: ${descriptor.digest}`)
    assert(`sha256:${file.sha256}` === descriptor.digest, `Compressed layer digest mismatch at index ${index}`)
    assert(file.size === descriptor.size, `Compressed layer size mismatch at index ${index}`)
    assert(file.diffId === config.rootfs.diff_ids[index], `Uncompressed diff ID mismatch at index ${index}`)
    applyLayer(filesystem, file.layer)
    layers.push({ index, digest: descriptor.digest, diffId: file.diffId, compressedBytes: file.size, uncompressedBytes: file.uncompressedSize })
  }
  return { files, filesystem, manifest, config, layers, totalBytes, archiveFormat: layout.format, entryCount: counter.count, limits }
}

function runInspect() {
  return runProcess('docker', ['image', 'inspect', IMAGE_ID, '--format', '{{json .}}'], 15_000, 4 * 1024 ** 2)
}

function runProcess(command, args, timeoutMs, maxOutputBytes) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let settled = false
    const fail = (error) => {
      if (!settled) {
        settled = true
        reject(error)
      }
    }
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      fail(new Error(`${command} timed out after ${timeoutMs} ms`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length
      if (stdoutBytes > maxOutputBytes) {
        child.kill('SIGTERM')
        fail(new Error(`${command} output exceeded ${maxOutputBytes} bytes`))
      } else stdout.push(chunk)
    })
    child.stderr.on('data', (chunk) => {
      if (stderrBytes < 64 * 1024) stderr.push(chunk)
      stderrBytes += chunk.length
    })
    child.on('error', fail)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      if (code === 0) resolve(Buffer.concat(stdout).toString('utf8').trim())
      else reject(new Error(`${command} exited ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`))
    })
  })
}

async function saveAndAttest() {
  const child = spawn('docker', ['image', 'save', IMAGE_ID], { stdio: ['ignore', 'pipe', 'pipe'] })
  const stderr = []
  let stderrBytes = 0
  child.stderr.on('data', (chunk) => {
    if (stderrBytes < 64 * 1024) stderr.push(chunk)
    stderrBytes += chunk.length
  })
  const timer = setTimeout(() => child.kill('SIGTERM'), TIMEOUT_MS)
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`docker image save failed (code ${code}, signal ${signal}): ${Buffer.concat(stderr).toString('utf8').trim()}`))
    })
  })
  const consumed = consumeSaveArchive(child.stdout, { timeoutMs: TIMEOUT_MS, maxArchiveBytes: MAX_ARCHIVE_BYTES })
  consumed.catch(() => child.kill('SIGTERM'))
  const [archive] = await Promise.all([consumed, completion])
  return archive
}

async function attest() {
  const startedAt = new Date().toISOString()
  const started = performance.now()
  const freeBefore = await statfs(canaryRoot)
  assert(freeBefore.bavail * freeBefore.bsize >= MIN_FREE_BYTES, 'Less than 3 GiB disk reserve before inspection')
  const packageBytes = await readFile(path.join(contextRoot, 'package.json'))
  assert(sha256(packageBytes) === PACKAGE_SHA256, 'Retained package manifest hash mismatch')
  const packageManifest = JSON.parse(packageBytes.toString('utf8'))
  const expectedFiles = { 'package.json': PACKAGE_SHA256, ...packageManifest.files }
  const contextFiles = {}
  for (const [name, expectedHash] of Object.entries(expectedFiles)) {
    const actual = await hashFile(path.join(contextRoot, name))
    assert(actual.sha256 === expectedHash, `Context hash mismatch: ${name}`)
    contextFiles[name] = actual
  }
  const inspection = JSON.parse(await runInspect())
  assert(inspection.Id === IMAGE_ID, `Inspected image ID ${inspection.Id} does not match ${IMAGE_ID}`)
  assert(inspection.Os === 'linux' && inspection.Architecture === 'amd64', 'Outer image is not linux/amd64')
  assert(inspection.Config?.User === 'root', 'Outer image user is not root')
  assert(JSON.stringify(inspection.Config?.Entrypoint) === JSON.stringify(['node', '/opt/canary/supervisor.mjs']), 'Unexpected outer entrypoint')
  const archive = await saveAndAttest()
  const imageConfig = archive.config.config || {}
  assert(imageConfig.User === 'root', 'Saved outer config user is not root')
  assert(JSON.stringify(imageConfig.Entrypoint) === JSON.stringify(['node', '/opt/canary/supervisor.mjs']), 'Saved outer config entrypoint mismatch')
  const packagedFiles = {}
  for (const [name, expectedHash] of Object.entries(expectedFiles)) {
    const imagePath = filesystemPath(path.posix.join('/opt/canary', name))
    const resolved = resolveNode(archive.filesystem, imagePath)
    assert(resolved.node?.type === 'file', `Packaged file missing from outer filesystem: ${imagePath}`)
    assert(resolved.node.sha256 === expectedHash, `Packaged file hash mismatch: ${imagePath}`)
    assert(resolved.node.size === contextFiles[name].size, `Packaged file size mismatch: ${imagePath}`)
    assert((resolved.node.mode & 0o777) === 0o444, `Packaged file mode is not 0444: ${imagePath}`)
    packagedFiles[imagePath] = { sha256: resolved.node.sha256, bytes: resolved.node.size, mode: '0444', matchesContext: true }
  }
  for (const directory of ['/opt/canary', '/opt/canary/fixtures']) {
    const resolved = resolveNode(archive.filesystem, directory)
    assert(resolved.node?.type === 'directory' && (resolved.node.mode & 0o777) === 0o555, `Packaged directory missing or not 0555: ${directory}; observed ${resolved.node?.type} mode ${(resolved.node?.mode & 0o777).toString(8)}`)
  }
  const pathEnvironment = (imageConfig.Env || []).find(value => value.startsWith('PATH='))?.slice(5) || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
  const launch = {}
  for (const [label, command] of Object.entries({ shell: '/bin/sh', mountpoint: 'mountpoint', mount: 'mount', node: 'node' })) {
    const executable = resolveCommand(archive.filesystem, command, pathEnvironment)
    launch[label] = { command, executable, ...verifyElfDependencies(archive.filesystem, executable) }
  }
  const freeAfter = await statfs(canaryRoot)
  assert(freeAfter.bavail * freeAfter.bsize >= MIN_FREE_BYTES, 'Less than 3 GiB disk reserve after inspection')
  return {
    schema: 'banner-engine-outer-content-attestation-v1',
    status: 'passed',
    startedAt,
    durationMs: Math.round(performance.now() - started),
    image: {
      requestedLocalManifestDigest: IMAGE_ID,
      inspectedId: inspection.Id,
      recoveredManifestDigest: IMAGE_ID,
      configDigest: CONFIG_DIGEST,
      os: archive.config.os,
      architecture: archive.config.architecture,
      repoDigests: inspection.RepoDigests || [],
      registryDigest: { status: 'not-proven', reason: 'No registry request or push was performed; local manifest and config digests are not registry digests.' }
    },
    package: { sha256: PACKAGE_SHA256, context: '.artifacts/context', files: packagedFiles },
    archive: {
      format: archive.archiveFormat,
      streamedBytes: archive.totalBytes,
      retainedArchive: false,
      filesystemEntries: archive.entryCount,
      layers: archive.layers
    },
    launchDependencies: launch,
    limits: { timeoutMs: TIMEOUT_MS, maxArchiveBytes: MAX_ARCHIVE_BYTES, maxFilesystemEntries: MAX_FILESYSTEM_ENTRIES, maxPrefixCacheBytes: MAX_PREFIX_CACHE_BYTES, minFreeBytes: MIN_FREE_BYTES },
    historicalBuildBudget: { status: 'breach-preserved', observedBytes: 1_268_305_705, ceilingBytes: 943_718_400, accepted: false },
    execution: { containerLaunched: false, imageBuilt: false, hostedReadinessClaimed: false }
  }
}

function parseReceiptPath(args) {
  if (args.length === 0) return null
  assert(args.length === 2 && args[0] === '--receipt' && args[1], 'Usage: node scripts/banner-studio/attest-engine-canary-image.mjs [--receipt path]')
  return path.resolve(args[1])
}

async function main() {
  const receiptPath = parseReceiptPath(process.argv.slice(2))
  let receipt
  try {
    receipt = await attest()
  } catch (error) {
    receipt = {
      schema: 'banner-engine-outer-content-attestation-v1',
      status: 'failed',
      generatedAt: new Date().toISOString(),
      image: { requestedLocalManifestDigest: IMAGE_ID, expectedConfigDigest: CONFIG_DIGEST },
      package: { sha256: PACKAGE_SHA256 },
      error: error.message,
      errorStack: process.env.CANARY_ATTEST_DEBUG ? error.stack : undefined,
      registryDigest: { status: 'not-proven' },
      historicalBuildBudget: { status: 'breach-preserved', observedBytes: 1_268_305_705, ceilingBytes: 943_718_400, accepted: false },
      execution: { containerLaunched: false, imageBuilt: false, hostedReadinessClaimed: false }
    }
  }
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`
  if (receiptPath) await writeFile(receiptPath, serialized, { encoding: 'utf8', flag: 'wx' })
  else process.stdout.write(serialized)
  if (receipt.status !== 'passed') process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message)
    process.exitCode = 1
  })
}

export { consumeSaveArchive }
