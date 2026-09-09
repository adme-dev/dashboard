// Repair the initial bulk Google import, which attached unrelated locations to Geelong GWM.
// Dry-run by default. No existing review/post/metric history is moved.
import pg from 'pg'
const expectedClients = new Map([
  ['Geelong GWM Haval', 'Geelong GWM Haval'],
  ['Chery Ferntree Gully', 'Ferntree Gully Automotive'],
  ['Courtney & Patterson Ford - Service', 'Courtney & Patterson Ford'],
  ['Frankston GMSV', 'Frankston Motor Group'],
  ['Gendore Tractors & Machinery', 'Gendore Tractors And Machinery'],
  ['Gendore Tractors & Machinery - Leongatha', 'Gendore Tractors And Machinery'],
  ['Gendore Tractors & Machinery - Tooradin', 'Gendore Tractors And Machinery'],
  ['Kevin Dennis Volkswagen', 'Kevin Dennis Motor Group'],
  ['Kevin Dennis ŠKODA', 'Kevin Dennis Motor Group'],
  ['Kevin Dennis Škoda & GMSV', 'Kevin Dennis Motor Group'],
  ['McRae LDV', 'McRae Motors'],
  ['Mornington Ford', 'Mornington Motor Group'],
])
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const apply = process.argv.includes('--apply')
const db = new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:30_000})
await db.connect()
try {
  await db.query('BEGIN')
  await db.query("SET LOCAL lock_timeout = '5s'")
  await db.query("SET LOCAL statement_timeout = '15s'")
  // Posts reference accounts in arrays/JSON, so account-row locks alone cannot stop
  // a concurrent writer attaching a post between the history check and repair.
  if (apply) await db.query('LOCK TABLE social_posts IN SHARE ROW EXCLUSIVE MODE')
  const {rows:accounts} = await db.query(`SELECT a.id,a.client_id,a.account_name,c.name AS current_client
    FROM social_accounts a JOIN agency_clients c ON c.id=a.client_id
    WHERE a.platform='google-business' AND a.is_active=true ${apply ? 'FOR UPDATE OF a' : ''}`)
  const {rows:clients} = await db.query('SELECT id,name FROM agency_clients WHERE is_active=true AND name=ANY($1::text[])', [[...new Set(expectedClients.values())]])
  const changes = []
  for (const account of accounts) {
    const name = expectedClients.get(account.account_name)
    if (!name) throw new Error(`Unmapped Google location: ${account.account_name}`)
    const targets = clients.filter(client => client.name === name)
    if (targets.length !== 1) throw new Error(`Expected exactly one active client: ${name}`)
    if (account.client_id === targets[0].id) continue
    if (account.current_client !== 'Geelong GWM Haval') throw new Error(`Assignment changed since audit: ${account.account_name}`)
    const {rows:[history]} = await db.query(`SELECT
      (SELECT count(*) FROM social_conversations WHERE social_account_id=$1) +
      (SELECT count(*) FROM social_account_metrics WHERE social_account_id=$1) +
      (SELECT count(*) FROM social_publishing_audit_events WHERE social_account_id=$1) +
      (SELECT count(*) FROM social_posts WHERE $1::uuid=ANY(account_ids) OR publish_targets::text LIKE $2) AS count`, [account.id,`%${account.id}%`])
    if (Number(history.count)) throw new Error(`Linked history requires separate review: ${account.account_name}`)
    changes.push({account,client:targets[0]})
  }
  console.log(JSON.stringify({apply,changes:changes.map(({account,client})=>({location:account.account_name,from:account.current_client,to:client.name}))},null,2))
  if (apply) {
    for (const {account,client} of changes) {
      await db.query(`UPDATE social_accounts SET client_id=$2,updated_at=NOW(),metadata=metadata ||
        jsonb_build_object('reviewClientAssignmentRepair',jsonb_build_object('previousClientId',$3::text,'previousClientName',$4::text,'repairedAt',NOW()))
        WHERE id=$1`,[account.id,client.id,account.client_id,account.current_client])
    }
    await db.query('COMMIT')
  } else await db.query('ROLLBACK')
  console.log(JSON.stringify({updated:apply ? changes.length : 0}))
} catch (error) {
  await db.query('ROLLBACK')
  throw error
} finally { await db.end() }
