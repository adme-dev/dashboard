/**
 * Analyze the Support board structure from Monday.com
 */

import { createMondayClient } from '../server/utils/mondayClient'

async function analyzeSupportBoard() {
  console.log('🔍 Analyzing Monday.com Support board...\n')
  
  try {
    const client = await createMondayClient()
    
    // Get all boards and find Support
    const boards = await client.getBoards({ limit: 500 })
    const supportBoard = boards.find(b => b.name === 'Support')
    
    if (!supportBoard) {
      console.log('❌ Support board not found')
      console.log('Available boards:', boards.filter(b => b.state === 'active').slice(0, 20).map(b => b.name))
      return
    }
    
    console.log('✅ Found Support board:', supportBoard.id)
    console.log('\n📊 Board Structure:')
    console.log('===================')
    
    // Show groups
    console.log('\n📁 Groups:')
    supportBoard.groups?.forEach((g: any) => {
      console.log(`  • ${g.title} (ID: ${g.id}, Color: ${g.color})`)
    })
    
    // Show columns
    console.log('\n📋 Columns:')
    supportBoard.columns?.forEach((c: any) => {
      console.log(`  • ${c.title} (Type: ${c.type}, ID: ${c.id})`)
    })
    
    // Get items with full details
    console.log('\n📦 Fetching items...')
    const itemsResult = await client.getItems(supportBoard.id, { limit: 100 })
    const items = itemsResult.items
    
    console.log(`\n✅ Found ${items.length} items`)
    
    // Group items by their group
    const itemsByGroup = new Map<string, any[]>()
    for (const item of items) {
      const groupTitle = item.group_title || 'No Group'
      if (!itemsByGroup.has(groupTitle)) {
        itemsByGroup.set(groupTitle, [])
      }
      itemsByGroup.get(groupTitle)!.push(item)
    }
    
    console.log('\n📊 Items by Group:')
    console.log('===================')
    itemsByGroup.forEach((items, groupName) => {
      console.log(`\n📁 ${groupName} (${items.length} items):`)
      items.slice(0, 3).forEach((item: any) => {
        console.log(`  • ${item.name}`)
        // Show column values
        item.column_values?.forEach((cv: any) => {
          if (cv.text) {
            console.log(`    - ${cv.title}: ${cv.text}`)
          }
        })
      })
      if (items.length > 3) {
        console.log(`    ... and ${items.length - 3} more`)
      }
    })
    
  } catch (error: any) {
    console.error('❌ Error:', error.message)
  }
}

analyzeSupportBoard()
