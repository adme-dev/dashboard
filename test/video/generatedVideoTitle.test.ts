import { describe, expect, it } from 'vitest'
import { generatedVideoTitle } from '~~/server/utils/video-generation/finalize'
import { displayVideoAssetTitle } from '~~/app/utils/video/videoStudioAssets'

const JOB = '6a9b4c63-49b5-4463-9d7a-1f3f9d2a0c11'

describe('generated asset titles', () => {
  it('titles a finalized asset from the first clause of its prompt', () => {
    expect(generatedVideoTitle('Round 6 acceptance run. Hold the supplied approved still.', JOB))
      .toBe('AI · Round 6 acceptance run.')
    expect(generatedVideoTitle('Subtle parallax push-in on the vehicle, gentle and slow', JOB))
      .toBe('AI · Subtle parallax push-in on the vehicle')
  })

  it('truncates long clauses and never emits a bare UUID', () => {
    const long = 'A'.repeat(80)
    expect(generatedVideoTitle(long, JOB)).toBe(`AI · ${'A'.repeat(57)}…`)
    expect(generatedVideoTitle('', JOB)).toBe('Generated video 6a9b4c63')
    expect(generatedVideoTitle(null, JOB)).not.toContain(JOB)
  })

  it('rewrites legacy UUID-titled library rows from their prompt', () => {
    expect(displayVideoAssetTitle({ title: `Generated video ${JOB}`, generationPrompt: 'Showroom walkaround, dealer style' }))
      .toBe('AI · Showroom walkaround')
    expect(displayVideoAssetTitle({ title: `Generated video ${JOB}`, generationPrompt: null, r2Key: 'k' }))
      .toBe(`Generated video ${JOB}`)
    expect(displayVideoAssetTitle({ title: 'Hero cut v2', generationPrompt: 'ignored' })).toBe('Hero cut v2')
    expect(displayVideoAssetTitle({ title: '', r2Key: null })).toBe('Untitled video')
  })
})
