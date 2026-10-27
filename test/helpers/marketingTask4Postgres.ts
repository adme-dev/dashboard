import { readFileSync } from 'node:fs'
import { Pool } from 'pg'
export const TASK4_DSN = process.env.MARKETING_TASK4_TEST_DSN ?? ''
export function task4Pool(raw: string) {
  const url = new URL(raw),
    host = url.searchParams.get('host') ?? '',
    database = url.pathname.slice(1)
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== 'localhost' ||
    url.port ||
    url.password ||
    !host.startsWith('/private/tmp/marketing-task4-') ||
    host.includes('..') ||
    !/^marketing_task4_[a-z0-9_]+$/.test(database) ||
    /(prod|main|shared)/.test(database)
  )
    throw new Error('Disposable Task4 private socket database required')
  return new Pool({
    host,
    database,
    user: url.username,
    max: 6,
    statement_timeout: 10000
  })
}
export async function resetTask4Schema(pool: Pool) {
  await pool.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
 CREATE TABLE agency_clients(id UUID PRIMARY KEY,name TEXT,is_active BOOLEAN DEFAULT TRUE);
 CREATE TABLE team_members(id UUID PRIMARY KEY,name TEXT,email TEXT,role TEXT,user_role TEXT,custom_role_id UUID,is_active BOOLEAN DEFAULT TRUE);
 CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN DEFAULT FALSE,is_read_only BOOLEAN DEFAULT FALSE);
 CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT);
 CREATE TABLE client_team_assignments(team_member_id UUID,client_id UUID);
 CREATE TABLE social_connections(id UUID PRIMARY KEY,client_id UUID,account_id TEXT,platform TEXT,status TEXT,UNIQUE(client_id,id));
 CREATE TABLE google_ads_account_bindings(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),client_id UUID,connection_id UUID,operating_customer_id TEXT,login_customer_id TEXT,account_role TEXT);
 CREATE TABLE ai_pending_actions(id UUID PRIMARY KEY);
 CREATE TABLE google_credential_profiles(id UUID PRIMARY KEY);
 CREATE TABLE tracking_sites(id UUID PRIMARY KEY,client_id UUID,name TEXT,allowed_origins TEXT[],is_active BOOLEAN DEFAULT TRUE,write_key TEXT,spa BOOLEAN DEFAULT FALSE);
 CREATE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;`)
  for (const f of [
    '337_google_tag_manager_management.sql',
    '338_google_ads_mcp_action_control.sql',
    '484_google_ads_independent_review.sql',
    '485_gtm_scoped_change_proposals.sql'
  ])
    await pool.query(readFileSync('server/database/migrations/' + f, 'utf8'))
}
