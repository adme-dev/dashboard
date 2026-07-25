import { createError } from 'h3'

export const REPO_TOKEN_ENCRYPTION_KEY_HINT =
  'Set REPO_TOKEN_ENCRYPTION_KEY to a base64-encoded 32-byte key (openssl rand -base64 32). '
  + 'Set in .env for local Nuxt (pnpm dev) and in Cloudflare as a secret for production.'

export function isRepoTokenEncryptionKeyError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('REPO_TOKEN_ENCRYPTION_KEY')
}

export function rethrowSyncConfigError(error: unknown, action: string): never {
  if (isRepoTokenEncryptionKeyError(error)) {
    throw createError({
      statusCode: 500,
      statusMessage: `${action} unavailable: REPO_TOKEN_ENCRYPTION_KEY is not configured`,
      data: {
        resolution: REPO_TOKEN_ENCRYPTION_KEY_HINT,
      },
    })
  }

  throw error
}
