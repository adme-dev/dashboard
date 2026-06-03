import { describe, expect, it } from 'vitest'
import { audioProgressPercent, audioTimeFromProgress, formatAudioTime, mediaElementDuration, resolveAudioDuration } from '~/app/utils/audio/playback'

describe('audio playback helpers', () => {
  it('formats finite audio times as mm:ss or hh:mm:ss', () => {
    expect(formatAudioTime(0)).toBe('00:00')
    expect(formatAudioTime(9.8)).toBe('00:09')
    expect(formatAudioTime(65)).toBe('01:05')
    expect(formatAudioTime(3661)).toBe('01:01:01')
  })

  it('treats non-finite or negative times as zero', () => {
    expect(formatAudioTime(Number.NaN)).toBe('00:00')
    expect(formatAudioTime(Number.POSITIVE_INFINITY)).toBe('00:00')
    expect(formatAudioTime(-12)).toBe('00:00')
  })

  it('uses native duration first and falls back to asset duration metadata', () => {
    expect(resolveAudioDuration(344.2, 120)).toBe(344.2)
    expect(resolveAudioDuration(Number.NaN, 120)).toBe(120)
    expect(resolveAudioDuration(0, 120)).toBe(120)
    expect(resolveAudioDuration(Number.NaN, null)).toBe(0)
  })

  it('uses seekable or buffered media ranges when native duration is unavailable', () => {
    expect(mediaElementDuration({
      duration: Number.POSITIVE_INFINITY,
      seekable: { length: 1, end: () => 344.2 },
      buffered: { length: 0, end: () => 0 },
    }, null)).toBe(344.2)
    expect(mediaElementDuration({
      duration: Number.NaN,
      seekable: { length: 0, end: () => 0 },
      buffered: { length: 1, end: () => 12.5 },
    }, null)).toBe(12.5)
    expect(mediaElementDuration({
      duration: Number.NaN,
      seekable: { length: 0, end: () => 0 },
      buffered: { length: 0, end: () => 0 },
    }, 90)).toBe(90)
  })

  it('converts between current time and slider percentage safely', () => {
    expect(audioProgressPercent(10, 100)).toBe(10)
    expect(audioProgressPercent(150, 100)).toBe(100)
    expect(audioProgressPercent(10, 0)).toBe(0)
    expect(audioTimeFromProgress(25, 200)).toBe(50)
    expect(audioTimeFromProgress(125, 200)).toBe(200)
    expect(audioTimeFromProgress(25, 0)).toBe(0)
  })
})
