export default eventHandler(async (event) => {
  const query = getQuery(event)
  const type = String(query.type || 'report')
  const when = String(query.when || 'daily')
  // In production, persist schedule into a DB/queue
  return { ok: true, type, when }
})
