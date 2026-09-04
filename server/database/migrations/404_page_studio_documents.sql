-- 404: Mutable Page Studio draft documents for the visual page builder.
-- Approved releases continue to reference immutable checkpoint objects.

BEGIN;

CREATE TABLE IF NOT EXISTS page_studio_documents (
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
  document JSONB NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  updated_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, client_id, site_id),
  FOREIGN KEY (tenant_id, client_id, site_id)
    REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE CASCADE
);

INSERT INTO page_studio_documents (
  tenant_id, client_id, site_id, revision, document, updated_by
)
SELECT
  site.tenant_id,
  site.client_id,
  site.id,
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'pages', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'parentId', NULL,
        'title', 'Home',
        'slug', '',
        'visibility', 'visible',
        'seoTitle', site.name,
        'seoDescription', 'Welcome to ' || site.name || '.',
        'blocks', jsonb_build_array(
          jsonb_build_object(
            'id', gen_random_uuid()::text,
            'type', 'hero',
            'eyebrow', 'Welcome',
            'heading', site.name,
            'body', 'Build this page with reusable sections, then submit a version for review.',
            'buttonLabel', 'Get started',
            'buttonHref', '#contact',
            'imageUrl', '',
            'imageAlt', '',
            'alignment', 'left',
            'background', 'dark'
          ),
          jsonb_build_object(
            'id', gen_random_uuid()::text,
            'type', 'text',
            'eyebrow', 'Page Studio',
            'heading', 'A flexible starting point',
            'body', 'Select this section to edit its content, duplicate it, or add another section below.',
            'buttonLabel', '',
            'buttonHref', '',
            'imageUrl', '',
            'imageAlt', '',
            'alignment', 'left',
            'background', 'canvas'
          )
        )
      )
    )
  ),
  site.created_by
FROM page_studio_sites site
ON CONFLICT (tenant_id, client_id, site_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_page_studio_documents_updated
  ON page_studio_documents (tenant_id, client_id, updated_at DESC);

COMMIT;
