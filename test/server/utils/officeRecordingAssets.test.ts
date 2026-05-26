import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetPublicUrl = vi.fn()
const mockGetPresignedDownloadUrl = vi.fn()
const mockIsStorageConfigured = vi.fn()

vi.mock('~~/server/utils/storage', () => ({
  getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
  getPresignedDownloadUrl: (...args: unknown[]) => mockGetPresignedDownloadUrl(...args),
  isStorageConfigured: (...args: unknown[]) => mockIsStorageConfigured(...args)
}))

const { resolveOfficeRecordingAssetUrl } = await import('../../../server/utils/officeRecordingAssets')

describe('office recording asset URLs', () => {
  beforeEach(() => {
    mockGetPublicUrl.mockReset()
    mockGetPresignedDownloadUrl.mockReset()
    mockIsStorageConfigured.mockReset()
    mockGetPublicUrl.mockReturnValue(null)
    mockGetPresignedDownloadUrl.mockResolvedValue('https://signed.example.com/recording.webm')
    mockIsStorageConfigured.mockReturnValue(false)
  })

  it('allows absolute http and https asset URLs', async () => {
    await expect(resolveOfficeRecordingAssetUrl('https://cdn.example.com/recording.webm')).resolves.toBe('https://cdn.example.com/recording.webm')
    await expect(resolveOfficeRecordingAssetUrl('http://localhost:3000/api/_uploads/recording.webm')).resolves.toBe('http://localhost:3000/api/_uploads/recording.webm')
  })

  it('uses a configured public storage URL for storage keys', async () => {
    mockGetPublicUrl.mockReturnValueOnce('https://cdn.example.com/office-recordings/recording.webm')

    await expect(resolveOfficeRecordingAssetUrl('office-recordings/recording.webm')).resolves.toBe('https://cdn.example.com/office-recordings/recording.webm')
    expect(mockGetPresignedDownloadUrl).not.toHaveBeenCalled()
  })

  it('falls back to signed storage URLs when private storage is configured', async () => {
    mockIsStorageConfigured.mockReturnValueOnce(true)

    await expect(resolveOfficeRecordingAssetUrl('office-recordings/recording.webm')).resolves.toBe('https://signed.example.com/recording.webm')
    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith('office-recordings/recording.webm', 3600)
  })

  it('falls back to the local upload route in dev', async () => {
    await expect(resolveOfficeRecordingAssetUrl('office-recordings/recording file.webm')).resolves.toBe('/api/_uploads/office-recordings/recording%20file.webm')
  })

  it('rejects unsafe storage keys', async () => {
    await expect(resolveOfficeRecordingAssetUrl('../secret.webm')).resolves.toBeNull()
    await expect(resolveOfficeRecordingAssetUrl('/etc/passwd')).resolves.toBeNull()
    await expect(resolveOfficeRecordingAssetUrl('javascript:alert(1)')).resolves.toBeNull()
  })
})
