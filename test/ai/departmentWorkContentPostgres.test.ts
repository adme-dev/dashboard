/* eslint-disable @typescript-eslint/no-explicit-any -- partial heterogeneous PostgreSQL fixture and dependency mock shapes */
/**
 * Opt-in real-Postgres contract for department work + Search Authority content operations. Skipped
 * unless DEPARTMENT_WORK_PG_URL points at a LOCAL scratch database. Prerequisite tables mirror the
 * columns/constraints these services touch (schema-workflow.sql, schema-briefs.sql, migrations 066,
 * 329, 345, 347); the content workflow tables are created by executing migrations 335-337 verbatim.
 *
 *   initdb -D /tmp/deptworkpg -U postgres && pg_ctl -D /tmp/deptworkpg -o "-p 54331 -k /tmp" start
 *   DEPARTMENT_WORK_PG_URL='postgresql:///postgres?host=/tmp&port=54331&user=postgres' pnpm exec vitest run test/ai/departmentWorkContentPostgres.test.ts
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'

const url = process.env.DEPARTMENT_WORK_PG_URL
function isLocal(value?: string): boolean {
  if (!value) return false
  try {
    const parsed = new URL(value)
    const socket = parsed.searchParams.get('host')
    return ['', 'localhost', '127.0.0.1'].includes(parsed.hostname) && (!socket || socket.startsWith('/'))
  } catch {
    return false
  }
}
const local = isLocal(url)

const h = vi.hoisted(() => ({
  client: null as null | import('pg').Client,
  authority: { deny: false, allowCalls: Infinity, calls: 0 },
  effects: [] as string[]
}))
vi.mock('~~/server/utils/db', () => {
  const rows = async (sql: string, params?: unknown[]) => (await h.client!.query(sql, params as any[])).rows
  const tx = async (cb: (db: unknown) => Promise<unknown>) => {
    await h.client!.query('BEGIN')
    try {
      const result = await cb(h.client)
      await h.client!.query('COMMIT')
      return result
    } catch (error) {
      await h.client!.query('ROLLBACK')
      throw error
    }
  }
  return { queryRowsFresh: rows, queryRows: rows, queryOneFresh: async (s: string, p?: unknown[]) => (await rows(s, p))[0] ?? null, queryOne: async (s: string, p?: unknown[]) => (await rows(s, p))[0] ?? null, transaction: tx, transactionWithoutRetry: tx }
})
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({
  requireMarketingDepartment: vi.fn(async (ctx: Record<string, unknown>) => {
    h.authority.calls += 1
    if (h.authority.deny || h.authority.calls > h.authority.allowCalls) throw Object.assign(new Error('revoked'), { statusCode: 403 })
    return { ...ctx }
  })
}))
vi.mock('~~/server/utils/godMode/authority', () => ({
  resolveGodModeAuthority: vi.fn(async () => ({ active: false })),
  isActiveGodModeAuthority: () => false
}))
vi.mock('~~/server/utils/workManagement/taskEffects', () => ({
  dispatchTaskStatusChangeEffects: vi.fn(() => { h.effects.push('status') }),
  dispatchTaskFieldUpdateEffects: vi.fn(async () => { h.effects.push('fields') })
}))
vi.mock('~~/server/utils/notifications', () => ({
  notifyTaskAssigned: vi.fn(async () => { h.effects.push('assigned') }),
  notifyTaskAssigneeChanged: vi.fn(async () => { h.effects.push('assignee') })
}))
vi.mock('~~/server/utils/subscriptions', () => ({
  autoSubscribe: vi.fn(async () => { h.effects.push('subscribe') }),
  autoSubscribeIfEnabled: vi.fn(async () => { h.effects.push('subscribe') })
}))
vi.mock('~~/server/utils/briefNotifications', () => ({
  notifyBriefAssigneeChanged: vi.fn(async () => { h.effects.push('brief_assignee') }),
  notifyBriefStatusChanged: vi.fn(async () => { h.effects.push('brief_status') })
}))
vi.mock('~~/server/utils/automation/actionedConfirmationRunner', () => ({
  maybeAcknowledgeBrief: vi.fn(async () => {
    h.effects.push('brief_ack')
  })
}))

const { runDepartmentWorkOperation } = await import('~~/server/utils/ai/marketing/departmentWorkOperations')
const { runDepartmentContentOperation } = await import('~~/server/utils/ai/marketing/departmentContentOperations')

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ACTOR = ID(1), PEER = ID(2), OUTSIDER = ID(3), INACTIVE_MEMBER = ID(4)
const CLIENT = ID(10), OTHER_CLIENT = ID(11), INACTIVE_CLIENT = ID(12)
const BOARD = ID(20), PRIVATE_BOARD = ID(21)
const PROJECT = ID(30), OTHER_PROJECT = ID(31), INACTIVE_PROJECT = ID(32)
const TODO = ID(40), DONE = ID(41), PRIVATE_STATUS = ID(42)
const TASK = ID(50), OTHER_TASK = ID(51), PRIVATE_TASK = ID(52)
const BRIEF = ID(60), APPROVED_BRIEF = ID(61)
const SITE = ID(70), OTHER_SITE = ID(71)

let keyCounter = 0
const key = () => `mcp:${String(++keyCounter).padStart(64, '0')}`
const DIGEST = 'a'.repeat(64)
const ctx = (userId = ACTOR) => ({
  userId, userRole: 'staff', event: { context: {} } as never, source: 'mcp' as const,
  mcpScopes: new Set(['mcp:read', 'mcp:write']), mcpStaffAuthority: 'fresh' as const,
  permissionGroups: ['MARKETING_MANAGEMENT'] as never, marketingCapabilities: ['department_management'],
  assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [] } as never
})
const work = (name: string, args: unknown, k = key(), as = ACTOR) => runDepartmentWorkOperation(name, args, ctx(as), k, DIGEST)
const content = (name: string, args: unknown, deps: Record<string, unknown> = {}, k = key(), as = ACTOR) =>
  runDepartmentContentOperation(name, args, ctx(as), k, DIGEST, { isEntitled: async () => true, requireReviewer: (async () => ({})) as never, ...deps })
const count = async (sql: string, params: unknown[] = []) => Number((await h.client!.query(sql, params)).rows[0].n)

const PREREQS = `
DROP SCHEMA IF EXISTS dept_work_test CASCADE; CREATE SCHEMA dept_work_test; SET search_path TO dept_work_test, public;
CREATE TABLE agency_clients (id uuid PRIMARY KEY, name varchar(255) NOT NULL, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE team_members (id uuid PRIMARY KEY, name varchar(255) NOT NULL, email varchar(255) UNIQUE NOT NULL, is_active boolean DEFAULT true);
CREATE TABLE client_users (id uuid PRIMARY KEY, client_id uuid, status text, can_approve_work boolean);
CREATE TABLE departments (id uuid PRIMARY KEY, name varchar(100) NOT NULL, slug varchar(50) UNIQUE NOT NULL, manager_id uuid REFERENCES team_members(id),
  is_active boolean DEFAULT true, sort_order integer DEFAULT 0);
CREATE TABLE department_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE, UNIQUE (department_id, team_member_id));
CREATE TABLE task_statuses (id uuid PRIMARY KEY, department_id uuid REFERENCES departments(id), name varchar(100) NOT NULL, slug varchar(50) NOT NULL,
  category varchar(50) NOT NULL CHECK (category IN ('not_started', 'in_progress', 'review', 'done', 'cancelled')),
  is_default boolean DEFAULT false, is_final boolean DEFAULT false, sort_order integer DEFAULT 0, UNIQUE (department_id, slug));
CREATE TABLE projects (id uuid PRIMARY KEY, client_id uuid NOT NULL REFERENCES agency_clients(id), name varchar(255) NOT NULL,
  status varchar(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'on_hold', 'completed', 'cancelled')));
CREATE TABLE briefs (id uuid PRIMARY KEY, reference_number varchar(20) NOT NULL UNIQUE, title varchar(255) NOT NULL,
  client_id uuid REFERENCES agency_clients(id), project_id uuid REFERENCES projects(id), department_id uuid REFERENCES departments(id),
  status varchar(30) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'needs_info', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled')),
  priority varchar(20) DEFAULT 'medium', assigned_to uuid REFERENCES team_members(id), assigned_at timestamptz, requested_deadline date,
  converted_to_task_id uuid, converted_to_project_id uuid, budget_min decimal(12,2), budget_max decimal(12,2), submitted_by_email varchar(255),
  completed_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  department_id uuid NOT NULL REFERENCES departments(id), parent_task_id uuid REFERENCES tasks(id), status_id uuid REFERENCES task_statuses(id),
  title varchar(255) NOT NULL, description text, priority varchar(20) DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  task_type varchar(50) DEFAULT 'task', assignee_id uuid REFERENCES team_members(id), reporter_id uuid REFERENCES team_members(id),
  due_date date, start_date date, is_blocked boolean DEFAULT false, blocked_reason text, completed_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), version integer DEFAULT 1, last_modified_by uuid REFERENCES team_members(id),
  status_is_final boolean NOT NULL DEFAULT false, brief_id uuid REFERENCES briefs(id) ON DELETE SET NULL, budget_source varchar(20) DEFAULT 'manual',
  estimated_cost numeric(12,2), billing_rate numeric(10,2), quote_line_item_id uuid);
CREATE FUNCTION increment_task_version() RETURNS TRIGGER AS $$ BEGIN NEW.version = COALESCE(OLD.version, 1) + 1; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trigger_task_version BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION increment_task_version();
CREATE FUNCTION tasks_sync_status_is_final() RETURNS TRIGGER AS $$ BEGIN
  IF TG_OP = 'INSERT' OR NEW.status_id IS DISTINCT FROM OLD.status_id THEN
    SELECT COALESCE(is_final, false) INTO NEW.status_is_final FROM task_statuses WHERE id = NEW.status_id;
    NEW.status_is_final := COALESCE(NEW.status_is_final, false);
  END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_tasks_sync_status_is_final BEFORE INSERT OR UPDATE OF status_id ON tasks FOR EACH ROW EXECUTE FUNCTION tasks_sync_status_is_final();
CREATE TABLE task_activities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES team_members(id), activity_type varchar(50) NOT NULL CHECK (activity_type IN ('created', 'updated', 'status_change',
  'assignment', 'comment', 'attachment', 'due_date_change', 'priority_change', 'label_change', 'dependency_added', 'dependency_removed',
  'approval_requested', 'approved', 'rejected', 'completed', 'reopened')), old_value jsonb, new_value jsonb, content text, created_at timestamptz DEFAULT now());
CREATE TABLE brief_activities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brief_id uuid NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES team_members(id), activity_type varchar(50) NOT NULL CHECK (activity_type IN ('created', 'submitted', 'updated', 'status_changed',
  'assigned', 'unassigned', 'commented', 'attachment_added', 'reviewed', 'approved', 'rejected', 'needs_info', 'converted_to_task',
  'converted_to_project', 'priority_changed', 'deadline_changed', 'completed', 'cancelled')), old_value jsonb, new_value jsonb, content text, created_at timestamptz DEFAULT now());
CREATE TABLE brief_watchers (brief_id uuid NOT NULL REFERENCES briefs(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(), PRIMARY KEY (brief_id, user_id));
CREATE TABLE search_authority_sites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  canonical_hostname text NOT NULL, content_hostname text, status text NOT NULL DEFAULT 'draft', UNIQUE (client_id), UNIQUE (client_id, id));
CREATE TABLE search_authority_opportunities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES agency_clients(id));
CREATE TABLE god_mode_execution_ledger (actor_user_id uuid NOT NULL, channel varchar(16) NOT NULL CHECK (channel IN ('application', 'mcp')),
  idempotency_key varchar(128) NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 128),
  state varchar(16) NOT NULL CHECK (state IN ('in_progress', 'succeeded', 'failed', 'ambiguous')),
  result_reference varchar(128) CHECK (result_reference IS NULL OR char_length(result_reference) BETWEEN 1 AND 128),
  result_digest varchar(64) CHECK (result_digest IS NULL OR result_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  correlation_id uuid NOT NULL UNIQUE, route_or_tool varchar(160) NOT NULL CHECK (char_length(route_or_tool) BETWEEN 1 AND 160),
  executor_class varchar(32) NOT NULL CHECK (executor_class IN ('local-transactional', 'internal-http', 'external-provider')),
  session_digest varchar(64) NOT NULL CHECK (session_digest ~ '^[0-9a-f]{64}$'), tenant_id uuid, client_id uuid, proposal_id uuid,
  execution_phase varchar(32) NOT NULL DEFAULT 'claimed' CHECK (execution_phase IN ('claimed', 'proposal_prepared', 'task_created', 'dispatched', 'result_captured')),
  execution_metadata jsonb CHECK (execution_metadata IS NULL OR (jsonb_typeof(execution_metadata) = 'object' AND octet_length(execution_metadata::TEXT) <= 4096)),
  PRIMARY KEY (actor_user_id, channel, idempotency_key));
`
const SEED = `
INSERT INTO agency_clients VALUES ('${CLIENT}', 'Client', true), ('${OTHER_CLIENT}', 'Other', true), ('${INACTIVE_CLIENT}', 'Gone', false);
INSERT INTO team_members (id, name, email, is_active) VALUES ('${ACTOR}', 'Garrix', 'g@x', true), ('${PEER}', 'Hannah', 'h@x', true),
  ('${OUTSIDER}', 'Outsider', 'o@x', true), ('${INACTIVE_MEMBER}', 'Former', 'f@x', false);
INSERT INTO departments (id, name, slug) VALUES ('${BOARD}', 'Marketing Delivery', 'mkt'), ('${PRIVATE_BOARD}', 'Finance Private', 'fin');
INSERT INTO department_members (department_id, team_member_id) VALUES ('${BOARD}', '${ACTOR}'), ('${BOARD}', '${PEER}'), ('${BOARD}', '${INACTIVE_MEMBER}'), ('${PRIVATE_BOARD}', '${OUTSIDER}');
INSERT INTO task_statuses (id, department_id, name, slug, category, is_default, is_final) VALUES
  ('${TODO}', NULL, 'To Do', 'todo', 'not_started', true, false), ('${DONE}', NULL, 'Done', 'done', 'done', false, true),
  ('${PRIVATE_STATUS}', '${PRIVATE_BOARD}', 'Fin only', 'fin-only', 'in_progress', false, false);
INSERT INTO projects VALUES ('${PROJECT}', '${CLIENT}', 'Retainer', 'active'), ('${OTHER_PROJECT}', '${OTHER_CLIENT}', 'Other retainer', 'active'),
  ('${INACTIVE_PROJECT}', '${INACTIVE_CLIENT}', 'Old', 'active');
INSERT INTO tasks (id, project_id, department_id, status_id, title, estimated_cost, billing_rate) VALUES
  ('${TASK}', '${PROJECT}', '${BOARD}', '${TODO}', 'Write ads', 900, 150),
  ('${OTHER_TASK}', '${OTHER_PROJECT}', '${BOARD}', '${TODO}', 'Other client task', NULL, NULL),
  ('${PRIVATE_TASK}', '${PROJECT}', '${PRIVATE_BOARD}', '${TODO}', 'Private board task', NULL, NULL);
INSERT INTO briefs (id, reference_number, title, client_id, department_id, status, budget_min, submitted_by_email) VALUES
  ('${BRIEF}', 'BR-1', 'Spring campaign', '${CLIENT}', '${BOARD}', 'submitted', 5000, 'client@example.com'),
  ('${APPROVED_BRIEF}', 'BR-2', 'Approved campaign', '${CLIENT}', NULL, 'approved', NULL, NULL);
INSERT INTO search_authority_sites (id, client_id, canonical_hostname, content_hostname) VALUES
  ('${SITE}', '${CLIENT}', 'dealer.example', 'learn.dealer.example'), ('${OTHER_SITE}', '${OTHER_CLIENT}', 'other.example', NULL);
`

describe.skipIf(!local)('department work + content operations on real Postgres', () => {
  beforeAll(async () => {
    h.client = new pg.Client({ connectionString: url })
    await h.client.connect()
    await h.client.query(PREREQS)
    for (const file of ['335_search_authority_content_workflow.sql', '336_search_authority_portal_approval_actor.sql', '337_search_authority_content_disclaimer.sql']) {
      await h.client.query(readFileSync(`server/database/migrations/${file}`, 'utf8'))
    }
    await h.client.query(SEED)
  })
  afterAll(async () => {
    await h.client?.query('DROP SCHEMA IF EXISTS dept_work_test CASCADE')
    await h.client?.end()
  })
  beforeEach(() => {
    Object.assign(h.authority, { deny: false, allowCalls: Infinity, calls: 0 })
    h.effects.length = 0
  })

  describe('work management', () => {
    it('lists only accessible boards, the client projects and board-member assignees', async () => {
      const result = await work('marketing_get_work_options', { clientId: CLIENT, boardId: BOARD })
      expect(result.ok).toBe(true)
      const data = (result as { data: any }).data
      expect(data.boards.map((b: any) => b.id)).toEqual([BOARD])
      expect(data.projects.map((p: any) => p.id)).toEqual([PROJECT])
      expect(data.board.assignableMembers.map((m: any) => m.id).sort()).toEqual([ACTOR, PEER].sort())
      expect((await work('marketing_get_work_options', { clientId: CLIENT, boardId: PRIVATE_BOARD })).ok).toBe(false)
    })

    it('grants no role-based bypass to private boards', async () => {
      const admin = { ...ctx(), userRole: 'admin' }
      const tasks = await runDepartmentWorkOperation('marketing_list_work_tasks', { clientId: CLIENT, boardId: PRIVATE_BOARD }, admin)
      expect((tasks as { data: any }).data.items).toEqual([])
      expect(await runDepartmentWorkOperation('marketing_get_work_options', { clientId: CLIENT, boardId: PRIVATE_BOARD }, admin)).toMatchObject({ ok: false, code: 'not_found' })
    })

    it('lists client tasks on accessible boards without billing fields', async () => {
      const result = await work('marketing_list_work_tasks', { clientId: CLIENT })
      const items = (result as { data: any }).data.items
      expect(items.map((t: any) => t.id)).toEqual([TASK])
      expect(Object.keys(items[0])).not.toEqual(expect.arrayContaining(['estimated_cost']))
      expect(JSON.stringify(items)).not.toMatch(/estimated_cost|billing_rate|quote_line/)
    })

    it('refuses inactive clients and revoked authority before reading', async () => {
      expect(await work('marketing_list_work_tasks', { clientId: INACTIVE_CLIENT })).toMatchObject({ ok: false, code: 'not_found' })
      h.authority.deny = true
      expect(await work('marketing_list_work_tasks', { clientId: CLIENT })).toMatchObject({ ok: false, code: 'forbidden' })
    })

    it('creates a task atomically with ledger, activity and one fan-out; replays exactly and rejects reused keys', async () => {
      const args = { clientId: CLIENT, projectId: PROJECT, boardId: BOARD, title: 'Launch spring search', assigneeId: PEER, briefId: BRIEF, dueDate: '2026-11-10', acknowledgement: 'CREATE_CLIENT_TASK' }
      const k = key()
      const first = await work('marketing_create_work_task', args, k)
      expect(first.ok).toBe(true)
      const taskId = (first as { data: any }).data.taskId
      const row = (await h.client!.query('SELECT status_id, reporter_id, assignee_id, brief_id, estimated_cost FROM tasks WHERE id = $1', [taskId])).rows[0]
      expect(row).toMatchObject({ status_id: TODO, reporter_id: ACTOR, assignee_id: PEER, brief_id: BRIEF, estimated_cost: null })
      expect(await count(`SELECT COUNT(*) n FROM task_activities WHERE task_id = $1 AND activity_type = 'created'`, [taskId])).toBe(1)
      expect((await h.client!.query(`SELECT state, execution_phase, route_or_tool, client_id FROM god_mode_execution_ledger WHERE idempotency_key = $1`, [k])).rows[0])
        .toEqual({ state: 'succeeded', execution_phase: 'result_captured', route_or_tool: 'marketing_create_work_task', client_id: CLIENT })
      expect(h.effects.sort()).toEqual(['assigned', 'subscribe'])
      h.effects.length = 0
      const replay = await work('marketing_create_work_task', args, k)
      expect(replay).toMatchObject({ ok: true, data: { taskId, replayed: true } })
      expect(h.effects).toEqual([])
      expect(await count(`SELECT COUNT(*) n FROM tasks WHERE title = 'Launch spring search'`)).toBe(1)
      expect(await work('marketing_create_work_task', { ...args, title: 'Different' }, k)).toMatchObject({ ok: false, code: 'idempotency_conflict' })
    })

    it('rejects cross-client projects/briefs, inaccessible boards and non-member assignees with no ledger claim', async () => {
      const base = { clientId: CLIENT, projectId: PROJECT, boardId: BOARD, title: 'X', acknowledgement: 'CREATE_CLIENT_TASK' }
      const cases: Array<[Record<string, unknown>, string]> = [
        [{ projectId: OTHER_PROJECT }, 'not_found'],
        [{ boardId: PRIVATE_BOARD }, 'not_found'],
        [{ statusId: PRIVATE_STATUS }, 'bad_args'],
        [{ assigneeId: OUTSIDER }, 'bad_args'],
        [{ assigneeId: INACTIVE_MEMBER }, 'bad_args'],
        [{ briefId: ID(999) }, 'not_found']
      ]
      for (const [patch, code] of cases) {
        const k = key()
        expect(await work('marketing_create_work_task', { ...base, ...patch }, k)).toMatchObject({ ok: false, code })
        expect(await count('SELECT COUNT(*) n FROM god_mode_execution_ledger WHERE idempotency_key = $1', [k])).toBe(0)
      }
      expect(await work('marketing_create_work_task', { ...base, clientId: INACTIVE_CLIENT, projectId: INACTIVE_PROJECT })).toMatchObject({ ok: false, code: 'not_found' })
      expect(await work('marketing_create_work_task', { ...base, acknowledgement: 'yes' })).toMatchObject({ ok: false, code: 'bad_args' })
      expect(await runDepartmentWorkOperation('marketing_create_work_task', base, ctx(), 'not-a-key', DIGEST)).toMatchObject({ ok: false, code: 'coordinator_required' })
    })

    it('updates, assigns and moves status only at the version read, and only for the exact client task', async () => {
      const version = Number((await h.client!.query('SELECT version FROM tasks WHERE id = $1', [TASK])).rows[0].version)
      expect(await work('marketing_update_work_task', { clientId: CLIENT, taskId: TASK, expectedVersion: version + 5, patch: { priority: 'high' }, acknowledgement: 'UPDATE_CLIENT_TASK' }))
        .toMatchObject({ ok: false, code: 'conflict' })
      expect(await work('marketing_update_work_task', { clientId: OTHER_CLIENT, taskId: TASK, expectedVersion: version, patch: { priority: 'high' }, acknowledgement: 'UPDATE_CLIENT_TASK' }))
        .toMatchObject({ ok: false, code: 'not_found' })
      expect(await work('marketing_update_work_task', { clientId: CLIENT, taskId: PRIVATE_TASK, expectedVersion: 1, patch: { priority: 'high' }, acknowledgement: 'UPDATE_CLIENT_TASK' }))
        .toMatchObject({ ok: false, code: 'not_found' })
      const updated = await work('marketing_update_work_task', { clientId: CLIENT, taskId: TASK, expectedVersion: version, patch: { priority: 'high', dueDate: '2026-11-20', isBlocked: true, blockedReason: 'Awaiting assets' }, acknowledgement: 'UPDATE_CLIENT_TASK' })
      expect(updated).toMatchObject({ ok: true, data: { version: version + 1 } })
      expect(h.effects).toEqual(['fields'])
      const assigned = await work('marketing_assign_work_task', { clientId: CLIENT, taskId: TASK, expectedVersion: version + 1, assigneeId: PEER, acknowledgement: 'ASSIGN_CLIENT_TASK' })
      expect(assigned).toMatchObject({ ok: true, data: { assigneeId: PEER, version: version + 2 } })
      expect(await work('marketing_assign_work_task', { clientId: CLIENT, taskId: TASK, expectedVersion: version + 2, assigneeId: OUTSIDER, acknowledgement: 'ASSIGN_CLIENT_TASK' }))
        .toMatchObject({ ok: false, code: 'bad_args' })
      expect(await work('marketing_set_work_task_status', { clientId: CLIENT, taskId: TASK, expectedVersion: version + 2, statusId: PRIVATE_STATUS, acknowledgement: 'CHANGE_CLIENT_TASK_STATUS' }))
        .toMatchObject({ ok: false, code: 'bad_args' })
      h.effects.length = 0
      const done = await work('marketing_set_work_task_status', { clientId: CLIENT, taskId: TASK, expectedVersion: version + 2, statusId: DONE, acknowledgement: 'CHANGE_CLIENT_TASK_STATUS' })
      expect(done).toMatchObject({ ok: true, data: { statusId: DONE, isFinal: true } })
      expect(h.effects).toEqual(['status'])
      const row = (await h.client!.query('SELECT status_is_final, completed_at, last_modified_by, priority, due_date::text AS due FROM tasks WHERE id = $1', [TASK])).rows[0]
      expect(row).toMatchObject({ status_is_final: true, last_modified_by: ACTOR, priority: 'high', due: '2026-11-20' })
      expect(row.completed_at).not.toBeNull()
      expect(await count(`SELECT COUNT(*) n FROM task_activities WHERE task_id = $1 AND activity_type IN ('updated', 'assignment', 'status_change')`, [TASK])).toBe(6)
    })

    it('assigns briefs against the expected assignee and only allows non-approval status transitions', async () => {
      expect(await work('marketing_assign_work_brief', { clientId: CLIENT, briefId: BRIEF, expectedAssigneeId: PEER, assigneeId: ACTOR, acknowledgement: 'ASSIGN_CLIENT_BRIEF' }))
        .toMatchObject({ ok: false, code: 'conflict' })
      const assigned = await work('marketing_assign_work_brief', { clientId: CLIENT, briefId: BRIEF, expectedAssigneeId: null, assigneeId: PEER, acknowledgement: 'ASSIGN_CLIENT_BRIEF' })
      expect(assigned).toMatchObject({ ok: true, data: { assigneeId: PEER } })
      expect(await count('SELECT COUNT(*) n FROM brief_watchers WHERE brief_id = $1 AND user_id = $2', [BRIEF, PEER])).toBe(1)
      expect(h.effects).toEqual(['brief_assignee', 'brief_ack'])
      expect(await work('marketing_set_work_brief_status', { clientId: CLIENT, briefId: BRIEF, expectedStatus: 'submitted', status: 'approved', note: 'x', acknowledgement: 'CHANGE_CLIENT_BRIEF_STATUS' }))
        .toMatchObject({ ok: false, code: 'bad_args' })
      const moved = await work('marketing_set_work_brief_status', { clientId: CLIENT, briefId: APPROVED_BRIEF, expectedStatus: 'approved', status: 'in_progress', note: 'Kick-off booked', acknowledgement: 'CHANGE_CLIENT_BRIEF_STATUS' })
      expect(moved).toMatchObject({ ok: true, data: { status: 'in_progress' } })
      expect(await work('marketing_set_work_brief_status', { clientId: OTHER_CLIENT, briefId: BRIEF, expectedStatus: 'submitted', status: 'under_review', note: 'x', acknowledgement: 'CHANGE_CLIENT_BRIEF_STATUS' }))
        .toMatchObject({ ok: false, code: 'not_found' })
      const briefs = (await work('marketing_list_work_briefs', { clientId: CLIENT }) as { data: any }).data.items
      expect(JSON.stringify(briefs)).not.toMatch(/budget_min|client@example\.com/)
    })
  })

  describe('Search Authority content', () => {
    const interview = { intervieweeName: 'Sam Seller', intervieweeRole: 'Sales manager', occurredAt: '2026-10-20T01:00:00.000Z', sourceSummary: 'Explained towing limits for the Cannon Alpha with the brochure.', consentConfirmed: true }
    let assetId = '', interviewId = '', versionId = '', contentHash = ''

    it('requires entitlement and real, already-held interview evidence on the client\'s own site', async () => {
      const args = { clientId: CLIENT, siteId: SITE, slug: 'cannon-alpha-towing', title: 'Cannon Alpha towing', topic: 'Towing', interview, acknowledgement: 'RECORD_PROVIDED_SOURCE_INTERVIEW' }
      expect(await content('marketing_create_content_asset', args, { isEntitled: async () => false })).toMatchObject({ ok: false, code: 'not_entitled' })
      expect(await content('marketing_create_content_asset', { ...args, interview: { ...interview, occurredAt: '2027-01-01T00:00:00.000Z' } }, { now: () => new Date('2026-10-28T00:00:00Z') }))
        .toMatchObject({ ok: false, code: 'bad_args' })
      expect(await content('marketing_create_content_asset', { ...args, interview: { ...interview, consentConfirmed: false } })).toMatchObject({ ok: false, code: 'bad_args' })
      expect(await content('marketing_create_content_asset', { ...args, siteId: OTHER_SITE })).toMatchObject({ ok: false, code: 'not_found' })
      const created = await content('marketing_create_content_asset', args, { now: () => new Date('2026-10-28T00:00:00Z') })
      expect(created.ok).toBe(true)
      ;({ assetId, interviewId } = (created as { data: any }).data)
      expect(await content('marketing_create_content_asset', args)).toMatchObject({ ok: false, code: 'conflict' })
    })

    it('drafts an append-only version bound to the current version, recorded sources and live evidence', async () => {
      const draft = {
        clientId: CLIENT, assetId, expectedCurrentVersionId: null, acknowledgement: 'CREATE_CONTENT_DRAFT_VERSION',
        bodyMarkdown: '# Towing\n\nThe Cannon Alpha is rated to tow 3,500 kg braked.', excerpt: 'Towing limits explained.', disclaimer: 'Check your vehicle handbook.',
        schemaType: 'Article', sourceInterviewIds: [interviewId],
        claims: [{ claim: 'Rated to tow 3,500 kg braked', sourceType: 'manufacturer', sourceReference: 'GWM Cannon Alpha spec sheet 2026', expiresAt: null }]
      }
      expect(await content('marketing_create_content_version', { ...draft, sourceInterviewIds: [ID(998)] })).toMatchObject({ ok: false, code: 'bad_args' })
      expect(await content('marketing_create_content_version', { ...draft, aiMetadata: { provider: 'x', model: 'y', sourceIds: [ID(997)] } })).toMatchObject({ ok: false, code: 'bad_args' })
      expect(await content('marketing_create_content_version', { ...draft, expectedCurrentVersionId: ID(996) })).toMatchObject({ ok: false, code: 'conflict' })
      const created = await content('marketing_create_content_version', draft)
      expect(created.ok).toBe(true)
      ;({ versionId, contentHash } = (created as { data: any }).data)
      const read = (await content('marketing_get_content_asset', { clientId: CLIENT, assetId }) as { data: any }).data
      expect(read.versions[0]).toMatchObject({ versionId, contentHash, isCurrent: true })
      await expect(h.client!.query('UPDATE search_authority_content_versions SET excerpt = $1 WHERE id = $2', ['tampered excerpt', versionId])).rejects.toThrow(/append-only/)
    })

    it('submits and reviews only the exact current content, with independent review', async () => {
      const exact = { clientId: CLIENT, assetId, versionId }
      expect(await content('marketing_submit_content_version', { ...exact, expectedContentHash: 'b'.repeat(64), acknowledgement: 'SUBMIT_CONTENT_FOR_REVIEW' })).toMatchObject({ ok: false, code: 'conflict' })
      expect(await content('marketing_submit_content_version', { ...exact, expectedContentHash: contentHash, acknowledgement: 'SUBMIT_CONTENT_FOR_REVIEW' }, {}, key(), PEER)).toMatchObject({ ok: true, data: { status: 'in_review' } })
      const review = { ...exact, expectedContentHash: contentHash, decision: 'approve', rationale: 'Claims match the spec sheet.', acknowledgement: 'RECORD_INDEPENDENT_CONTENT_DECISION' }
      expect(await content('marketing_review_content_version', review)).toMatchObject({ ok: false, code: 'forbidden' })
      expect(await content('marketing_review_content_version', review, {}, key(), PEER)).toMatchObject({ ok: false, code: 'forbidden' })
      const reviewerDenied = await content('marketing_review_content_version', review, { requireReviewer: async () => Promise.reject(Object.assign(new Error('no'), { statusCode: 403 })) }, key(), OUTSIDER)
      expect(reviewerDenied).toMatchObject({ ok: false, code: 'forbidden' })
      expect(await count('SELECT COUNT(*) n FROM search_authority_approval_decisions WHERE version_id = $1', [versionId])).toBe(0)
      expect(await content('marketing_review_content_version', review, {}, key(), OUTSIDER)).toMatchObject({ ok: true, data: { status: 'approved', published: false } })
      expect((await h.client!.query('SELECT status FROM search_authority_content_assets WHERE id = $1', [assetId])).rows[0].status).toBe('approved')
    })

    it('publishes the approved exact version through the shared service and holds interrupted outcomes', async () => {
      const args = { clientId: CLIENT, assetId, versionId, expectedContentHash: contentHash, acknowledgement: 'PUBLISH_APPROVED_CONTENT' }
      const deniedReviewerProvider = vi.fn(async () => ({ ok: true, publicationId: ID(800), versionId, manifestVersion: 'm1', publicUrl: 'https://learn.dealer.example/guide' }))
      expect(await content('marketing_publish_content_version', args, {
        publish: deniedReviewerProvider,
        requireReviewer: async () => { throw Object.assign(new Error('Reviewer revoked'), { statusCode: 403 }) }
      })).toMatchObject({ ok: false, code: 'forbidden' })
      expect(deniedReviewerProvider).not.toHaveBeenCalled()
      const portalId = ID(900)
      await h.client!.query('INSERT INTO client_users(id,client_id,status,can_approve_work) VALUES($1,$2,\'suspended\',true)', [portalId, CLIENT])
      await h.client!.query('UPDATE search_authority_approval_decisions SET decided_by=NULL, decided_by_client_user_id=$1, actor_type=\'portal\' WHERE version_id=$2', [portalId, versionId])
      expect(await content('marketing_publish_content_version', args, { publish: deniedReviewerProvider })).toMatchObject({ ok: false, code: 'forbidden' })
      expect(deniedReviewerProvider).not.toHaveBeenCalled()
      await h.client!.query('UPDATE client_users SET status=\'active\',can_approve_work=false WHERE id=$1', [portalId])
      expect(await content('marketing_publish_content_version', args, { publish: deniedReviewerProvider })).toMatchObject({ ok: false, code: 'forbidden' })
      await h.client!.query('UPDATE client_users SET can_approve_work=true WHERE id=$1', [portalId])
      expect(await content('marketing_publish_content_version', args, { publish: deniedReviewerProvider })).toMatchObject({ ok: true, data: { status: 'published' } })
      await h.client!.query('UPDATE search_authority_approval_decisions SET decided_by=$1, decided_by_client_user_id=NULL, actor_type=\'agency\' WHERE version_id=$2', [OUTSIDER, versionId])
      let providerWrites = 0
      const changedBeforeDispatch = vi.fn(async (_e: unknown, input: { onDispatchStart?: () => Promise<void> | void }) => {
        await h.client!.query('UPDATE search_authority_content_assets SET status=\'draft\' WHERE id=$1', [assetId])
        await input.onDispatchStart?.()
        providerWrites++
        throw new Error('unreachable provider')
      })
      expect(await content('marketing_publish_content_version', args, { publish: changedBeforeDispatch })).toMatchObject({ ok: false, code: 'conflict' })
      expect(providerWrites).toBe(0)
      await h.client!.query('UPDATE search_authority_content_assets SET status=\'approved\' WHERE id=$1', [assetId])
      const definite = vi.fn(async () => Promise.reject(Object.assign(new Error('x'), { statusCode: 503, statusMessage: 'Publication storage is unavailable' })))
      const k1 = key()
      expect(await content('marketing_publish_content_version', args, { publish: definite }, k1)).toMatchObject({ ok: false, code: 'unavailable' })
      expect((await h.client!.query('SELECT state FROM god_mode_execution_ledger WHERE idempotency_key = $1', [k1])).rows[0].state).toBe('failed')
      expect(await content('marketing_publish_content_version', args, { publish: definite }, k1)).toMatchObject({ ok: false, code: 'failed' })
      const interrupted = vi.fn(async (_e: unknown, input: { onDispatchStart?: () => Promise<void> | void }) => {
        await input.onDispatchStart?.()
        throw new Error('R2 timeout')
      })
      const k2 = key()
      expect(await content('marketing_publish_content_version', args, { publish: interrupted }, k2)).toMatchObject({ ok: false, code: 'reconciliation_required' })
      expect((await h.client!.query('SELECT state FROM god_mode_execution_ledger WHERE idempotency_key = $1', [k2])).rows[0].state).toBe('ambiguous')
      expect(await content('marketing_publish_content_version', args, { publish: interrupted }, k2)).toMatchObject({ ok: false, code: 'reconciliation_required' })
      expect(interrupted).toHaveBeenCalledTimes(1)
      Object.assign(h.authority, { allowCalls: 1, calls: 0 })
      const revokedBeforeDispatch = vi.fn()
      const k0 = key()
      expect(await content('marketing_publish_content_version', args, { publish: revokedBeforeDispatch }, k0)).toMatchObject({ ok: false, code: 'forbidden' })
      expect(revokedBeforeDispatch).not.toHaveBeenCalled()
      expect((await h.client!.query('SELECT state FROM god_mode_execution_ledger WHERE idempotency_key = $1', [k0])).rows[0].state).toBe('failed')
      Object.assign(h.authority, { allowCalls: Infinity, calls: 0 })
      const publish = vi.fn(async (_e: unknown, input: { expectedVersionId?: string, actorId: string }) => ({ ok: true as const, publicationId: ID(800), versionId: input.expectedVersionId!, manifestVersion: 'm1', publicUrl: 'https://learn.dealer.example/guides/cannon-alpha-towing' }))
      const k3 = key()
      expect(await content('marketing_publish_content_version', { ...args, expectedContentHash: 'c'.repeat(64) }, { publish })).toMatchObject({ ok: false, code: 'conflict' })
      expect(publish).not.toHaveBeenCalled()
      expect(await content('marketing_publish_content_version', args, { publish }, k3)).toMatchObject({ ok: true, data: { status: 'published', publicationId: ID(800) } })
      expect(publish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ clientId: CLIENT, assetId, actorId: ACTOR, expectedVersionId: versionId }))
      expect(await content('marketing_publish_content_version', args, { publish }, k3)).toMatchObject({ ok: true, data: { replayed: true } })
      expect(publish).toHaveBeenCalledTimes(1)
    })
  })
})
