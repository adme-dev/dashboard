<script lang="ts">
import { defineComponent, Fragment, h, type PropType } from 'vue'
import type { bannerSlideGroups } from '~~/shared/bannerSlideFade'

type SceneGroup = ReturnType<typeof bannerSlideGroups>[number]

export default defineComponent({
  inheritAttrs: false,
  props: { group: { type: Object as PropType<SceneGroup>, required: true } },
  setup(props, { slots }) {
    return () => {
      const group = props.group
      const content = slots.default?.() || []
      // A real Fragment preserves the existing layer DOM and mask/drag parent.
      // Dynamic <component :is="Fragment"> receives a slot object instead.
      if (!group.fade) return h(Fragment, null, content)
      return h('div', {
        'data-banner-slide': group.key,
        'style': { position: 'absolute', inset: '0', zIndex: group.zIndex, pointerEvents: 'none', opacity: group.fade.duration > 0 ? 0 : 1 }
      }, content)
    }
  }
})
</script>
