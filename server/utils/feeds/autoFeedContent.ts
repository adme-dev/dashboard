import type { VehicleSummary } from './types'

export type AutoFeedEventType = 'new' | 'listing'
export type AutoFeedMissingField = 'url' | 'price' | 'image'

export function missingAutoFeedContentFields(vehicle: VehicleSummary): AutoFeedMissingField[] {
  const fields: AutoFeedMissingField[] = []
  if (!vehicle.url) fields.push('url')
  if (!(typeof vehicle.price === 'number' && vehicle.price > 0)) fields.push('price')
  if (!vehicle.image) fields.push('image')
  return fields
}

export function isAutoFeedVehicleReady(vehicle: VehicleSummary): boolean {
  return missingAutoFeedContentFields(vehicle).length === 0
}

export function autoFeedEventType(vehicle: VehicleSummary): AutoFeedEventType {
  return vehicle.condition && /new/i.test(vehicle.condition) ? 'new' : 'listing'
}
