// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mediaUploadForm, mediaUploadKind, pictureNeedsPoster, posterTimeSec } from '~~/app/utils/video/mediaUploadPreview'

const file = (name: string, type: string) => new File([new Uint8Array([1, 2, 3])], name, { type })

describe('media upload preview', () => {
  it('takes the preview frame a little way in, never past the middle of a short clip', () => {
    expect(posterTimeSec(30)).toBe(1)
    expect(posterTimeSec(0.8)).toBeCloseTo(0.4)
    expect(posterTimeSec(0)).toBe(0)
    expect(posterTimeSec(Number.NaN)).toBe(0)
    expect(posterTimeSec(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('sends a JPEG frame only for pictures the tools cannot read as they are', () => {
    expect(pictureNeedsPoster('image/png')).toBe(false)
    expect(pictureNeedsPoster('image/jpeg')).toBe(false)
    expect(pictureNeedsPoster('image/webp')).toBe(true)
  })

  it('tells pictures from clips by type and refuses anything else', () => {
    expect(mediaUploadKind(file('a.png', 'image/png'))).toBe('still')
    expect(mediaUploadKind(file('a.webp', 'image/webp'))).toBe('still')
    expect(mediaUploadKind(file('a.mov', 'video/quicktime'))).toBe('footage')
    expect(mediaUploadKind(file('a.pdf', 'application/pdf'))).toBeNull()
    expect(mediaUploadKind(file('a.gif', 'image/gif'))).toBeNull()
  })

  it('builds the upload body with the size, length and frame it has, and omits what it lacks', () => {
    const poster = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })
    const full = mediaUploadForm(file('clip.mp4', 'video/mp4'), 'footage', { width: 1280, height: 720, durationSec: 12.5, poster })
    expect(full.get('kind')).toBe('footage')
    expect(full.get('width')).toBe('1280')
    expect(full.get('height')).toBe('720')
    expect(full.get('durationSec')).toBe('12.5')
    expect((full.get('poster') as File).type).toBe('image/jpeg')
    expect((full.get('file') as File).name).toBe('clip.mp4')

    const bare = mediaUploadForm(file('a.png', 'image/png'), 'still', { width: null, height: 1080, durationSec: null, poster: null })
    expect([...bare.keys()].sort()).toEqual(['file', 'kind'])
  })
})
