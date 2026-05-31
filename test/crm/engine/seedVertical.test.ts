// test/crm/engine/seedVertical.test.ts
import { describe, it, expect } from 'vitest'
import { planSeedInserts, type ObjectTemplate } from '~~/server/utils/crm/engine/seedVertical'

const templates: ObjectTemplate[] = [
  {
    object_key: 'order', label: 'Order', label_plural: 'Orders', icon: 'i-lucide-cart',
    has_pipeline: true, position: 2,
    fields: [{ key: 'reference', label: 'Reference', field_type: 'text', options: [], relation_target: null, is_required: true, is_title: true, position: 1 }],
    stages: [{ code: 'new', name: 'New', probability: 10, sort_order: 1, color: '#94a3b8', is_won: false, is_lost: false }],
  },
]

describe('planSeedInserts', () => {
  it('produces one object, its fields, and its stages for a client', () => {
    const plan = planSeedInserts('client-1', 'retail', templates)
    expect(plan.objects).toHaveLength(1)
    expect(plan.objects[0]).toMatchObject({ client_id: 'client-1', vertical_key: 'retail', key: 'order', has_pipeline: true })
    expect(plan.fieldsByObjectKey.order).toHaveLength(1)
    expect(plan.fieldsByObjectKey.order[0]).toMatchObject({ key: 'reference', is_title: true })
    expect(plan.stagesByObjectKey.order).toHaveLength(1)
    expect(plan.stagesByObjectKey.order[0]).toMatchObject({ code: 'new', client_id: 'client-1' })
  })

  it('omits stages for non-pipeline objects', () => {
    const plan = planSeedInserts('c1', 'retail', [{ ...templates[0], has_pipeline: false, stages: [] }])
    expect(plan.stagesByObjectKey.order ?? []).toHaveLength(0)
  })
})
