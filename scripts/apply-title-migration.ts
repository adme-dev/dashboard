import dotenv from 'dotenv'
dotenv.config()

import { queryRows } from '../server/utils/db'
import fs from 'fs'

async function migrate() {
  const sql = fs.readFileSync('./server/database/migrations/add_title_column.sql', 'utf8')
  await queryRows(sql)
  console.log('✅ Title column added')
}

migrate().catch(console.error)
