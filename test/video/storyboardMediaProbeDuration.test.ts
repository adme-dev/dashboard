import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { probeMediaBytes } from '../../workers/audio-jobs/container/mediaProbe.mjs'

const decoder = vi.hoisted(() => ({
  chunks: [] as Buffer[],
  repeats: 1,
  stderr: '',
  code: 0,
  killed: false
}))
vi.mock('node:child_process', () => ({
  spawn: vi.fn((command: string) => {
    const proc = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(() => { decoder.killed = true })
    })
    setImmediate(() => {
      if (command === 'ffprobe') {
        // Deliberately false metadata must not determine decoded duration.
        proc.stdout.emit('data', Buffer.from(JSON.stringify({
          streams: [{ codec_type: 'audio', duration: '999', sample_rate: '44100' }],
          format: { format_name: 'wav', duration: '999' }
        })))
      } else {
        for (let i = 0; i < decoder.repeats && !decoder.killed; i++) {
          for (const chunk of decoder.chunks) proc.stdout.emit('data', chunk)
        }
        if (decoder.stderr) proc.stderr.emit('data', Buffer.from(decoder.stderr))
      }
      proc.emit('close', command === 'ffprobe' ? 0 : decoder.code)
    })
    return proc
  })
}))

beforeEach(() => {
  decoder.chunks = [Buffer.alloc(48000)]
  decoder.repeats = 1
  decoder.stderr = ''
  decoder.code = 0
  decoder.killed = false
})

describe('bounded decoded PCM duration', () => {
  it('counts complete samples across arbitrary chunk boundaries, ignoring metadata duration', async () => {
    decoder.chunks = [Buffer.alloc(1), Buffer.alloc(47998), Buffer.alloc(1)]
    expect(await probeMediaBytes(Buffer.from('fixture'))).toEqual({ kind: 'audio', durationSeconds: 0.5 })
  })

  it.each([0, 1, 47999])('rejects an empty or partial PCM sample (%i bytes)', async (bytes) => {
    decoder.chunks = [Buffer.alloc(bytes)]
    await expect(probeMediaBytes(Buffer.from('fixture'))).rejects.toThrow()
  })

  it('kills decoded output exceeding one hour without accumulating the PCM payload', async () => {
    // Reuse a bounded buffer to simulate a compressed input expanding past the cap.
    decoder.chunks = [Buffer.alloc(96000)]
    decoder.repeats = 3601
    await expect(probeMediaBytes(Buffer.from('fixture'))).rejects.toThrow('Media decode failed')
    expect(decoder.killed).toBe(true)
  })

  it('rejects decoder stderr even when it emitted a complete half-second of PCM', async () => {
    decoder.stderr = 'Invalid data found when processing input'
    await expect(probeMediaBytes(Buffer.from('fixture'))).rejects.toThrow('Media decode failed')
  })

  it('rejects a nonzero decoder exit after partial success', async () => {
    decoder.code = 1
    await expect(probeMediaBytes(Buffer.from('fixture'))).rejects.toThrow('Media decode failed')
  })
})
