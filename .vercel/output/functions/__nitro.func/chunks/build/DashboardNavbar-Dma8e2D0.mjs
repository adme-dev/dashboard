import { useId, toRef, computed, mergeProps, unref, useSlots, withCtx, renderSlot, createBlock, createCommentVNode, openBlock, createVNode, createTextVNode, toDisplayString, useSSRContext } from 'vue';
import { ssrRenderAttrs, ssrRenderSlot, ssrRenderClass, ssrRenderComponent, ssrInterpolate } from 'vue/server-renderer';
import { u as useDashboard, a as useResizable, _ as _sfc_main$1$1, b as _sfc_main$2 } from './DashboardSidebarToggle-NWn7wtB9.mjs';
import { u as useAppConfig, t as tv, _ as _sfc_main$e } from './server.mjs';
import { Primitive } from 'reka-ui';
import { c as createReusableTemplate } from './index-Btsu36yb.mjs';

const theme$1 = {
  "slots": {
    "root": "relative flex flex-col min-w-0 min-h-svh lg:not-last:border-r lg:not-last:border-default shrink-0",
    "body": "flex flex-col gap-4 sm:gap-6 flex-1 overflow-y-auto p-4 sm:p-6",
    "handle": ""
  },
  "variants": {
    "size": {
      "true": {
        "root": "w-full lg:w-(--width)"
      },
      "false": {
        "root": "flex-1"
      }
    }
  }
};
const _sfc_main$1 = /* @__PURE__ */ Object.assign({ inheritAttrs: false }, {
  __name: "UDashboardPanel",
  __ssrInlineRender: true,
  props: {
    class: { type: null, required: false },
    ui: { type: null, required: false },
    id: { type: String, required: false },
    minSize: { type: Number, required: false, default: 15 },
    maxSize: { type: Number, required: false },
    defaultSize: { type: Number, required: false },
    resizable: { type: Boolean, required: false, default: false }
  },
  setup(__props) {
    const props = __props;
    const appConfig = useAppConfig();
    const dashboardContext = useDashboard({ storageKey: "dashboard", unit: "%" });
    const id = `${dashboardContext.storageKey}-panel-${props.id || useId()}`;
    const { el, size, isDragging, onMouseDown, onTouchStart, onDoubleClick } = useResizable(id, toRef(() => ({ ...dashboardContext, ...props })));
    const ui = computed(() => tv({ extend: tv(theme$1), ...appConfig.ui?.dashboardPanel || {} })({
      size: !!size.value
    }));
    return (_ctx, _push, _parent, _attrs) => {
      _push(`<!--[--><div${ssrRenderAttrs(mergeProps({
        id,
        ref_key: "el",
        ref: el
      }, _ctx.$attrs, {
        "data-dragging": unref(isDragging),
        class: ui.value.root({ class: [props.ui?.root, props.class] }),
        style: [unref(size) ? { "--width": `${unref(size)}${unref(dashboardContext).unit}` } : void 0]
      }))}>`);
      ssrRenderSlot(_ctx.$slots, "default", {}, () => {
        ssrRenderSlot(_ctx.$slots, "header", {}, null, _push, _parent);
        _push(`<div class="${ssrRenderClass(ui.value.body({ class: props.ui?.body }))}">`);
        ssrRenderSlot(_ctx.$slots, "body", {}, null, _push, _parent);
        _push(`</div>`);
        ssrRenderSlot(_ctx.$slots, "footer", {}, null, _push, _parent);
      }, _push, _parent);
      _push(`</div>`);
      ssrRenderSlot(_ctx.$slots, "resize-handle", {
        onMouseDown: unref(onMouseDown),
        onTouchStart: unref(onTouchStart),
        onDoubleClick: unref(onDoubleClick)
      }, () => {
        if (__props.resizable) {
          _push(ssrRenderComponent(_sfc_main$1$1, {
            "aria-controls": id,
            class: ui.value.handle({ class: props.ui?.handle }),
            onMousedown: unref(onMouseDown),
            onTouchstart: unref(onTouchStart),
            onDblclick: unref(onDoubleClick)
          }, null, _parent));
        } else {
          _push(`<!---->`);
        }
      }, _push, _parent);
      _push(`<!--]-->`);
    };
  }
});
const _sfc_setup$1 = _sfc_main$1.setup;
_sfc_main$1.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_axios@1.12.2_change-ca_9e32dd265ffe56b992951caaa30208b5/node_modules/@nuxt/ui/dist/runtime/components/DashboardPanel.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const theme = {
  "slots": {
    "root": "h-(--ui-header-height) shrink-0 flex items-center justify-between border-b border-default px-4 sm:px-6 gap-1.5",
    "left": "flex items-center gap-1.5 min-w-0",
    "icon": "shrink-0 size-5 self-center me-1.5",
    "title": "flex items-center gap-1.5 font-semibold text-highlighted truncate",
    "center": "hidden lg:flex",
    "right": "flex items-center shrink-0 gap-1.5",
    "toggle": ""
  },
  "variants": {
    "toggleSide": {
      "left": {
        "toggle": ""
      },
      "right": {
        "toggle": ""
      }
    }
  }
};
const _sfc_main = /* @__PURE__ */ Object.assign({ inheritAttrs: false }, {
  __name: "UDashboardNavbar",
  __ssrInlineRender: true,
  props: {
    as: { type: null, required: false },
    icon: { type: [String, Object], required: false },
    title: { type: String, required: false },
    toggle: { type: [Boolean, Object], required: false, default: true },
    toggleSide: { type: String, required: false, default: "left" },
    class: { type: null, required: false },
    ui: { type: null, required: false }
  },
  setup(__props) {
    const props = __props;
    const slots = useSlots();
    const appConfig = useAppConfig();
    const dashboardContext = useDashboard({});
    const [DefineToggleTemplate, ReuseToggleTemplate] = createReusableTemplate();
    const ui = computed(() => tv({ extend: tv(theme), ...appConfig.ui?.dashboardNavbar || {} })());
    return (_ctx, _push, _parent, _attrs) => {
      _push(`<!--[-->`);
      _push(ssrRenderComponent(unref(DefineToggleTemplate), null, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            ssrRenderSlot(_ctx.$slots, "toggle", unref(dashboardContext), () => {
              if (__props.toggle) {
                _push2(ssrRenderComponent(_sfc_main$2, mergeProps(typeof __props.toggle === "object" ? __props.toggle : {}, {
                  side: __props.toggleSide,
                  class: ui.value.toggle({ class: props.ui?.toggle, toggleSide: __props.toggleSide })
                }), null, _parent2, _scopeId));
              } else {
                _push2(`<!---->`);
              }
            }, _push2, _parent2, _scopeId);
          } else {
            return [
              renderSlot(_ctx.$slots, "toggle", unref(dashboardContext), () => [
                __props.toggle ? (openBlock(), createBlock(_sfc_main$2, mergeProps({ key: 0 }, typeof __props.toggle === "object" ? __props.toggle : {}, {
                  side: __props.toggleSide,
                  class: ui.value.toggle({ class: props.ui?.toggle, toggleSide: __props.toggleSide })
                }), null, 16, ["side", "class"])) : createCommentVNode("", true)
              ])
            ];
          }
        }),
        _: 3
      }, _parent));
      _push(ssrRenderComponent(unref(Primitive), mergeProps({ as: __props.as }, _ctx.$attrs, {
        class: ui.value.root({ class: [props.ui?.root, props.class] })
      }), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="${ssrRenderClass(ui.value.left({ class: props.ui?.left }))}"${_scopeId}>`);
            if (__props.toggleSide === "left") {
              _push2(ssrRenderComponent(unref(ReuseToggleTemplate), null, null, _parent2, _scopeId));
            } else {
              _push2(`<!---->`);
            }
            ssrRenderSlot(_ctx.$slots, "left", unref(dashboardContext), () => {
              ssrRenderSlot(_ctx.$slots, "leading", unref(dashboardContext), () => {
                if (__props.icon) {
                  _push2(ssrRenderComponent(_sfc_main$e, {
                    name: __props.icon,
                    class: ui.value.icon({ class: props.ui?.icon })
                  }, null, _parent2, _scopeId));
                } else {
                  _push2(`<!---->`);
                }
              }, _push2, _parent2, _scopeId);
              _push2(`<h1 class="${ssrRenderClass(ui.value.title({ class: props.ui?.title }))}"${_scopeId}>`);
              ssrRenderSlot(_ctx.$slots, "title", {}, () => {
                _push2(`${ssrInterpolate(__props.title)}`);
              }, _push2, _parent2, _scopeId);
              _push2(`</h1>`);
              ssrRenderSlot(_ctx.$slots, "trailing", unref(dashboardContext), null, _push2, _parent2, _scopeId);
            }, _push2, _parent2, _scopeId);
            _push2(`</div>`);
            if (!!slots.default) {
              _push2(`<div class="${ssrRenderClass(ui.value.center({ class: props.ui?.center }))}"${_scopeId}>`);
              ssrRenderSlot(_ctx.$slots, "default", unref(dashboardContext), null, _push2, _parent2, _scopeId);
              _push2(`</div>`);
            } else {
              _push2(`<!---->`);
            }
            _push2(`<div class="${ssrRenderClass(ui.value.right({ class: props.ui?.right }))}"${_scopeId}>`);
            ssrRenderSlot(_ctx.$slots, "right", unref(dashboardContext), null, _push2, _parent2, _scopeId);
            if (__props.toggleSide === "right") {
              _push2(ssrRenderComponent(unref(ReuseToggleTemplate), null, null, _parent2, _scopeId));
            } else {
              _push2(`<!---->`);
            }
            _push2(`</div>`);
          } else {
            return [
              createVNode("div", {
                class: ui.value.left({ class: props.ui?.left })
              }, [
                __props.toggleSide === "left" ? (openBlock(), createBlock(unref(ReuseToggleTemplate), { key: 0 })) : createCommentVNode("", true),
                renderSlot(_ctx.$slots, "left", unref(dashboardContext), () => [
                  renderSlot(_ctx.$slots, "leading", unref(dashboardContext), () => [
                    __props.icon ? (openBlock(), createBlock(_sfc_main$e, {
                      key: 0,
                      name: __props.icon,
                      class: ui.value.icon({ class: props.ui?.icon })
                    }, null, 8, ["name", "class"])) : createCommentVNode("", true)
                  ]),
                  createVNode("h1", {
                    class: ui.value.title({ class: props.ui?.title })
                  }, [
                    renderSlot(_ctx.$slots, "title", {}, () => [
                      createTextVNode(toDisplayString(__props.title), 1)
                    ])
                  ], 2),
                  renderSlot(_ctx.$slots, "trailing", unref(dashboardContext))
                ])
              ], 2),
              !!slots.default ? (openBlock(), createBlock("div", {
                key: 0,
                class: ui.value.center({ class: props.ui?.center })
              }, [
                renderSlot(_ctx.$slots, "default", unref(dashboardContext))
              ], 2)) : createCommentVNode("", true),
              createVNode("div", {
                class: ui.value.right({ class: props.ui?.right })
              }, [
                renderSlot(_ctx.$slots, "right", unref(dashboardContext)),
                __props.toggleSide === "right" ? (openBlock(), createBlock(unref(ReuseToggleTemplate), { key: 0 })) : createCommentVNode("", true)
              ], 2)
            ];
          }
        }),
        _: 3
      }, _parent));
      _push(`<!--]-->`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_axios@1.12.2_change-ca_9e32dd265ffe56b992951caaa30208b5/node_modules/@nuxt/ui/dist/runtime/components/DashboardNavbar.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main$1 as _, _sfc_main as a };
//# sourceMappingURL=DashboardNavbar-Dma8e2D0.mjs.map
