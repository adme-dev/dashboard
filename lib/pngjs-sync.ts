import sync from 'pngjs/lib/png-sync.js'

interface PngOptions {
  width?: number
  height?: number
}

export class PNG {
  static sync = sync

  width: number
  height: number
  data: Buffer
  gamma = 0

  constructor(options: PngOptions = {}) {
    this.width = options.width! | 0
    this.height = options.height! | 0
    this.data = this.width > 0 && this.height > 0
      ? Buffer.alloc(4 * this.width * this.height)
      : null as unknown as Buffer
  }
}
