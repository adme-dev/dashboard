import dotenv from 'dotenv'
dotenv.config()

import { MondayClient } from '../server/utils/mondayClient'

async function checkTitles() {
  const apiToken = process.env.MONDAY_API_TOKEN
  if (!apiToken) {
    console.error('❌ MONDAY_API_TOKEN not found')
    process.exit(1)
  }

  const client = new MondayClient(apiToken)

  const query = `
    query {
      users(limit: 500) {
        id
        name
        email
        title
        photo_thumb
      }
    }
  `
  
  const data = await (client as any)['request']<{ users: Array<{
    id: string
    name: string
    email: string
    title?: string
    photo_thumb?: string
  }> }>(query)
  
  console.log('👥 Monday.com Users with Titles:\n')
  console.log('─'.repeat(80))
  
  for (const user of data.users) {
    const title = user.title || '(no title)'
    console.log(`${user.name}: ${title}`)
  }
  
  console.log('─'.repeat(80))
  console.log(`\nTotal: ${data.users.length} users`)
}

checkTitles().catch(console.error)
