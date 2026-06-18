import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import {
  filterVideoStudioAssets,
  normalizeVideoStudioAssets,
  type NormalizeVideoStudioAssetsInput,
  type VideoStudioAssetFilters,
} from '~~/app/utils/video/videoStudioAssets'

export function useVideoStudioAssets(
  input: MaybeRefOrGetter<NormalizeVideoStudioAssetsInput>,
  filters: MaybeRefOrGetter<VideoStudioAssetFilters> = {}
) {
  const assets = computed(() => normalizeVideoStudioAssets(toValue(input)))
  const filteredAssets = computed(() => filterVideoStudioAssets(assets.value, toValue(filters)))

  return {
    assets,
    filteredAssets,
  }
}
