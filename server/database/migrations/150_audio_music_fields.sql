-- 150_audio_music_fields.sql — Audio Studio Phase 2 (music generation).
-- Extends the audio_assets spine (mig 149) with music-specific fields.
-- Voiceover rows leave these NULL. Idempotent / additive.
ALTER TABLE audio_assets
  ADD COLUMN IF NOT EXISTS is_instrumental BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS lyrics          TEXT NULL,
  ADD COLUMN IF NOT EXISTS format          TEXT NULL;
