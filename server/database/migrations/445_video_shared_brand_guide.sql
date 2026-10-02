-- Explicit opt-in link; legacy video guides and generation policies are retained.
ALTER TABLE client_video_generation_profiles
  ADD COLUMN IF NOT EXISTS brand_kit_id UUID REFERENCES brand_kits(id) ON DELETE SET NULL;
