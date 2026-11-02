import { afterEach, expect, it } from 'vitest'
import { BANNER_MEDIA_DRAG_TYPE, endBannerMediaDrag, startBannerMediaDrag, takeBannerMediaDrag } from '../../app/utils/banner-media-drag'

afterEach(endBannerMediaDrag)

it('accepts a selected asset once and rejects external URLs and another project', () => {
  const data = new Map<string, string>()
  const event = { dataTransfer: { setData: (type: string, value: string) => data.set(type, value), effectAllowed: '' } } as unknown as DragEvent
  const source = { kind: 'motorstack' as const, brandId: 'subaru', model: 'BRZ', assetId: 'a'.repeat(64) }
  expect(takeBannerMediaDrag('https://untrusted.test/car.png', 'project-a')).toBeNull()
  startBannerMediaDrag(event, source, 'project-a')
  expect(takeBannerMediaDrag(data.get(BANNER_MEDIA_DRAG_TYPE)!, 'project-b')).toBeNull()
  startBannerMediaDrag(event, source, 'project-a')
  const token = data.get(BANNER_MEDIA_DRAG_TYPE)!
  expect(takeBannerMediaDrag(token, 'project-a')).toEqual(source)
  expect(takeBannerMediaDrag(token, 'project-a')).toBeNull()
})
