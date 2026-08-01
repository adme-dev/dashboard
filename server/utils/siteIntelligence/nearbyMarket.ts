import type { DealerCategory } from '~~/app/types/site-intelligence'

export interface DealerClassificationInput {
  displayName: string
  primaryType: string | null
  types: string[]
}

const USED_DEALER_SIGNALS = [
  /\bused\b/i,
  /\bpre[- ]?owned\b/i,
  /\bsecond[- ]?hand\b/i,
  /\bpreloved\b/i,
  /\bquality used\b/i,
  /\bwholesale\b/i
]

const AUSTRALIAN_FRANCHISE_ALIASES = [
  'toyota', 'ford', 'hyundai', 'kia', 'mazda', 'mitsubishi', 'nissan', 'volkswagen',
  'subaru', 'honda', 'suzuki', 'isuzu', 'ldv', 'gwm', 'haval', 'byd', 'mg', 'lexus',
  'mercedes', 'bmw', 'audi', 'volvo', 'skoda', 'cupra', 'jeep', 'ram', 'chery', 'jaecoo',
  'renault', 'peugeot', 'citroen', 'fiat', 'alfa romeo', 'land rover', 'range rover'
]

/** Only positive evidence upgrades a candidate; ambiguity stays unclassified. */
export function classifyDealer(input: DealerClassificationInput): DealerCategory {
  const name = input.displayName.trim()
  if (USED_DEALER_SIGNALS.some(signal => signal.test(name))) return 'used'
  const normalised = ` ${name.toLocaleLowerCase('en-AU').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `
  if (AUSTRALIAN_FRANCHISE_ALIASES.some(alias => normalised.includes(` ${alias} `))) return 'franchise_new'
  return 'unclassified'
}

export interface Coordinates {
  latitude: number
  longitude: number
}

/** Great-circle distance in kilometres; callers choose any presentation rounding. */
export function haversineDistanceKm(origin: Coordinates, destination: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = radians(destination.latitude - origin.latitude)
  const longitudeDelta = radians(destination.longitude - origin.longitude)
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(origin.latitude)) * Math.cos(radians(destination.latitude))
    * Math.sin(longitudeDelta / 2) ** 2
  return 6_371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
