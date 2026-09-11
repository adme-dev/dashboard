// The package root also loads Node PNG/file renderers. SVG generation needs only
// the pure matrix encoder, which can be bundled without undeployed Worker modules.
import QRCode from 'qrcode/lib/core/qrcode.js'

export type EcLevel = 'L' | 'M' | 'Q' | 'H'
export interface QrMatrix { size: number, get(r: number, c: number): boolean }

export function buildMatrix(text: string, ec: EcLevel): QrMatrix {
  const q = QRCode.create(text, { errorCorrectionLevel: ec })
  const size = q.modules.size
  const data = q.modules.data as Uint8Array
  return { size, get: (r, c) => r >= 0 && c >= 0 && r < size && c < size && data[r * size + c] === 1 }
}
