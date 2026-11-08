import { describe, expect, it } from 'vitest'
import { mp4Dimensions } from '../../workers/video-generation/src/mp4Dimensions'

function box(type: string, body: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(8 + body.length)
  new DataView(bytes.buffer).setUint32(0, bytes.length)
  bytes.set([...type].map(char => char.charCodeAt(0)), 4)
  bytes.set(body, 8)
  return bytes
}
function track(width: number, height: number): Uint8Array {
  const body = new Uint8Array(84)
  const view = new DataView(body.buffer)
  view.setUint32(76, width * 65536)
  view.setUint32(80, height * 65536)
  return box('trak', box('tkhd', body))
}

describe('generated MP4 dimensions', () => {
  it('records actual output framing, including when source framing differs', () => {
    expect(mp4Dimensions(box('moov', track(1280, 720)).buffer as ArrayBuffer))
      .toEqual({ width: 1280, height: 720, aspectRatio: '16:9' })
  })
  it('skips audio tracks with zero dimensions', () => {
    const audio = track(0, 0)
    const video = track(720, 1280)
    const tracks = new Uint8Array(audio.length + video.length)
    tracks.set(audio)
    tracks.set(video, audio.length)
    expect(mp4Dimensions(box('moov', tracks).buffer as ArrayBuffer)?.aspectRatio).toBe('9:16')
  })
  it('rejects truncated or invalid boxes', () => {
    expect(mp4Dimensions(new Uint8Array(4).buffer)).toBeNull()
    const broken = box('moov', track(1280, 720))
    new DataView(broken.buffer).setUint32(0, broken.length + 1)
    expect(mp4Dimensions(broken.buffer as ArrayBuffer)).toBeNull()
  })
})
