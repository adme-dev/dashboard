export const bannerMusicGenres = ['Acoustic', 'Ambient', 'Cinematic', 'Corporate', 'Electronic', 'Hip-Hop', 'Jazz', 'Orchestral', 'Pop', 'Rock'] as const
export const bannerMusicMoods = ['Calm', 'Dramatic', 'Energetic', 'Playful', 'Uplifting'] as const

export type BannerMusicGenre = typeof bannerMusicGenres[number]
export type BannerMusicMood = typeof bannerMusicMoods[number]
export type BannerMusicVocals = 'instrumental' | 'vocals'

export interface BannerMusicFilters {
  genre?: BannerMusicGenre
  mood?: BannerMusicMood
  vocals?: BannerMusicVocals
  maxDuration?: number
}
