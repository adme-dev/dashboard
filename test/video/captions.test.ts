import { describe, expect, it } from 'vitest'
import { formatVttTimestamp, transcriptToSingleCueVtt } from '~~/server/utils/video/captions'

describe('video captions', () => {
  it('formats VTT timestamps', () => {
    expect(formatVttTimestamp(0)).toBe('00:00:00.000')
    expect(formatVttTimestamp(65.25)).toBe('00:01:05.250')
    expect(formatVttTimestamp(3661.007)).toBe('01:01:01.007')
  })

  it('converts transcript text into a single-cue VTT', () => {
    expect(transcriptToSingleCueVtt('  First line\n\n\nSecond line  ', 4.5)).toBe([
      'WEBVTT',
      '',
      '00:00:00.000 --> 00:00:04.500',
      'First line\n\nSecond line',
      '',
    ].join('\n'))
  })
})
