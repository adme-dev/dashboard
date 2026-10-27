declare module 'gifenc' {
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, options: {
      palette: number[][]
      delay: number
      repeat: number
    }): void
    finish(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
  }
  export function quantize(bytes: Uint8Array, maxColors: number): number[][]
  export function applyPalette(bytes: Uint8Array, palette: number[][]): Uint8Array
}
declare module 'pngjs/lib/png-sync.js' {
  const codec: typeof import('pngjs').PNG.sync
  export default codec
}
