export default eventHandler(async (event) => {
  const body = await readBody<{ columns: { key: string, label?: string }[], rows: Record<string, any>[] }>(event)
  if (!body?.columns || !body?.rows) {
    throw createError({ statusCode: 400, statusMessage: 'columns and rows required' })
  }

  const header = body.columns.map(c => JSON.stringify(c.label || c.key)).join(',')
  const lines = [header]

  for (const row of body.rows) {
    const line = body.columns.map(c => JSON.stringify(row[c.key] ?? '')).join(',')
    lines.push(line)
  }

  const csv = lines.join('\n')
  setHeader(event, 'Content-Type', 'text/csv')
  setHeader(event, 'Content-Disposition', 'attachment; filename="export.csv"')
  return csv
})
