// server/utils/socialListening/sources/types.ts
import type { RawMention } from '~~/server/utils/socialListening/types'

/** Env bag passed to adapters (subset of process.env, injected for testability). */
export type SourceEnv = Record<string, string | undefined>

export interface SourceSearchInput {
  terms: string[]                 // include terms (OR)
  limit: number                   // max hits to request
  fetchImpl: typeof fetch         // injected fetch
  env: SourceEnv
}

export interface ListeningSource {
  key: 'reddit' | 'news' | 'youtube' | 'bluesky' | 'mastodon' | 'hackernews' | 'lemmy' | 'facebook_ads_library'
  isEnabled(env: SourceEnv): boolean
  search(input: SourceSearchInput): Promise<RawMention[]>
}
