import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { probeMediaBytes } from '../../workers/audio-jobs/container/mediaProbe.mjs'

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'probe-test-'))
  for (const command of ['ffmpeg', 'ffprobe']) {
    try {
      execFileSync(command, ['-version'], { stdio: 'pipe', timeout: 5000 })
    } catch (cause) {
      throw new Error(
        `Real media decode tests require ${command} on PATH. Install the FFmpeg package (Ubuntu: sudo apt-get install ffmpeg; macOS: brew install ffmpeg).`,
        { cause }
      )
    }
  }
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))
function fixture(name: string, args: string[]) {
  const path = join(dir, name)
  execFileSync('ffmpeg', ['-v', 'error', ...args, '-y', path])
  return readFileSync(path)
}
describe('decoded media facts (local FFmpeg)', () => {
  it('measures video duration and dimensions from actual bytes', async () => {
    const bytes = fixture('video.mp4', [
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=32x24:r=25',
      '-t',
      '1.2',
      '-c:v',
      'mpeg4'
    ])
    const result = await probeMediaBytes(bytes)
    expect(result.kind).toBe('video')
    expect(result.width).toBe(32)
    expect(result.height).toBe(24)
    expect(result.durationSeconds).toBeCloseTo(1.2, 1)
  })
  it('measures audio and still image bytes', async () => {
    const audio = fixture('audio.wav', [
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440',
      '-t',
      '0.5'
    ])
    expect(await probeMediaBytes(audio)).toMatchObject({
      kind: 'audio',
      durationSeconds: 0.5
    })
    const png = fixture('still.png', [
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=32x24',
      '-frames:v',
      '1'
    ])
    expect(await probeMediaBytes(png)).toEqual({
      kind: 'image',
      durationSeconds: null,
      width: 32,
      height: 24
    })
  })
  it('fails closed on corrupt bytes, playlists, truncation and decoder deadline', async () => {
    await expect(probeMediaBytes(Buffer.from('not media'))).rejects.toThrow()
    await expect(
      probeMediaBytes(
        Buffer.from('#EXTM3U\n#EXTINF:1\nhttp://127.0.0.1/private\n')
      )
    ).rejects.toThrow()
    const bytes = fixture('broken.mp4', [
      '-f',
      'lavfi',
      '-i',
      'color=s=32x24:r=25',
      '-t',
      '1',
      '-c:v',
      'mpeg4'
    ])
    await expect(probeMediaBytes(bytes.subarray(0, 100))).rejects.toThrow()
    await expect(probeMediaBytes(bytes, { timeoutMs: 1 })).rejects.toThrow()
  })
})
