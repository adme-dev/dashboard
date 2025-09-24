import { computed, unref, mergeProps, withCtx, renderSlot, createVNode, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderSlot, ssrRenderClass } from 'vue/server-renderer';
import { Primitive } from 'reka-ui';
import { u as useAppConfig, t as tv } from './server.mjs';

const theme = {
  "slots": {
    "root": "shrink-0 flex items-center justify-between border-b border-default px-4 sm:px-6 gap-1.5 overflow-x-auto min-h-[49px]",
    "left": "flex items-center gap-1.5",
    "right": "flex items-center gap-1.5"
  }
};
const _sfc_main = {
  __name: "UDashboardToolbar",
  __ssrInlineRender: true,
  props: {
    as: { type: null, required: false },
    class: { type: null, required: false },
    ui: { type: null, required: false }
  },
  setup(__props) {
    const props = __props;
    const appConfig = useAppConfig();
    const ui = computed(() => tv({ extend: tv(theme), ...appConfig.ui?.dashboardToolbar || {} })());
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(unref(Primitive), mergeProps({
        as: __props.as,
        class: ui.value.root({ class: [props.ui?.root, props.class] })
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            ssrRenderSlot(_ctx.$slots, "default", {}, () => {
              _push2(`<div class="${ssrRenderClass(ui.value.left({ class: [props.ui?.left] }))}"${_scopeId}>`);
              ssrRenderSlot(_ctx.$slots, "left", {}, null, _push2, _parent2, _scopeId);
              _push2(`</div><div class="${ssrRenderClass(ui.value.right({ class: [props.ui?.right] }))}"${_scopeId}>`);
              ssrRenderSlot(_ctx.$slots, "right", {}, null, _push2, _parent2, _scopeId);
              _push2(`</div>`);
            }, _push2, _parent2, _scopeId);
          } else {
            return [
              renderSlot(_ctx.$slots, "default", {}, () => [
                createVNode("div", {
                  class: ui.value.left({ class: [props.ui?.left] })
                }, [
                  renderSlot(_ctx.$slots, "left")
                ], 2),
                createVNode("div", {
                  class: ui.value.right({ class: [props.ui?.right] })
                }, [
                  renderSlot(_ctx.$slots, "right")
                ], 2)
              ])
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_axios@1.12.2_change-ca_9e32dd265ffe56b992951caaa30208b5/node_modules/@nuxt/ui/dist/runtime/components/DashboardToolbar.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as _ };
//# sourceMappingURL=DashboardToolbar-C9qyFRVV.mjs.map
