#!/usr/bin/env node
/**
 * Script to add Paul as super admin
 */

const { Pool } = require('@neondatabase/serverless')

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}

async function addSuperAdmin() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  
  try {
    // Check if user exists
    const checkResult = await pool.query(
      'SELECT id, name, email, user_role AS role, is_active FROM team_members WHERE email = $1',
      ['paul@adme.net.au']
    )
    
    if (checkResult.rows.length > 0) {
      console.log('User already exists:', checkResult.rows[0])
      
      // Update to owner
      const updateResult = await pool.query(
        `UPDATE team_members
         SET user_role = 'owner',
             is_active = true,
             name = 'Paul (Super Admin)',
             updated_at = NOW()
         WHERE email = $1
         RETURNING id, name, email, user_role as role, is_active`,
        ['paul@adme.net.au']
      )
      console.log('✅ Updated to owner:', updateResult.rows[0])
    } else {
      // Create new admin user
      const insertResult = await pool.query(
        `INSERT INTO team_members (name, email, user_role, is_active, created_at, updated_at)
         VALUES ($1, $2, 'owner', true, NOW(), NOW())
         RETURNING id, name, email, user_role as role, is_active`,
        ['Paul (Super Admin)', 'paul@adme.net.au']
      )
      console.log('✅ Created owner:', insertResult.rows[0])
    }
    
    // Verify
    const verifyResult = await pool.query(
      'SELECT id, name, email, user_role AS role, is_active FROM team_members WHERE email = $1',
      ['paul@adme.net.au']
    )
    console.log('\n✅ Verification:')
    console.log(verifyResult.rows[0])
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

addSuperAdmin()
