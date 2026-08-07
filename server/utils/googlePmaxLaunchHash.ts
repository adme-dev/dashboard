import { createHash } from 'node:crypto'

export class GooglePmaxLaunchJsonError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GooglePmaxLaunchJsonError'
  }
}

function canonicalize(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new GooglePmaxLaunchJsonError('Launch JSON numbers must be finite.')
    return value
  }
  if (Array.isArray(value)) {
    if (value.length > 131_072) {
      throw new GooglePmaxLaunchJsonError('Launch JSON arrays exceed the safe item limit.')
    }
    if (seen.has(value)) throw new GooglePmaxLaunchJsonError('Launch JSON cannot contain cycles.')
    seen.add(value)
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const ownKeys = Reflect.ownKeys(value)
    if (ownKeys.some(key => typeof key === 'symbol')) {
      throw new GooglePmaxLaunchJsonError('Launch JSON arrays cannot contain symbol keys.')
    }
    const dataKeys = ownKeys.filter(key => key !== 'length') as string[]
    if (dataKeys.length !== value.length || dataKeys.some((key, index) => key !== String(index))) {
      throw new GooglePmaxLaunchJsonError('Launch JSON arrays must be dense and cannot contain extra properties.')
    }
    const result = dataKeys.map((key) => {
      const descriptor = descriptors[key]
      if (!descriptor?.enumerable || !('value' in descriptor)) {
        throw new GooglePmaxLaunchJsonError('Launch JSON arrays must contain only enumerable data properties.')
      }
      return canonicalize(descriptor.value, seen)
    })
    seen.delete(value)
    return result
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>
    const prototype = Object.getPrototypeOf(object)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new GooglePmaxLaunchJsonError('Launch JSON must contain only plain objects.')
    }
    if (seen.has(object)) throw new GooglePmaxLaunchJsonError('Launch JSON cannot contain cycles.')
    seen.add(object)
    const descriptors = Object.getOwnPropertyDescriptors(object)
    if (Reflect.ownKeys(object).some(key => typeof key === 'symbol')) {
      throw new GooglePmaxLaunchJsonError('Launch JSON cannot contain symbol keys.')
    }
    for (const descriptor of Object.values(descriptors)) {
      if (!descriptor.enumerable || !('value' in descriptor)) {
        throw new GooglePmaxLaunchJsonError('Launch JSON objects must contain only enumerable data properties.')
      }
    }
    const result = Object.fromEntries(
      Object.entries(descriptors)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, descriptor]) => [key, canonicalize(descriptor.value, seen)])
    )
    seen.delete(object)
    return result
  }
  throw new GooglePmaxLaunchJsonError(`Launch JSON cannot contain ${typeof value}.`)
}

export function serializeCanonicalLaunchJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, new WeakSet()))
}

export function hashCanonicalLaunchJson(value: unknown): string {
  return hashSerializedCanonicalLaunchJson(serializeCanonicalLaunchJson(value))
}

export function hashSerializedCanonicalLaunchJson(serialized: string): string {
  return createHash('sha256').update(serialized).digest('hex')
}
