import { describe, expect, it } from 'vitest'
import { assertStoryboardOutputs, assertStoryboardCallbackSecret, assertSelfContainedStoryboardHtml } from '~~/server/utils/video-storyboard/renderDispatch'

const projectId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'
const attempt = '33333333-3333-4333-8333-333333333333'
const manifest = { projectId, jobId, formats: ['square_1x1'] }
describe('storyboard publication boundary', () => {
  it('requires configured matching authentication', () => {
    expect(() => assertStoryboardCallbackSecret(undefined, 'Bearer token')).toThrow()
    expect(() => assertStoryboardCallbackSecret('token', 'Bearer other')).toThrow()
    expect(() => assertStoryboardCallbackSecret('token', 'Bearer token')).not.toThrow()
  })
  it('accepts only the exact format set and job scoped attempt outputs', () => {
    expect(() => assertStoryboardOutputs(manifest, { square_1x1: `media/${projectId}/${jobId}/${attempt}/square_1x1.mp4` })).not.toThrow()
    for (const variants of [{}, { reels_9x16: `media/${projectId}/${jobId}/${attempt}/square_1x1.mp4` }, { square_1x1: `media/other/${jobId}/${attempt}/square_1x1.mp4` }, { square_1x1: `media/${projectId}/${jobId}/../square_1x1.mp4` }]) expect(() => assertStoryboardOutputs(manifest, variants)).toThrow()
  })
})

it('blocks remote or active overlay dependencies instead of rendering mutable resources', () => {
  expect(() => assertSelfContainedStoryboardHtml('<style>.copy{font-family:Arial}</style><div>Exact copy</div>')).not.toThrow()
  for (const html of ['<script>alert(1)</script>', '<img src="https://remote.example/image">', '<style>@font-face{src:url(https://remote.example/font)}</style>', '<link href="https://remote.example/css">']) expect(() => assertSelfContainedStoryboardHtml(html)).toThrow()
})
