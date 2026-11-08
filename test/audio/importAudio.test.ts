import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { importAudioAsset, importIdempotencyKey, sniffAudioFormat, validateImportAudio, MAX_IMPORT_AUDIO_BYTES } from '~~/server/utils/audio/importAudio'
import type { ImportAudioDeps, ImportAudioInput } from '~~/server/utils/audio/importAudio'

const wav = new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVEfmt '), 1, 2, 3, 4])
const mp3 = new Uint8Array([...Buffer.from('ID3'), 4, 0, 0, 0, 0, 0, 0])
const m4a = new Uint8Array([0, 0, 0, 0x20, ...Buffer.from('ftypM4A '), 0, 0])
const projectId = '00000000-0000-4000-8000-000000000001'

function input(overrides: Partial<ImportAudioInput> = {}): ImportAudioInput {
  return {
    projectId,
    projectClientId: null,
    actorId: '00000000-0000-4000-8000-0000000000aa',
    role: 'music',
    title: null,
    filename: 'tone.wav',
    declaredType: 'audio/wav',
    bytes: wav,
    rightsConfirmed: true,
    idempotencyKey: 'import-key-0001',
    assetId: '00000000-0000-4000-8000-0000000000bb',
    ...overrides
  }
}

function deps(overrides: Partial<ImportAudioDeps> = {}) {
  const calls: Record<string, unknown[]> = {}
  const base: ImportAudioDeps = {
    upload: vi.fn(async (...a) => {
      calls.upload = a
    }),
    metadata: vi.fn(async () => ({ size: wav.length, etag: '"etag-1"' })),
    probe: vi.fn(async () => ({ kind: 'audio' as const, durationSeconds: 30 })),
    findByIdempotencyKey: vi.fn(async () => null),
    insert: vi.fn(async (params: unknown[]) => {
      calls.insert = params
      return { id: params[0], source: 'imported' }
    })
  }
  return { d: { ...base, ...overrides }, calls }
}

describe('sniffAudioFormat', () => {
  it('detects formats from bytes, not names', () => {
    expect(sniffAudioFormat(wav)).toBe('wav')
    expect(sniffAudioFormat(mp3)).toBe('mp3')
    expect(sniffAudioFormat(new Uint8Array([0xFF, 0xFB, 0x90, 0]))).toBe('mp3')
    expect(sniffAudioFormat(m4a)).toBe('m4a')
    expect(sniffAudioFormat(new Uint8Array(Buffer.from('<html>not audio')))).toBeNull()
  })
})

describe('validateImportAudio', () => {
  it('requires rights, a role, an idempotency key and matching content', () => {
    expect(() => validateImportAudio(input({ rightsConfirmed: false }))).toThrow(/rights/)
    expect(() => validateImportAudio(input({ role: 'sfx' as never }))).toThrow(/role/)
    expect(() => validateImportAudio(input({ idempotencyKey: 'x' }))).toThrow(/Idempotency-Key/)
    expect(() => validateImportAudio(input({ declaredType: 'video/mp4' }))).toThrow(/Unsupported audio type/)
    expect(() => validateImportAudio(input({ declaredType: 'audio/mpeg' }))).toThrow(/do not match/)
    expect(() => validateImportAudio(input({ bytes: new Uint8Array(0) }))).toThrow(/empty/)
    expect(() => validateImportAudio(input({ bytes: new Uint8Array(MAX_IMPORT_AUDIO_BYTES + 1) }))).toThrow(/limit/)
  })
  it('returns the sniffed format and byte hash', () => {
    expect(validateImportAudio(input())).toEqual({ format: 'wav', sha256: createHash('sha256').update(wav).digest('hex') })
  })
})

describe('importAudioAsset', () => {
  it('stores at the canonical master key, measures, and inserts provenance', async () => {
    const { d, calls } = deps()
    const result = await importAudioAsset(input(), d)
    expect(result.replayed).toBe(false)
    expect(calls.upload![1]).toBe('audio/org/00000000-0000-4000-8000-0000000000bb/master.wav')
    expect(calls.upload![2]).toBe('audio/wav')
    expect(d.probe).toHaveBeenCalledWith({ r2Key: 'audio/org/00000000-0000-4000-8000-0000000000bb/master.wav', expectedEtag: 'etag-1', expectedSize: wav.length })
    expect(calls.insert).toEqual([
      '00000000-0000-4000-8000-0000000000bb', null, '00000000-0000-4000-8000-0000000000aa', 'music', 'tone.wav',
      'audio/org/00000000-0000-4000-8000-0000000000bb/master.wav', 30, 'wav', importIdempotencyKey(projectId, 'import-key-0001'),
      'tone.wav', 'audio/wav', createHash('sha256').update(wav).digest('hex'), wav.length, projectId, '00000000-0000-4000-8000-0000000000aa'
    ])
  })
  it('rejects unmeasurable or non-audio media and unverified storage without inserting', async () => {
    const failingProbe = vi.fn(async () => {
      throw new Error('probe')
    })
    for (const probe of [failingProbe, vi.fn(async () => ({ kind: 'video' as const, durationSeconds: 3, width: 1, height: 1 }))]) {
      const { d } = deps({ probe })
      await expect(importAudioAsset(input(), d)).rejects.toMatchObject({ statusCode: 422 })
      expect(d.insert).not.toHaveBeenCalled()
    }
    const { d } = deps({ metadata: vi.fn(async () => ({ size: 1, etag: '"e"' })) })
    await expect(importAudioAsset(input(), d)).rejects.toMatchObject({ statusCode: 502 })
    expect(d.insert).not.toHaveBeenCalled()
  })
  it('replays an identical import and refuses a different file under the same key', async () => {
    const sha = createHash('sha256').update(wav).digest('hex')
    const same = deps({ findByIdempotencyKey: vi.fn(async () => ({ source: 'imported', source_sha256: sha, source_project_id: projectId })) })
    expect((await importAudioAsset(input(), same.d)).replayed).toBe(true)
    expect(same.d.upload).not.toHaveBeenCalled()
    const other = deps({ findByIdempotencyKey: vi.fn(async () => ({ source: 'imported', source_sha256: 'f'.repeat(64), source_project_id: projectId })) })
    await expect(importAudioAsset(input(), other.d)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('turns a concurrent unique-key loss into a replay of the matching winner', async () => {
    const sha = createHash('sha256').update(wav).digest('hex')
    const find = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ source: 'imported', source_sha256: sha, source_project_id: projectId, id: 'winner' })
    const duplicate = vi.fn(async () => {
      throw Object.assign(new Error('dup'), { code: '23505' })
    })
    const { d } = deps({ findByIdempotencyKey: find, insert: duplicate })
    expect(await importAudioAsset(input(), d)).toEqual({ row: { source: 'imported', source_sha256: sha, source_project_id: projectId, id: 'winner' }, replayed: true })
  })
})
