import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = 'server/database/migrations/342_board_knowledge.sql'

describe('board knowledge migration', () => {
  it('creates governed source, chunk, and audit records without destructive schema changes', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS board_knowledge_submissions/i)
    expect(sql).toMatch(/\(board_file_id IS NOT NULL\)::int\s*\+\s*\(task_attachment_id IS NOT NULL\)::int\s*=\s*1/i)
    expect(sql).toMatch(/source_deleted_at IS NOT NULL[\s\S]*board_file_id IS NULL[\s\S]*task_attachment_id IS NULL/i)
    expect(sql).toMatch(/board_file_id UUID REFERENCES board_files\(id\) ON DELETE SET NULL/i)
    expect(sql).toMatch(/task_attachment_id UUID REFERENCES task_attachments\(id\) ON DELETE SET NULL/i)
    expect(sql).toMatch(/source_type TEXT NOT NULL[\s\S]*source_entity_id UUID NOT NULL/i)
    expect(sql).toMatch(/source_type IN \('board_file', 'task_attachment'\)/i)
    expect(sql).toMatch(/review_status IN \('pending', 'approved', 'rejected', 'archived'\)/i)
    expect(sql).toMatch(/extraction_status IN \('queued', 'processing', 'ready', 'failed'\)/i)
    expect(sql).toMatch(/index_status IN \('not_indexed', 'queued', 'indexing', 'indexed', 'failed', 'removed'\)/i)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_board_knowledge_source_version[\s\S]*department_id,[\s\S]*source_type,[\s\S]*source_entity_id,[\s\S]*source_version_key/i)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_board_knowledge_one_approved_board_file[\s\S]*WHERE board_file_id IS NOT NULL AND review_status = 'approved'/i)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_board_knowledge_one_approved_task_attachment[\s\S]*WHERE task_attachment_id IS NOT NULL AND review_status = 'approved'/i)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ai_knowledge_chunks/i)
    expect(sql).toMatch(/UNIQUE \(article_id, chunk_index\)/i)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS board_knowledge_audit/i)
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_board_knowledge_audit_submission/i)
    expect(sql).toMatch(/ALTER TABLE ai_knowledge_articles[\s\S]*ADD COLUMN IF NOT EXISTS department_id/i)
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX)\b/i)
  })
})
