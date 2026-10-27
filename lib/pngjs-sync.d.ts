declare module 'pngjs/lib/png-sync.js' {
  interface SyncPng {
    width: number
    height: number
    data: Buffer
    gamma?: number
  }

  const sync: {
    read(buffer: Buffer, options?: { checkCRC?: boolean, skipRescale?: boolean }): SyncPng
    write(png: SyncPng, options?: Record<string, unknown>): Buffer
  }

  export default sync
}
