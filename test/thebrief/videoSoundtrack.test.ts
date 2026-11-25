import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { extractVideoSoundtrack } from '../../scripts/thebrief/audio-transforms.mjs'

it('extracts the audible stream without changing MP4 bytes and rejects silent video', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'thebrief-video-audio-test-'))
  try {
    const video = join(directory, 'sound.mp4'), silent = join(directory, 'silent.mp4')
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=16x16:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', video])
    execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-an', '-c:v', 'copy', silent])
    const original = readFileSync(video), copy = Buffer.from(original)
    const soundtrack = await extractVideoSoundtrack(original)
    expect(soundtrack.length).toBeGreaterThan(1000)
    expect(original).toEqual(copy)
    await expect(extractVideoSoundtrack(readFileSync(silent))).rejects.toThrow('exactly one bounded embedded soundtrack')
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 15000)
