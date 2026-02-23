import dotenv from 'dotenv'
dotenv.config()

import { $fetch } from 'ofetch'

async function testAPI() {
  const baseURL = 'http://localhost:3000'
  
  try {
    console.log('Testing /api/admin/teams...')
    const teams = await $fetch(`${baseURL}/api/admin/teams`)
    console.log(`✅ Success! Found ${teams.teams?.length || 0} teams`)
    console.log('First team:', teams.teams?.[0])
  } catch (err: any) {
    console.error('❌ Teams API error:', err.message)
    if (err.data) console.error('Error details:', err.data)
  }
  
  console.log('\n')
  
  try {
    console.log('Testing /api/admin/users...')
    const users = await $fetch(`${baseURL}/api/admin/users`)
    console.log(`✅ Success! Found ${users.users?.length || 0} users`)
    console.log('First user:', users.users?.[0]?.name)
  } catch (err: any) {
    console.error('❌ Users API error:', err.message)
    if (err.data) console.error('Error details:', err.data)
  }
}

testAPI()
