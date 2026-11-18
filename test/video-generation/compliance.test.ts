import { describe, expect, it } from 'vitest'
import { evaluateVideoGenerationCompliance } from '~~/server/utils/video-generation/compliance'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'
import type { VideoGenerationTenantPolicy } from '~~/server/utils/video-generation/types'

const tenantPolicy: VideoGenerationTenantPolicy = {
  enabled: true,
  monthlyCapCents: 10_000,
  allowedModelIds: ['mock/i2v-safe', 'mock/t2v-broll'],
}

const provenance = {
  userId: '00000000-0000-4000-8000-000000000001',
  tenantId: 'tenant-1',
  projectId: '00000000-0000-4000-8000-000000000002',
  idempotencyKey: 'idem-1',
}

describe('video generation compliance', () => {
  it('blocks vehicle text-to-video', () => {
    const model = getVideoGenerationModel('mock/t2v-broll')!

    const result = evaluateVideoGenerationCompliance({
      mode: 'text-to-video',
      prompt: 'Toyota Hilux driving through the dealership',
      model,
      sourceAssets: [],
      requestedSubjectType: 'vehicle',
      tenantPolicy,
      provenance,
    })

    expect(result.allowed).toBe(false)
    expect(result.classification).toBe('blocked_vehicle_t2v')
  })

  it('blocks vehicle-like prompts when subject type is unknown', () => {
    const model = getVideoGenerationModel('mock/t2v-broll')!

    const result = evaluateVideoGenerationCompliance({
      mode: 'text-to-video',
      prompt: 'Show a new demonstrator with shiny badge and grille',
      model,
      sourceAssets: [],
      requestedSubjectType: 'unknown',
      tenantPolicy,
      provenance,
    })

    expect(result.allowed).toBe(false)
    expect(result.classification).toBe('blocked_vehicle_t2v')
  })

  it('blocks a start/end-frame vehicle job when either frame is unapproved', () => {
    const model = getVideoGenerationModel('mock/i2v-safe')!
    const base = { mode: 'image-to-video' as const, prompt: 'reveal from front three-quarter to rear', model, requestedSubjectType: 'vehicle' as const, tenantPolicy, provenance }

    for (const sourceAssets of [
      [{ id: 'start', approved: true, subjectType: 'vehicle' as const }, { id: 'end', approved: false, subjectType: 'vehicle' as const }],
      [{ id: 'start', approved: false, subjectType: 'vehicle' as const }, { id: 'end', approved: true, subjectType: 'vehicle' as const }]
    ]) {
      const result = evaluateVideoGenerationCompliance({ ...base, sourceAssets })
      expect(result.allowed).toBe(false)
      expect(result.classification).toBe('missing_approved_asset')
    }

    const both = evaluateVideoGenerationCompliance({ ...base, sourceAssets: [
      { id: 'start', approved: true, subjectType: 'vehicle' }, { id: 'end', approved: true, subjectType: 'vehicle' }
    ] })
    expect(both).toMatchObject({ allowed: true, classification: 'vehicle_i2v' })
  })

  it('allows approved vehicle image-to-video', () => {
    const model = getVideoGenerationModel('mock/i2v-safe')!

    const result = evaluateVideoGenerationCompliance({
      mode: 'image-to-video',
      prompt: 'subtle parallax showroom reveal',
      model,
      sourceAssets: [{ id: 'asset-1', approved: true, subjectType: 'vehicle' }],
      requestedSubjectType: 'vehicle',
      tenantPolicy,
      provenance,
    })

    expect(result.allowed).toBe(true)
    expect(result.classification).toBe('vehicle_i2v')
  })

  it('allows vehicle image-to-video with an approved source asset of any subject type', () => {
    const model = getVideoGenerationModel('mock/i2v-safe')!

    const result = evaluateVideoGenerationCompliance({
      mode: 'image-to-video',
      prompt: 'make it look like the vehicle is moving through sand',
      model,
      sourceAssets: [{ id: 'asset-1', approved: true, subjectType: 'unknown' }],
      requestedSubjectType: 'vehicle',
      tenantPolicy,
      provenance,
    })

    expect(result.allowed).toBe(true)
    expect(result.classification).toBe('vehicle_i2v')
  })

  it('floors the classification on the asset subjectType: a benign prompt rewrite cannot soften a vehicle job', () => {
    const model = getVideoGenerationModel('mock/i2v-safe')!

    const result = evaluateVideoGenerationCompliance({
      mode: 'image-to-video',
      prompt: 'gentle cinematic parallax over the hero image',
      model,
      sourceAssets: [{ id: 'asset-1', approved: true, subjectType: 'vehicle' }],
      requestedSubjectType: 'unknown',
      tenantPolicy,
      provenance,
    })

    expect(result.allowed).toBe(true)
    expect(result.classification).toBe('vehicle_i2v')
    expect(result.reasons.join(' ')).toContain('registered as a vehicle')
  })

  it('blocks vehicle image-to-video without an approved source asset', () => {
    const model = getVideoGenerationModel('mock/i2v-safe')!

    const result = evaluateVideoGenerationCompliance({
      mode: 'image-to-video',
      prompt: 'subtle parallax showroom reveal',
      model,
      sourceAssets: [{ id: 'asset-1', approved: false, subjectType: 'vehicle' }],
      requestedSubjectType: 'vehicle',
      tenantPolicy,
      provenance,
    })

    expect(result.allowed).toBe(false)
    expect(result.classification).toBe('missing_approved_asset')
  })
})
