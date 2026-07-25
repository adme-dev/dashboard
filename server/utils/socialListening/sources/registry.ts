// server/utils/socialListening/sources/registry.ts
import type { ListeningSource } from '~~/server/utils/socialListening/sources/types'
import { newsSource } from '~~/server/utils/socialListening/sources/news'
import { redditSource } from '~~/server/utils/socialListening/sources/reddit'
import { youtubeSource } from '~~/server/utils/socialListening/sources/youtube'
import { blueskySource } from '~~/server/utils/socialListening/sources/bluesky'
import { mastodonSource } from '~~/server/utils/socialListening/sources/mastodon'
import { hackernewsSource } from '~~/server/utils/socialListening/sources/hackernews'
import { lemmySource } from '~~/server/utils/socialListening/sources/lemmy'
import { facebookAdsLibrarySource } from '~~/server/utils/socialListening/sources/facebookAdsLibrary.ts'

export const LISTENING_SOURCES: ListeningSource[] = [
  newsSource, redditSource, youtubeSource, blueskySource, mastodonSource, hackernewsSource, lemmySource, facebookAdsLibrarySource,
]
