import { describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  boundedLimits,
  containerArguments,
  loadLinuxRuntime,
  cleanupOwnedContainer
} from '../../workers/banner-engine/runtime/render-preview.mjs'

const runtime = {
  imageId: `sha256:${'a'.repeat(64)}`,
  engine: 'photocraft',
  definition: { extension: 'pcraft' }
}
describe('Linux engine isolation policy', () => {
  it('honors smaller requested process, CPU, memory, output and time limits', () => {
    expect(
      boundedLimits({
        limits: {
          cpuCount: 1,
          memoryMb: 256,
          maxProcesses: 8,
          timeoutMs: 500,
          maxLogBytes: 2,
          maxOutputBytes: 1024
        }
      })
    ).toEqual({
      cpuCount: 1,
      memoryMb: 256,
      maxProcesses: 8,
      timeoutMs: 500,
      maxLogBytes: 2,
      maxOutputBytes: 1024
    })
  })
  it('caps permissive requests at trusted runtime maxima', () => {
    expect(
      boundedLimits({
        limits: {
          cpuCount: 8,
          memoryMb: 8192,
          maxProcesses: 999,
          timeoutMs: 300000
        }
      })
    ).toMatchObject({
      cpuCount: 4,
      memoryMb: 2048,
      maxProcesses: 64,
      timeoutMs: 90000
    })
  })
  it('rejects expired or invalid deadlines and invalid limit values', () => {
    for (const deadlineAt of ['invalid', '2000-01-01T00:00:00Z'])
      expect(() => boundedLimits({ deadlineAt })).toThrow()
    for (const cpuCount of [0, -1, NaN, 1.5, Infinity, '4'])
      expect(() => boundedLimits({ limits: { cpuCount } })).toThrow()
  })
  it('uses a single explicit read-only input mount and no output host mount or network', () => {
    const args = containerArguments(
      runtime,
      '/owned/input.native',
      'banner-engine-test',
      boundedLimits()
    )
    expect(args.filter(arg => arg === '--mount')).toHaveLength(1)
    expect(args).toContain(
      'type=bind,src=/owned/input.native,dst=/input/document.pcraft,readonly'
    )
    expect(args[args.indexOf('--network') + 1]).toBe('none')
    expect(args).toContain('--read-only')
    expect(args[args.indexOf('--user') + 1]).toBe('65532:65532')
    expect(args).toContain('no-new-privileges')
    expect(args).toContain('ALL')
    expect(args).not.toContain('--privileged')
    expect(args).not.toContain('--volume')
    expect(args).toContain(runtime.imageId)
  })
  it('prevents mount CSV injection', () => {
    for (const input of [
      '/owned/a,readonly=false',
      '/owned/a\nfile',
      '/owned/a\rfile'
    ])
      expect(() =>
        containerArguments(runtime, input, 'owned', boundedLimits())
      ).toThrow()
  })
  it('rejects unknown engine before reading any runtime manifest', async () => {
    await expect(
      loadLinuxRuntime('effectcraft', '/does-not-exist')
    ).rejects.toThrow('Unsupported Linux engine')
  })
  it('rejects failed or unverified container cleanup', async () => {
    const name = 'banner-engine-aaaa'
    await expect(
      cleanupOwnedContainer(name, async (args: string[]) => {
        if (args[0] === 'rm') throw new Error('daemon refused removal')
        return name
      })
    ).rejects.toThrow('cleanup unverified')
    await expect(cleanupOwnedContainer(name, async () => name)).rejects.toThrow(
      'Owned container remains'
    )
    await expect(
      cleanupOwnedContainer(name, async () => {
        throw new Error('daemon disconnected')
      })
    ).rejects.toThrow('cleanup unverified')
  })
  it('rejects unproven image configurations', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'banner-linux-test-'))
    try {
      const file = join(dir, 'runtime.json')
      await writeFile(
        file,
        JSON.stringify({
          imageId: runtime.imageId,
          engines: {
            photocraft: {
              version: '0.16.0',
              executableSha256:
                '486d0d83d6cdacec3ec76ff6e30e47d5d2c207ad15084631a61902df157e8c8d',
              capabilityProofSha256: 'b'.repeat(64)
            }
          }
        })
      )
      await expect(loadLinuxRuntime('photocraft', file)).rejects.toThrow(
        'no accepted proof'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
