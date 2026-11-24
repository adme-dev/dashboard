import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { transformAudio } from '../../scripts/thebrief/audio-transforms.mjs'

it('keeps the complete soundtrack and reproduces the authored end fade', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'thebrief-fade-test-'))
  try {
    const source = join(directory, 'original.mp3')
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:a', 'libmp3lame', source])
    const bytes = await readFile(source)
    const output = await transformAudio(bytes, { duration: 3, fadeIn: 0, fadeOut: 1 })
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-f', 'mp3', '-i', 'pipe:0', '-f', 'f32le', '-ac', '1', '-ar', '8000', 'pipe:1'], { input: output })
    const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)
    const rms = (from: number, end: number) => {
      const section = samples.slice(Math.round(from * 8000), Math.round(end * 8000))
      return Math.sqrt(section.reduce((sum, value) => sum + value * value, 0) / section.length)
    }
    expect(samples.length / 8000).toBeCloseTo(3, 1)
    expect(rms(1, 1.2)).toBeGreaterThan(0.05)
    expect(rms(2.9, 2.99)).toBeLessThan(rms(1, 1.2) * 0.1)
    expect(await readFile(source)).toEqual(bytes)
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 20000)
