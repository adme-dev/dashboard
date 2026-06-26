export class Container {
  readonly __vitestMock = true
}

export function getContainer(...args: unknown[]) {
  const mock = (globalThis as typeof globalThis & {
    __cloudflareContainersGetContainer?: (...args: unknown[]) => unknown
  }).__cloudflareContainersGetContainer
  if (typeof mock !== 'function') {
    throw new Error('Cloudflare container mock is not configured')
  }
  return mock(...args)
}

export function getRandom(...args: unknown[]) {
  return getContainer(...args)
}

export function loadBalance(...args: unknown[]) {
  return getContainer(...args)
}

export function switchPort(request: Request) {
  return request
}

export function outboundParams(_handler: unknown, params: unknown) {
  return params
}

export class ContainerProxy {
  readonly __vitestMock = true
}
