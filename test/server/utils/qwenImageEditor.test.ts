import { afterEach, describe, expect, it, vi } from 'vitest'
import { editImageWithAI } from '../../../server/utils/qwenImageEditor'

const base = 'https://qwen-qwen-image-edit-2511.hf.space'
afterEach(() => vi.unstubAllGlobals())

function provider(outputUrl = `${base}/gradio_api/file=/tmp/result.webp`) {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(['/tmp/source.png'])))
    .mockResolvedValueOnce(new Response(JSON.stringify({ event_id: 'event-1' })))
    .mockResolvedValueOnce(new Response(`event: complete\ndata: ${JSON.stringify([[{ image: { url: outputUrl } }], 42])}\n`))
    .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

describe('Qwen image edit provider', () => {
  it('uses the current Gallery image envelope and reads its nested output', async () => {
    const fetcher = provider()
    const result = await editImageWithAI(Buffer.from('image'), 'Recompose', { width: 1152, height: 1440, rewritePrompt: false })
    expect(result?.seed).toBe(42)
    const body = JSON.parse(fetcher.mock.calls[1][1].body)
    expect(body.data[0]).toEqual([{ image: { path: '/tmp/source.png', meta: { _type: 'gradio.FileData' } } }])
    expect(body.data.slice(6)).toEqual([1440, 1152, false])
    expect(fetcher.mock.calls[3][1].redirect).toBe('error')
  })

  it.each(['https://evil.example/result.png', 'http://qwen-qwen-image-edit-2511.hf.space/result.png', 'https://another.hf.space/result.png'])('rejects foreign or insecure output %s', async (url) => {
    const fetcher = provider(url)
    expect(await editImageWithAI(Buffer.from('image'), 'Recompose')).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})
