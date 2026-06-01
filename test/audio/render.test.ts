import { describe, it, expect } from 'vitest'
import { profileFor, DEFAULT_PROFILES } from '~~/server/utils/audio/profiles'
import {
  buildVariantKey, buildMeasurePassArgs, parseLoudnormJson, buildRenderPassArgs
} from '~~/server/utils/audio/render'

describe('profileFor', () => {
  it('returns the default profile for a known channel', () => {
    expect(profileFor('tiktok')).toEqual(DEFAULT_PROFILES.tiktok)
    expect(profileFor('radio')?.lufs).toBe(-24)
    expect(profileFor('meta')?.lufs).toBe(-14)
  })
  it('returns null for an unknown channel', () => {
    expect(profileFor('podcast')).toBeNull()
  })
  it('applies overrides (e.g. a network-specific radio LUFS) without mutating the default', () => {
    const custom = profileFor('radio', { lufs: -23 })
    expect(custom?.lufs).toBe(-23)
    expect(DEFAULT_PROFILES.radio.lufs).toBe(-24) // default untouched
  })
})

describe('buildVariantKey', () => {
  it('sits beside the master, namespaced by client/channel', () => {
    expect(buildVariantKey('c1', 'a1', 'tiktok', 'mp3')).toBe('audio/c1/a1/tiktok.mp3')
    expect(buildVariantKey(null, 'a1', 'radio', 'wav')).toBe('audio/org/a1/radio.wav')
  })
})

describe('buildMeasurePassArgs', () => {
  it('measures with json output and writes no file', () => {
    const args = buildMeasurePassArgs('in.mp3', DEFAULT_PROFILES.tiktok).join(' ')
    expect(args).toContain('loudnorm=I=-14:TP=-1:LRA=11:print_format=json')
    expect(args).toContain('-f null')
    expect(args).toContain('-i in.mp3')
  })
})

describe('parseLoudnormJson', () => {
  const valid = `Parsed_loudnorm ... {
    "input_i" : "-19.5", "input_tp" : "-3.2", "input_lra" : "5.1",
    "input_thresh" : "-30.0", "target_offset" : "0.5"
  }
  [out#0] done`
  it('extracts measured values from the stderr block', () => {
    const m = parseLoudnormJson(valid)
    expect(m?.input_i).toBe('-19.5')
    expect(m?.target_offset).toBe('0.5')
  })
  it('returns null on absent or malformed json', () => {
    expect(parseLoudnormJson('no json here')).toBeNull()
    expect(parseLoudnormJson('{ broken')).toBeNull()
  })
})

describe('buildRenderPassArgs', () => {
  const measured = { input_i: '-19.5', input_tp: '-3.2', input_lra: '5.1', input_thresh: '-30.0', target_offset: '0.5' }

  it('does a linear 2-pass normalize when measured values are present', () => {
    const args = buildRenderPassArgs('in.mp3', 'out.mp3', DEFAULT_PROFILES.tiktok, measured).join(' ')
    expect(args).toContain('measured_I=-19.5')
    expect(args).toContain('measured_TP=-3.2')
    expect(args).toContain('linear=true')
  })
  it('falls back to dynamic single-pass when measured is null', () => {
    const args = buildRenderPassArgs('in.mp3', 'out.mp3', DEFAULT_PROFILES.meta, null).join(' ')
    expect(args).toContain('loudnorm=I=-14:TP=-1:LRA=11')
    expect(args).not.toContain('measured_I')
    expect(args).not.toContain('linear=true')
  })
  it('trims to maxDurationSec and fades for social cutdowns', () => {
    const args = buildRenderPassArgs('in.mp3', 'out.mp3', DEFAULT_PROFILES.tiktok, measured)
    const joined = args.join(' ')
    expect(joined).toContain('afade=t=out:st=59.5:d=0.5') // 60 - 0.5
    // -t 60 trim present as an arg pair
    const ti = args.indexOf('-t')
    expect(ti).toBeGreaterThan(-1)
    expect(args[ti + 1]).toBe('60')
  })
  it('encodes mp3 vs wav per the profile', () => {
    expect(buildRenderPassArgs('i', 'o.mp3', DEFAULT_PROFILES.tiktok, null).join(' ')).toContain('libmp3lame')
    expect(buildRenderPassArgs('i', 'o.wav', DEFAULT_PROFILES.radio, null).join(' ')).toContain('pcm_s16le')
  })
})
