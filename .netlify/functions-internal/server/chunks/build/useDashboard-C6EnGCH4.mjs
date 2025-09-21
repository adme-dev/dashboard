import { P as createSharedComposable, I as useRoute, Q as useRouter } from './server.mjs';
import { ref, watch } from 'vue';
import { d as defineShortcuts } from './defineShortcuts-tuhgUtyW.mjs';

const _useDashboard = () => {
  const route = useRoute();
  const router = useRouter();
  const isNotificationsSlideoverOpen = ref(false);
  defineShortcuts({
    "g-h": () => router.push("/"),
    "g-i": () => router.push("/inbox"),
    "g-c": () => router.push("/customers"),
    "g-s": () => router.push("/settings"),
    "n": () => isNotificationsSlideoverOpen.value = !isNotificationsSlideoverOpen.value
  });
  watch(() => route.fullPath, () => {
    isNotificationsSlideoverOpen.value = false;
  });
  return {
    isNotificationsSlideoverOpen
  };
};
const useDashboard = createSharedComposable(_useDashboard);

export { useDashboard as u };
//# sourceMappingURL=useDashboard-C6EnGCH4.mjs.map
