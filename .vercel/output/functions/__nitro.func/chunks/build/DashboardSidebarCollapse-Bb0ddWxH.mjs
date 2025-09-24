import { ref, computed, mergeProps, unref, useSSRContext } from 'vue';
import { ssrRenderComponent } from 'vue/server-renderer';
import { useForwardProps } from 'reka-ui';
import { r as reactivePick, h as useLocale, u as useAppConfig, t as tv, d as _sfc_main$9 } from './server.mjs';
import { u as useDashboard } from './DashboardSidebarToggle-NWn7wtB9.mjs';

const theme = {
  "base": "hidden lg:flex",
  "variants": {
    "side": {
      "left": "",
      "right": ""
    }
  }
};
const _sfc_main = {
  __name: "UDashboardSidebarCollapse",
  __ssrInlineRender: true,
  props: {
    side: { type: String, required: false, default: "left" },
    color: { type: null, required: false, default: "neutral" },
    variant: { type: null, required: false, default: "ghost" },
    class: { type: null, required: false }
  },
  setup(__props) {
    const props = __props;
    const rootProps = useForwardProps(reactivePick(props, "color", "variant", "size"));
    const { t } = useLocale();
    const appConfig = useAppConfig();
    const { sidebarCollapsed, collapseSidebar } = useDashboard({ sidebarCollapsed: ref(false), collapseSidebar: () => {
    } });
    const ui = computed(() => tv({ extend: tv(theme), ...appConfig.ui?.dashboardSidebarCollapse || {} }));
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(_sfc_main$9, mergeProps(unref(rootProps), {
        "aria-label": unref(sidebarCollapsed) ? unref(t)("dashboardSidebarCollapse.expand") : unref(t)("dashboardSidebarCollapse.collapse"),
        icon: unref(sidebarCollapsed) ? unref(appConfig).ui.icons.panelOpen : unref(appConfig).ui.icons.panelClose,
        class: ui.value({ class: props.class, side: props.side }),
        onClick: ($event) => unref(collapseSidebar)?.(!unref(sidebarCollapsed))
      }, _attrs), null, _parent));
    };
  }
};
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_axios@1.12.2_change-ca_9e32dd265ffe56b992951caaa30208b5/node_modules/@nuxt/ui/dist/runtime/components/DashboardSidebarCollapse.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as _ };
//# sourceMappingURL=DashboardSidebarCollapse-Bb0ddWxH.mjs.map
