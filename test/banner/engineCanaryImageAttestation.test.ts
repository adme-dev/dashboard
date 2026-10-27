import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { consumeSaveArchive } from '../../scripts/banner-studio/attest-engine-canary-image.mjs'

function digest(bytes: Buffer) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function octal(value: number, length: number) {
  return Buffer.from(`${value.toString(8).padStart(length - 1, '0')}\0`)
}

function tar(entries: Array<{ name: string, contents?: Buffer, mode?: number, type?: string }>, trailingBytes = 0) {
  const chunks: Buffer[] = []
  for (const entry of entries) {
    const contents = entry.contents || Buffer.alloc(0)
    const header = Buffer.alloc(512)
    header.write(entry.name, 0, 100)
    octal(entry.mode ?? 0o444, 8).copy(header, 100)
    octal(0, 8).copy(header, 108)
    octal(0, 8).copy(header, 116)
    octal(contents.length, 12).copy(header, 124)
    octal(0, 12).copy(header, 136)
    header.fill(0x20, 148, 156)
    header.write(entry.type || '0', 156, 1)
    header.write('ustar\0', 257, 6)
    header.write('00', 263, 2)
    let checksum = 0
    for (const byte of header) checksum += byte
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8)
    chunks.push(header, contents)
    const padding = (512 - (contents.length % 512)) % 512
    if (padding) chunks.push(Buffer.alloc(padding))
  }
  chunks.push(Buffer.alloc(1024 + trailingBytes))
  return Buffer.concat(chunks)
}

function drip(bytes: Buffer) {
  return Readable.from((async function* () {
    for (let offset = 0; offset < bytes.length; offset += 31) yield bytes.subarray(offset, offset + 31)
  })())
}

function fixture(compressed: boolean, mismatch?: 'layer' | 'diff') {
  const expectedContents = Buffer.from('retained synthetic pins\n')
  const layerBytes = tar([
    { name: 'opt/canary/', mode: 0o555, type: '5' },
    { name: 'opt/canary/pins.mjs', contents: expectedContents }
  ], 2048)
  const storedLayer = compressed ? gzipSync(layerBytes) : layerBytes
  const actualLayerDigest = digest(storedLayer)
  const expectedLayerDigest = mismatch === 'layer' ? `sha256:${'0'.repeat(64)}` : actualLayerDigest
  const configBytes = Buffer.from(JSON.stringify({
    os: 'linux',
    architecture: 'amd64',
    config: { User: 'root' },
    rootfs: { diff_ids: [mismatch === 'diff' ? `sha256:${'1'.repeat(64)}` : digest(layerBytes)] }
  }))
  const configDigest = digest(configBytes)
  const manifestBytes = Buffer.from(JSON.stringify({
    schemaVersion: 2,
    config: { digest: configDigest, size: configBytes.length },
    layers: [{ digest: expectedLayerDigest, size: storedLayer.length }]
  }))
  const imageId = digest(manifestBytes)
  const indexBytes = Buffer.from(JSON.stringify({
    schemaVersion: 2,
    manifests: [{ digest: imageId, size: manifestBytes.length }]
  }))
  const archive = tar([
    { name: `blobs/sha256/${expectedLayerDigest.slice(7)}`, contents: storedLayer },
    { name: `blobs/sha256/${configDigest.slice(7)}`, contents: configBytes },
    { name: `blobs/sha256/${imageId.slice(7)}`, contents: manifestBytes },
    { name: 'index.json', contents: indexBytes }
  ])
  return { archive, imageId, configDigest, actualLayerDigest, layerBytes, storedLayer, expectedContents }
}

async function inspectFixture(compressed: boolean, mismatch?: 'layer' | 'diff') {
  const value = fixture(compressed, mismatch)
  const result = await consumeSaveArchive(drip(value.archive), {}, { imageId: value.imageId, configDigest: value.configDigest })
  return { value, result }
}

describe('native canary outer-image streaming attestation', () => {
  it.each([false, true])('drains trailing tar bytes and correlates adjacent OCI entries (compressed=%s)', async (compressed) => {
    const { value, result } = await inspectFixture(compressed)
    expect(result.layers).toEqual([{
      index: 0,
      digest: value.actualLayerDigest,
      diffId: digest(value.layerBytes),
      compressedBytes: value.storedLayer.length,
      uncompressedBytes: value.layerBytes.length
    }])
    expect(result.layers[0].diffId).not.toBe(digest(value.layerBytes.subarray(0, value.layerBytes.length - 2048)))
    expect(result.filesystem.get('/opt/canary/pins.mjs').sha256).toBe(digest(value.expectedContents).slice(7))
    expect(result.filesystem.get('/opt/canary').mode & 0o777).toBe(0o555)
  })

  it('rejects a layer descriptor that does not match its bytes', async () => {
    await expect(inspectFixture(false, 'layer')).rejects.toThrow('Compressed layer digest mismatch')
  })

  it('rejects uncompressed content that does not match the config diff ID', async () => {
    await expect(inspectFixture(true, 'diff')).rejects.toThrow('Uncompressed diff ID mismatch')
  })
})
