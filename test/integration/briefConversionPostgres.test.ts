import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pool, type PoolClient } from 'pg'

// Opt-in, isolated local PostgreSQL only. Never reads DATABASE_URL or production credentials.
const enabled = process.env.XF_LOCAL_WORKFLOW_TESTS === '1'
const pool = new Pool({ host: '127.0.0.1', port: 55473, user: 'xf_workflow_test', database: 'postgres', max: 8 })
const schema = `workflow_test_${process.pid}`
let beforeLock: (() => Promise<void>) | undefined
async function connection() {
  const client = await pool.connect()
  await client.query(`SET search_path TO ${schema}, public`)
  return client
}
async function rows(sql: string, params?: unknown[]) {
  const client = await connection()
  try {
    return (await client.query(sql, params)).rows
  } finally {
    client.release()
  }
}
async function one(sql: string, params?: unknown[]) {
  return (await rows(sql, params))[0] || null
}
vi.mock('~~/server/utils/db', () => ({
  queryOne: (sql: string, params: unknown[]) => one(sql, params),
  queryOneFresh: (sql: string, params: unknown[]) => one(sql, params),
  queryRows: (sql: string, params: unknown[]) => rows(sql, params),
  queryRowsFresh: (sql: string, params: unknown[]) => rows(sql, params),
  execute: (sql: string, params: unknown[]) => rows(sql, params),
  transaction: async (fn: (client: PoolClient) => Promise<unknown>) => {
    if (beforeLock) {
      const hook = beforeLock
      beforeLock = undefined
      await hook()
    }
    const client = await connection()
    await client.query('BEGIN')
    try {
      const value = await fn(client)
      await client.query('COMMIT')
      return value
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}))
vi.mock('~~/server/utils/notifications', () => ({ notifyTaskAssigned: vi.fn().mockResolvedValue(undefined) }))
vi.mock('~~/server/utils/briefNotifications', () => ({ notifyBriefConverted: vi.fn().mockResolvedValue(undefined) }))
const { saveProjectTemplateTask, templateTaskInput } = await import('~~/server/utils/projectTemplateTasks')
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: vi.fn().mockResolvedValue({ id: 'manager' }) }))
Object.assign(globalThis, { defineEventHandler: <T>(handler: T) => handler, getRouterParam: () => 'organic', readBody: async (event: { body: unknown }) => event.body })
const { default: useTemplate } = await import('~~/server/api/agency/templates/[id]/use.post')
const { convertBriefToProject } = await import('~~/server/utils/briefConversion')

