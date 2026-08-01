import { resolve } from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { buildExportFile, EXPORT_COLUMNS } from '~~/server/utils/crm/exportRecords'

describe('CRM export bundle', () => {
  it('keeps the isolated server export implementation below 200 KiB', async () => {
    const result = await build({
      entryPoints: [resolve(process.cwd(), 'server/utils/crm/exportRecords.ts')],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'esm',
      minify: true,
      external: ['~~/*'],
      logLevel: 'silent'
    })

    const bundledBytes = result.outputFiles.reduce((total, file) => total + file.contents.byteLength, 0)
    expect(bundledBytes).toBeLessThanOrEqual(200 * 1024)
  })

  it('produces a readable workbook with ordered columns and flattened tags', async () => {
    const file = await buildExportFile('people', [{
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      tags: ['priority', 'newsletter'],
      created_at: '2026-08-01T00:00:00.000Z'
    }], 'xlsx')

    expect(Buffer.isBuffer(file.body)).toBe(true)
    const workbook = XLSX.read(file.body, { type: 'buffer' })
    const sheet = workbook.Sheets.CRM
    expect(sheet).toBeDefined()
    expect(XLSX.utils.sheet_to_json(sheet!, { header: 1 })[0]).toEqual(EXPORT_COLUMNS.people)
    expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!)[0]).toMatchObject({
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      tags: 'priority; newsletter'
    })
  })
})
