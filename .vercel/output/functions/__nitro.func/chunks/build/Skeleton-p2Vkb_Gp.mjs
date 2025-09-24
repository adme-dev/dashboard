import { computed, unref, mergeProps, withCtx, renderSlot, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderSlot } from 'vue/server-renderer';
import { Primitive } from 'reka-ui';
import { u as useAppConfig, t as tv } from './server.mjs';

const theme = {
  "base": "animate-pulse rounded-md bg-elevated"
};
const _sfc_main = {
  __name: "USkeleton",
  __ssrInlineRender: true,
  props: {
    as: { type: null, required: false },
    class: { type: null, required: false }
  },
  setup(__props) {
    const props = __props;
    const appConfig = useAppConfig();
    const ui = computed(() => tv({ extend: tv(theme), ...appConfig.ui?.skeleton || {} }));
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(unref(Primitive), mergeProps({
        as: __props.as,
        "aria-busy": "true",
        "aria-label": "loading",
        "aria-live": "polite",
        role: "alert",
        class: ui.value({ class: props.class })
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            ssrRenderSlot(_ctx.$slots, "default", {}, null, _push2, _parent2, _scopeId);
          } else {
            return [
              renderSlot(_ctx.$slots, "default")
            ];
          }
        }),
        _: 3
      }, _parent));
    };
  }
};
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_axios@1.12.2_change-ca_9e32dd265ffe56b992951caaa30208b5/node_modules/@nuxt/ui/dist/runtime/components/Skeleton.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as _ };
//# sourceMappingURL=Skeleton-p2Vkb_Gp.mjs.map
