import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildSocialPackagePostMetadata,
  mergeSocialPackageProfile,
  normalizeClientEvidenceInput,
  normalizeSocialContentPackageInput,
} from '~~/server/utils/socialNewsGovernance'

describe('social news governance', () => {
  it('normalizes a reusable package without creating a second budget ledger', () => {
    const value = normalizeSocialContentPackageInput({
      name: 'Automotive thought leadership',
      industry: 'Automotive retail',
      profileDefaults: {
        contentPillars: ['EV education', 'EV education', 'Local community'],
        preferredPlatforms: ['facebook', 'linkedin', 'unknown'],
      },
      commercialScope: {
        includedPostVolumes: { facebook: 8, linkedin: 4, unknown: 99, tiktok: -2 },
        approvalSlaHours: 24,
        overagePolicy: 'quote-before-work',
      },
    })

    expect(value).toMatchObject({
      name: 'Automotive thought leadership',
      profileDefaults: {
        contentPillars: ['EV education', 'Local community'],
        preferredPlatforms: ['facebook', 'linkedin'],
      },
      commercialScope: {
        includedPostVolumes: { facebook: 8, linkedin: 4 },
        approvalSlaHours: 24,
        overagePolicy: 'quote-before-work',
      },
    })
    expect(value.commercialScope).not.toHaveProperty('budgetAmount')
  })

  it('keeps imported discussions pending until XeroFlow review', () => {
    const value = normalizeClientEvidenceInput({
      evidenceType: 'discussion',
      sourceSystem: 'monday',
      title: 'Content direction discussed',
      content: 'Increase regional touring stories.',
      reviewStatus: 'approved',
    })
    expect(value.reviewStatus).toBe('pending')
    expect(value.sourceSystem).toBe('monday')
  })

  it('allows an approved XeroFlow decision to become canonical evidence', () => {
    const value = normalizeClientEvidenceInput({
      evidenceType: 'decision',
      sourceSystem: 'xeroflow',
      title: 'Approved platform mix',
      content: 'Prioritise LinkedIn and Facebook.',
      reviewStatus: 'approved',
    })
    expect(value.reviewStatus).toBe('approved')
  })

  it('tags created posts with the immutable assignment and package version', () => {
    expect(buildSocialPackagePostMetadata({ assignmentId: 'a1', packageVersionId: 'v2' })).toEqual({
      socialPackageAssignmentId: 'a1',
      socialPackageVersionId: 'v2',
    })
    expect(buildSocialPackagePostMetadata(null)).toEqual({})
  })

  it('seeds empty fields from a package while preserving explicit client overrides', () => {
    const merged = mergeSocialPackageProfile(
      { industry: 'Automotive', contentPillars: ['EV education'], preferredPlatforms: ['facebook'], brandVoice: 'Helpful' },
      { industry: '', content_pillars: ['Local community'], preferred_platforms: [], brand_voice: '' },
      'client-1',
    )
    expect(merged).toMatchObject({
      clientId: 'client-1',
      industry: 'Automotive',
      contentPillars: ['Local community'],
      preferredPlatforms: ['facebook'],
      brandVoice: 'Helpful',
    })
  })

  it('keeps published package versions immutable and references the existing finance model', () => {
    const migration = readFileSync('server/database/migrations/251_social_content_governance.sql', 'utf8')
    expect(migration).toContain('prevent_published_social_package_version_mutation')
    expect(migration).toContain('budget_allocation_id UUID REFERENCES job_budget_allocations')
    expect(migration).toContain('rate_card_item_id UUID REFERENCES rate_card_items')
    expect(migration).not.toMatch(/social_content_package_assignments[\s\S]*?budget_amount/i)
  })
})
