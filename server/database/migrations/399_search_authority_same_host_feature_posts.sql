-- Search Authority: same-host publishing mode + GTM feature-post block
-- Spec: docs/superpowers/specs/2026-08-26-search-authority-same-host-publishing-design.md

ALTER TABLE search_authority_sites
  ADD COLUMN IF NOT EXISTS public_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS publishing_mode text NOT NULL DEFAULT 'subdomain',
  ADD COLUMN IF NOT EXISTS content_path_prefix text NOT NULL DEFAULT '/guides';

DO $$ BEGIN
  ALTER TABLE search_authority_sites
    ADD CONSTRAINT search_authority_sites_publishing_mode_check
    CHECK (publishing_mode IN ('subdomain', 'same_host'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE search_authority_sites
    ADD CONSTRAINT search_authority_sites_content_path_prefix_check
    CHECK (content_path_prefix = '/guides');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS search_authority_sites_public_id_key
  ON search_authority_sites (public_id);

ALTER TABLE search_authority_menu_configs
  ADD COLUMN IF NOT EXISTS feature_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_selector text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS feature_position text NOT NULL DEFAULT 'append',
  ADD COLUMN IF NOT EXISTS feature_max_items integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS feature_heading text NOT NULL DEFAULT 'Latest buying guides';

DO $$ BEGIN
  ALTER TABLE search_authority_menu_configs
    ADD CONSTRAINT search_authority_menu_configs_feature_selector_check
    CHECK (char_length(feature_selector) <= 200);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE search_authority_menu_configs
    ADD CONSTRAINT search_authority_menu_configs_feature_position_check
    CHECK (feature_position IN ('prepend', 'append', 'before', 'after'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE search_authority_menu_configs
    ADD CONSTRAINT search_authority_menu_configs_feature_max_items_check
    CHECK (feature_max_items BETWEEN 1 AND 3);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE search_authority_menu_configs
    ADD CONSTRAINT search_authority_menu_configs_feature_heading_check
    CHECK (char_length(feature_heading) BETWEEN 1 AND 80 AND feature_heading !~ '[<>]');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