describe.skipIf(!enabled)('brief conversion with real local PostgreSQL', () => {
  beforeAll(async () => {
    await pool.query(`CREATE SCHEMA ${schema}`)
    await rows(`
      CREATE TABLE agency_clients (id text PRIMARY KEY, name text);
      CREATE TABLE brief_templates (id text PRIMARY KEY, project_template_id text, slug text, field_mapping jsonb, auto_convert_on_approval boolean, auto_assign_department text);
      CREATE TABLE briefs (id text PRIMARY KEY, title text, reference_number text, client_id text, status text, converted_to_project_id text, template_id text, requested_deadline date, budget_min numeric, budget_max numeric, budget_currency text, quote_id text, assigned_to text, updated_at timestamptz DEFAULT NOW(), converted_at timestamptz, auto_project_created boolean);
      CREATE TABLE template_usage_history (template_id text, project_id text, used_by text);
      CREATE TABLE project_templates (id text PRIMARY KEY, name text, department_id text, is_active boolean DEFAULT true, estimated_duration_days int, default_budget_type text, default_budget_amount numeric, times_used int DEFAULT 0, last_used_at timestamptz, updated_at timestamptz DEFAULT NOW());
      CREATE TABLE template_tasks (id text PRIMARY KEY, template_id text, phase_id text, sort_order int, title text, description text, default_department_id text, default_assignee_id text, default_role text, priority text, task_type text, estimated_hours numeric, start_day_offset int, duration_days int, depends_on_task_ids text[], parent_task_id text, checklist jsonb, billable boolean, updated_at timestamptz DEFAULT NOW());
      CREATE TABLE departments (id text PRIMARY KEY, is_active boolean DEFAULT true, sort_order int, created_at timestamptz DEFAULT NOW());
      CREATE TABLE task_statuses (id text PRIMARY KEY, department_id text, is_default boolean);
      CREATE TABLE projects (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, name text, created_at timestamptz DEFAULT NOW(), client_id text, status text, budget_type text, budget_amount numeric, start_date date, end_date date, project_manager_id text, description text);
      CREATE TABLE tasks (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, project_id text REFERENCES projects(id), department_id text, status_id text, title text, description text, priority text, task_type text CHECK (task_type IN ('task','milestone','bug','feature','review','meeting')), estimated_hours numeric, due_date date, start_date date, last_modified_by text, reporter_id text, assignee_id text, brief_id text, budget_source text, quote_line_item_id text, estimated_cost numeric, billing_rate numeric, parent_task_id text REFERENCES tasks(id), is_billable boolean);
      CREATE TABLE task_dependencies (task_id text REFERENCES tasks(id), depends_on_task_id text REFERENCES tasks(id), dependency_type text, UNIQUE(task_id, depends_on_task_id));
      CREATE TABLE brief_activities (brief_id text, user_id text, activity_type text, new_value jsonb, content text);
      CREATE TABLE brief_template_fields (id text, field_key text);
      CREATE TABLE brief_field_values (brief_id text, field_id text, value jsonb);
    `)
  })
  beforeEach(async () => {
    beforeLock = undefined
    await rows(`TRUNCATE task_dependencies, tasks, projects, briefs, brief_templates, agency_clients, project_templates, template_tasks, departments, task_statuses, brief_activities, brief_template_fields, brief_field_values CASCADE;
      INSERT INTO agency_clients VALUES ('product', 'DriveAgent'), ('news', 'DriveAgent News');
      INSERT INTO brief_templates VALUES ('intake', 'organic', 'social-content', '{"audience":"targetAudience"}', false, 'social');
      INSERT INTO briefs (id,title,client_id,status,template_id) VALUES ('brief','Product introduction','product','approved','intake');
      INSERT INTO project_templates(id,name,estimated_duration_days,department_id) VALUES ('organic','Organic social video',7,'social');
      INSERT INTO departments(id) VALUES ('social');
      INSERT INTO task_statuses VALUES ('todo','social',true);
      INSERT INTO brief_template_fields VALUES ('audience','audience');
      INSERT INTO brief_field_values VALUES ('brief','audience','"Dealership managers"');
    `)
    for (let stage = 1; stage <= 6; stage++) {
      const prerequisites = stage === 1 ? [] : stage === 3 ? ['stage1'] : stage === 4 ? ['stage2', 'stage3'] : [`stage${stage - 1}`]
      await rows(`INSERT INTO template_tasks(id,template_id,sort_order,title,description,start_day_offset,duration_days,depends_on_task_ids,checklist,billable) VALUES ($1,'organic',$2,$3,$4,$2,1,$5,'["Acceptance recorded"]',false)`, [`stage${stage}`, stage, `Stage ${stage}`, `Criteria ${stage}`, prerequisites])
    }
  })
  afterAll(async () => {
    await pool.query(`DROP SCHEMA ${schema} CASCADE`)
    await pool.end()
  })
  const convert = (extra = {}) => convertBriefToProject({ briefId: 'brief', userId: 'manager', startDate: '2026-10-03', ...extra })
  it('creates six linked tasks with all six prerequisite edges and brief strategy', async () => {
    const result = await convert()
    expect(result.tasksCreated).toBe(6)
    const tasks = await rows('SELECT * FROM tasks ORDER BY title')
    expect(tasks).toHaveLength(6)
    expect(tasks.every(t => t.brief_id === 'brief' && t.project_id === result.project.id)).toBe(true)
    expect((await one('SELECT * FROM projects')).description).toContain('Dealership managers')
    expect(await rows('SELECT * FROM task_dependencies')).toHaveLength(6)
    expect(tasks.every(t => t.description.includes('Acceptance recorded'))).toBe(true)
    expect(tasks.every(t => t.is_billable === false)).toBe(true)
  })
  it('also preserves dependencies through the direct Use Template route', async () => {
    const result = await useTemplate({ body: { clientId: 'product', projectName: 'Direct job', startDate: '2026-10-03' } } as never)
    expect(result.tasksCreated).toBe(6)
    expect(await rows('SELECT * FROM task_dependencies')).toHaveLength(6)
    expect((await one('SELECT * FROM tasks WHERE title=\'Stage 1\'')).description).toContain('Acceptance recorded')
  })
  it('rolls back the direct route when a prerequisite is invalid', async () => {
    await rows('UPDATE template_tasks SET depends_on_task_ids=ARRAY[\'foreign\'] WHERE id=\'stage2\'')
    await expect(useTemplate({ body: { clientId: 'product', projectName: 'Invalid job' } } as never)).rejects.toMatchObject({ statusCode: 422 })
    expect(await rows('SELECT * FROM projects')).toHaveLength(0)
  })
  it('maps approval and deliverable templates to valid workflow task types', async () => {
    await rows('UPDATE template_tasks SET task_type=\'approval\' WHERE id=\'stage4\'')
    await rows('UPDATE template_tasks SET task_type=\'deliverable\' WHERE id=\'stage3\'')
    await convert()
    expect((await one('SELECT task_type FROM tasks WHERE title=\'Stage 4\'')).task_type).toBe('review')
    expect((await one('SELECT task_type FROM tasks WHERE title=\'Stage 3\'')).task_type).toBe('task')
  })
  it('preserves parent links and zero-day milestones with actual start dates', async () => {
    await rows('UPDATE template_tasks SET parent_task_id=\'stage1\', duration_days=0 WHERE id=\'stage2\'')
    await convert()
    const first = await one('SELECT * FROM tasks WHERE title=\'Stage 1\'')
    const second = await one('SELECT * FROM tasks WHERE title=\'Stage 2\'')
    expect(second.parent_task_id).toBe(first.id)
    expect(second.start_date).toEqual(second.due_date)
    expect(second.start_date.getDate()).toBe(5)
  })
  it('honours explicit project-only selection even when an intake template is mapped', async () => {
    const result = await convert({ projectTemplateId: null })
    expect(result.tasksCreated).toBe(0)
    expect(await rows('SELECT * FROM tasks')).toHaveLength(0)
  })
  it('rolls back empty job templates', async () => {
    await rows('DELETE FROM template_tasks')
    await expect(convert()).rejects.toMatchObject({ statusCode: 422 })
    expect(await rows('SELECT * FROM projects')).toHaveLength(0)
  })
  it('allows only one project when conversion requests arrive together', async () => {
    const results = await Promise.allSettled([convert(), convert()])
    expect(await rows('SELECT * FROM projects')).toHaveLength(1)
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const rejection = results.find(r => r.status === 'rejected') as PromiseRejectedResult
    expect(rejection.reason.statusCode).toBe(409)
  })
  it('also prevents duplicate project-only conversion', async () => {
    await rows('UPDATE brief_templates SET project_template_id = NULL')
    await Promise.allSettled([convert(), convert()])
    expect(await rows('SELECT * FROM projects')).toHaveLength(1)
    expect(await rows('SELECT * FROM brief_activities')).toHaveLength(1)
  })
  it('rechecks approval while holding the brief lock', async () => {
    beforeLock = async () => {
      await rows('UPDATE briefs SET status=\'rejected\', updated_at=NOW()')
    }
    await expect(convert()).rejects.toMatchObject({ statusCode: 409 })
    expect(await rows('SELECT * FROM projects')).toHaveLength(0)
  })
  it('rejects cross-client overrides instead of moving the job into News', async () => {
    await expect(convert({ clientId: 'news' })).rejects.toMatchObject({ statusCode: 400 })
    expect(await rows('SELECT * FROM projects')).toHaveLength(0)
  })
  it('rolls back invalid cross-template prerequisites', async () => {
    await rows('UPDATE template_tasks SET depends_on_task_ids=ARRAY[\'other-template-task\'] WHERE id=\'stage4\'')
    await expect(convert()).rejects.toMatchObject({ statusCode: 422 })
    expect(await rows('SELECT * FROM projects')).toHaveLength(0)
    expect(await rows('SELECT * FROM tasks')).toHaveLength(0)
  })
  it('authors a reusable task and rejects edits from stale template revisions', async () => {
    const revision = (await one('SELECT updated_at::text AS revision FROM project_templates WHERE id=\'organic\'')).revision
    const input = templateTaskInput.parse({ expectedRevision: revision, title: 'Customer review', description: 'Approve current copy and media', defaultDepartmentId: null })
    const created = await saveProjectTemplateTask('organic', input)
    expect((await one('SELECT * FROM template_tasks WHERE id=$1', [created.id])).description).toBe('Approve current copy and media')
    await expect(saveProjectTemplateTask('organic', { ...input, title: 'Stale overwrite' })).rejects.toMatchObject({ statusCode: 409 })
    await saveProjectTemplateTask('organic', { ...input, taskId: created.id, expectedRevision: created.revision, title: 'Final customer review' })
    expect((await one('SELECT * FROM template_tasks WHERE id=$1', [created.id])).title).toBe('Final customer review')
  })
  it('rejects editing a task from another template and rolls back its revision', async () => {
    const revision = (await one('SELECT updated_at::text AS revision FROM project_templates WHERE id=\'organic\'')).revision
    const input = templateTaskInput.parse({ taskId: '00000000-0000-4000-8000-000000000001', expectedRevision: revision, title: 'Wrong task', defaultDepartmentId: null })
    await expect(saveProjectTemplateTask('organic', input)).rejects.toMatchObject({ statusCode: 404 })
    expect((await one('SELECT updated_at::text AS revision FROM project_templates WHERE id=\'organic\'')).revision).toBe(revision)
  })
  it('rejects invalid project dates before writing anything', async () => {
    await expect(convert({ startDate: '2026-02-30' })).rejects.toMatchObject({ statusCode: 400 })
    expect(await rows('SELECT * FROM projects')).toHaveLength(0)
  })
  it('rejects dependency cycles', async () => {
    await rows('UPDATE template_tasks SET depends_on_task_ids=ARRAY[\'stage6\'] WHERE id=\'stage1\'')
    await expect(convert()).rejects.toMatchObject({ statusCode: 422 })
  })
})
