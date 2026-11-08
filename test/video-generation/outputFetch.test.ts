import { describe, expect, it, vi } from 'vitest'
import { downloadGeneratedVideoOutput } from '~~/server/utils/video-generation/outputDownload'

const bytes = new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0])
const publicDns = { resolve4: async () => ['8.8.8.8'], resolve6: async () => [] }

describe('generated output fetch boundary', () => {
  it.each(['http://example.com/out.mp4', 'https://localhost/out.mp4', 'https://127.0.0.1/out.mp4', 'https://[::1]/out.mp4', 'https://user:secret@example.com/out.mp4', 'https://example.com:8443/out.mp4'])('rejects unsafe output destination %s before fetching', async (url) => {
    const fetchImpl = vi.fn()
    await expect(downloadGeneratedVideoOutput(url, fetchImpl, publicDns)).rejects.toThrow('safely downloaded')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a hostname resolving to any private address', async () => {
    const fetchImpl = vi.fn()
    await expect(downloadGeneratedVideoOutput('https://cdn.example.com/out.mp4', fetchImpl, {
      resolve4: async () => ['8.8.8.8', '10.0.0.1'], resolve6: async () => []
    })).rejects.toThrow('safely downloaded')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not follow a redirect after public DNS validation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.redirect('https://127.0.0.1/private?secret=hidden', 302))
    await expect(downloadGeneratedVideoOutput('https://cdn.example.com/out.mp4', fetchImpl, publicDns)).rejects.toThrow('safely downloaded')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('https://cdn.example.com/out.mp4', expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) }))
  })

  it('returns bounded validated bytes after public DNS resolution', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(bytes, { headers: { 'content-type': 'video/mp4' } }))
    expect(await downloadGeneratedVideoOutput('https://cdn.example.com/out.mp4', fetchImpl, publicDns)).toEqual(bytes)
  })
})
