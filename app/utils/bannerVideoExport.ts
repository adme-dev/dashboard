import { apiErrorStatus } from '~/utils/apiError'

interface BannerVideoExportSessionOptions {
  nextKey?: () => string
}

function nextBannerVideoExportKey(): string {
  return `banner-render:${globalThis.crypto.randomUUID()}`
}

export function createBannerVideoExportSession(options: BannerVideoExportSessionOptions = {}) {
  const nextKey = options.nextKey ?? nextBannerVideoExportKey
  let key = nextKey()

  return {
    async attempt<T>(send: (headers: Record<string, string>) => Promise<T>): Promise<T> {
      try {
        const value = await send({ 'Idempotency-Key': key })
        key = nextKey()
        return value
      } catch (error: unknown) {
        const status = apiErrorStatus(error)
        if (status === 400 || status === 422 || status === 428) key = nextKey()
        throw error
      }
    }
  }
}
