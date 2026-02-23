import dotenv from 'dotenv'
dotenv.config()

import { queryRows } from '../server/utils/db'
import fs from 'fs'
import path from 'path'

async function applyMigration() {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'server/database/migrations/add_monday_user_fields.sql'),
    'utf8'
  )
  
  console.log('Applying migration...')
  await queryRows(sql)
  console.log('✅ Migration applied successfully!')
}

applyMigration().catch(err => {
  console.error('❌ Migration failed:', err)
  process.exit(1)
})
