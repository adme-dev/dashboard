// The image codec the shared layer helper needs, built from this worker's pure-JS codecs.
import type { LayerCodec } from '../../../server/utils/image-layers/decompose'
import { resizeImage } from './eraseComposite'
import { decodePicture, encodeJpeg, encodePng } from './imageCodec'

export const workerLayerCodec: LayerCodec = {
  decode: decodePicture,
  encodePng,
  encodeJpeg,
  resize: resizeImage
}
