// Explicit disposable-local bootstrap; never accepts a production URL.
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'

const raw = process.env.STORYBOARD_TEST_DATABASE_URL
const url = new URL(raw || '')
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/video_storyboard_recovery_test' || url.search || !url.port) throw new Error('Requires explicit local port and exact disposable database name')
const pool = new Pool({ connectionString: raw })
try {
  if ((await pool.query('SELECT current_database() name')).rows[0].name !== 'video_storyboard_recovery_test') throw new Error('Wrong database')
  await pool.query(`CREATE TABLE agency_clients(id uuid PRIMARY KEY, is_active boolean DEFAULT true);
    CREATE TABLE custom_roles(id uuid PRIMARY KEY, name text, slug text, is_read_only boolean, is_system boolean DEFAULT false);
    CREATE TABLE team_members(id uuid PRIMARY KEY, name text, email text, user_role text, custom_role_id uuid, is_active boolean);
    CREATE TABLE role_permission_groups(role_id uuid REFERENCES custom_roles(id) ON DELETE CASCADE, permission_group text);
    CREATE TABLE client_team_assignments(team_member_id uuid, client_id uuid);
    CREATE TABLE brand_kits(id uuid PRIMARY KEY, client_id uuid, name text, colors jsonb DEFAULT '[]', fonts jsonb DEFAULT '[]', logos jsonb DEFAULT '[]', guidelines text, created_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());`)
  for (const name of ['160_media_timelines.sql', '174_video_assets.sql', '175_video_generation_jobs.sql', '176_video_gen_source_assets.sql', '500_media_timeline_edit_revision.sql', '501_video_storyboard_persistence.sql', '502_video_storyboard_candidates.sql', '503_video_storyboard_render_review.sql', '506_video_generation_liability.sql', '507_video_storyboard_production_attempts.sql', '508_video_generation_output_identity.sql', '509_video_generation_liability_reconciliations.sql', '149_audio_assets.sql', '150_audio_music_fields.sql', '510_audio_asset_imports.sql']) {
    await pool.query(await readFile(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8'))
  }
  console.log('Disposable local base fixtures and actual storyboard migrations applied')
} finally { await pool.end() }
