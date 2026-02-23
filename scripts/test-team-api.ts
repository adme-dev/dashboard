import dotenv from 'dotenv'
dotenv.config()

import { $fetch } from 'ofetch'

async function testAPI() {
  const baseURL = 'http://localhost:3000'
  const teamId = '00000000-0000-0000-0000-000000000001' // ADME Everyone
  
  try {
    console.log(`Testing /api/admin/teams/${teamId}/members...`)
    const data = await $fetch(`${baseURL}/api/admin/teams/${teamId}/members`)
    console.log(`✅ Success! Found ${data.members?.length || 0} members`)
    console.log('\nFirst 3 members with titles:')
    data.members?.slice(0, 3).forEach((m: any) => {
      console.log(`  - ${m.name}: ${m.title || '(no title)'}`)
    })
  } catch (err: any) {
    console.error('❌ API Error:', err.message)
    if (err.data) console.error('Error details:', err.data)
  }
}

testAPI()
