import { useSlots, toRef, computed, unref, mergeProps, withCtx, renderSlot, createBlock, createCommentVNode, openBlock, toDisplayString, Fragment, renderList, createVNode, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderSlot, ssrRenderClass, ssrInterpolate, ssrRenderList } from 'vue/server-renderer';
import { K as defu } from '../nitro/nitro.mjs';
import { useForwardPropsEmits, TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent, TooltipArrow } from 'reka-ui';
import { u as useAppConfig, r as reactivePick, o as usePortal, t as tv } from './server.mjs';
import { _ as _sfc_main$1 } from './Kbd-8hyXBZ7D.mjs';

const theme = {
  "slots": {
    "content": "flex items-center gap-1 bg-default text-highlighted shadow-sm rounded-sm ring ring-default h-6 px-2.5 py-1 text-xs select-none data-[state=delayed-open]:animate-[scale-in_100ms_ease-out] data-[state=closed]:animate-[scale-out_100ms_ease-in] origin-(--reka-tooltip-content-transform-origin) pointer-events-auto",
    "arrow": "fill-default",
    "text": "truncate",
    "kbds": "hidden lg:inline-flex items-center shrink-0 gap-0.5 not-first-of-type:before:content-['·'] not-first-of-type:before:me-0.5",
    "kbdsSize": "sm"
  }
};
const _sfc_main = {
  __name: "UTooltip",
  __ssrInlineRender: true,
  props: {
    text: { type: String, required: false },
    kbds: { type: Array, required: false },
    content: { type: Object, required: false },
    arrow: { type: [Boolean, Object], required: false },
    portal: { type: [Boolean, String], required: false, skipCheck: true, default: true },
    reference: { type: null, required: false },
    class: { type: null, required: false },
    ui: { type: null, required: false },
    defaultOpen: { type: Boolean, required: false },
    open: { type: Boolean, required: false },
    delayDuration: { type: Number, required: false },
    disableHoverableContent: { type: Boolean, required: false },
    disableClosingTrigger: { type: Boolean, required: false },
    disabled: { type: Boolean, required: false },
    ignoreNonKeyboardFocus: { type: Boolean, required: false }
  },
  emits: ["update:open"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emits = __emit;
    const slots = useSlots();
    const appConfig = useAppConfig();
    const rootProps = useForwardPropsEmits(reactivePick(props, "defaultOpen", "open", "delayDuration", "disableHoverableContent", "disableClosingTrigger", "ignoreNonKeyboardFocus"), emits);
    const portalProps = usePortal(toRef(() => props.portal));
    const contentProps = toRef(() => defu(props.content, { side: "bottom", sideOffset: 8, collisionPadding: 8 }));
    const arrowProps = toRef(() => props.arrow);
    const ui = computed(() => tv({ extend: tv(theme), ...appConfig.ui?.tooltip || {} })({
      side: contentProps.value.side
    }));
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(unref(TooltipRoot), mergeProps(unref(rootProps), {
        disabled: !(__props.text || __props.kbds?.length || !!slots.content) || props.disabled
      }, _attrs), {
        default: withCtx(({ open }, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (!!slots.default || !!__props.reference) {
              _push2(ssrRenderComponent(unref(TooltipTrigger), mergeProps(_ctx.$attrs, {
                "as-child": "",
                reference: __props.reference,
                class: props.class
              }), {
                default: withCtx((_, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    ssrRenderSlot(_ctx.$slots, "default", { open }, null, _push3, _parent3, _scopeId2);
                  } else {
                    return [
                      renderSlot(_ctx.$slots, "default", { open })
                    ];
                  }
                }),
                _: 2
              }, _parent2, _scopeId));
            } else {
              _push2(`<!---->`);
            }
            _push2(ssrRenderComponent(unref(TooltipPortal), unref(portalProps), {
              default: withCtx((_, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(unref(TooltipContent), mergeProps(contentProps.value, {
                    class: ui.value.content({ class: [!slots.default && props.class, props.ui?.content] })
                  }), {
                    default: withCtx((_2, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        ssrRenderSlot(_ctx.$slots, "content", {}, () => {
                          if (__props.text) {
                            _push4(`<span class="${ssrRenderClass(ui.value.text({ class: props.ui?.text }))}"${_scopeId3}>${ssrInterpolate(__props.text)}</span>`);
                          } else {
                            _push4(`<!---->`);
                          }
                          if (__props.kbds?.length) {
                            _push4(`<span class="${ssrRenderClass(ui.value.kbds({ class: props.ui?.kbds }))}"${_scopeId3}><!--[-->`);
                            ssrRenderList(__props.kbds, (kbd, index) => {
                              _push4(ssrRenderComponent(_sfc_main$1, mergeProps({
                                key: index,
                                size: props.ui?.kbdsSize || ui.value.kbdsSize()
                              }, { ref_for: true }, typeof kbd === "string" ? { value: kbd } : kbd), null, _parent4, _scopeId3));
                            });
                            _push4(`<!--]--></span>`);
                          } else {
                            _push4(`<!---->`);
                          }
                        }, _push4, _parent4, _scopeId3);
                        if (!!__props.arrow) {
                          _push4(ssrRenderComponent(unref(TooltipArrow), mergeProps(arrowProps.value, {
                            class: ui.value.arrow({ class: props.ui?.arrow })
                          }), null, _parent4, _scopeId3));
                        } else {
                          _push4(`<!---->`);
                        }
                      } else {
                        return [
                          renderSlot(_ctx.$slots, "content", {}, () => [
                            __props.text ? (openBlock(), createBlock("span", {
                              key: 0,
                              class: ui.value.text({ class: props.ui?.text })
                            }, toDisplayString(__props.text), 3)) : createCommentVNode("", true),
                            __props.kbds?.length ? (openBlock(), createBlock("span", {
                              key: 1,
                              class: ui.value.kbds({ class: props.ui?.kbds })
                            }, [
                              (openBlock(true), createBlock(Fragment, null, renderList(__props.kbds, (kbd, index) => {
                                return openBlock(), createBlock(_sfc_main$1, mergeProps({
                                  key: index,
                                  size: props.ui?.kbdsSize || ui.value.kbdsSize()
                                }, { ref_for: true }, typeof kbd === "string" ? { value: kbd } : kbd), null, 16, ["size"]);
                              }), 128))
                            ], 2)) : createCommentVNode("", true)
                          ]),
                          !!__props.arrow ? (openBlock(), createBlock(unref(TooltipArrow), mergeProps({ key: 0 }, arrowProps.value, {
                            class: ui.value.arrow({ class: props.ui?.arrow })
                          }), null, 16, ["class"])) : createCommentVNode("", true)
                        ];
                      }
                    }),
                    _: 2
                  }, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(unref(TooltipContent), mergeProps(contentProps.value, {
                      class: ui.value.content({ class: [!slots.default && props.class, props.ui?.content] })
                    }), {
                      default: withCtx(() => [
                        renderSlot(_ctx.$slots, "content", {}, () => [
                          __props.text ? (openBlock(), createBlock("span", {
                            key: 0,
                            class: ui.value.text({ class: props.ui?.text })
                          }, toDisplayString(__props.text), 3)) : createCommentVNode("", true),
                          __props.kbds?.length ? (openBlock(), createBlock("span", {
                            key: 1,
                            class: ui.value.kbds({ class: props.ui?.kbds })
                          }, [
                            (openBlock(true), createBlock(Fragment, null, renderList(__props.kbds, (kbd, index) => {
                              return openBlock(), createBlock(_sfc_main$1, mergeProps({
                                key: index,
                                size: props.ui?.kbdsSize || ui.value.kbdsSize()
                              }, { ref_for: true }, typeof kbd === "string" ? { value: kbd } : kbd), null, 16, ["size"]);
                            }), 128))
                          ], 2)) : createCommentVNode("", true)
                        ]),
                        !!__props.arrow ? (openBlock(), createBlock(unref(TooltipArrow), mergeProps({ key: 0 }, arrowProps.value, {
                          class: ui.value.arrow({ class: props.ui?.arrow })
                        }), null, 16, ["class"])) : createCommentVNode("", true)
                      ]),
                      _: 3
                    }, 16, ["class"])
                  ];
                }
              }),
              _: 2
            }, _parent2, _scopeId));
          } else {
            return [
              !!slots.default || !!__props.reference ? (openBlock(), createBlock(unref(TooltipTrigger), mergeProps({ key: 0 }, _ctx.$attrs, {
                "as-child": "",
                reference: __props.reference,
                class: props.class
              }), {
                default: withCtx(() => [
                  renderSlot(_ctx.$slots, "default", { open })
                ]),
                _: 2
              }, 1040, ["reference", "class"])) : createCommentVNode("", true),
              createVNode(unref(TooltipPortal), unref(portalProps), {
                default: withCtx(() => [
                  createVNode(unref(TooltipContent), mergeProps(contentProps.value, {
                    class: ui.value.content({ class: [!slots.default && props.class, props.ui?.content] })
                  }), {
                    default: withCtx(() => [
                      renderSlot(_ctx.$slots, "content", {}, () => [
                        __props.text ? (openBlock(), createBlock("span", {
                          key: 0,
                          class: ui.value.text({ class: props.ui?.text })
                        }, toDisplayString(__props.text), 3)) : createCommentVNode("", true),
                        __props.kbds?.length ? (openBlock(), createBlock("span", {
                          key: 1,
                          class: ui.value.kbds({ class: props.ui?.kbds })
                        }, [
                          (openBlock(true), createBlock(Fragment, null, renderList(__props.kbds, (kbd, index) => {
                            return openBlock(), createBlock(_sfc_main$1, mergeProps({
                              key: index,
                              size: props.ui?.kbdsSize || ui.value.kbdsSize()
                            }, { ref_for: true }, typeof kbd === "string" ? { value: kbd } : kbd), null, 16, ["size"]);
                          }), 128))
                        ], 2)) : createCommentVNode("", true)
                      ]),
                      !!__props.arrow ? (openBlock(), createBlock(unref(TooltipArrow), mergeProps({ key: 0 }, arrowProps.value, {
                        class: ui.value.arrow({ class: props.ui?.arrow })
                      }), null, 16, ["class"])) : createCommentVNode("", true)
                    ]),
                    _: 3
                  }, 16, ["class"])
                ]),
                _: 3
              }, 16)
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_axios@1.12.2_change-ca_9e32dd265ffe56b992951caaa30208b5/node_modules/@nuxt/ui/dist/runtime/components/Tooltip.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as _ };
//# sourceMappingURL=Tooltip-B1rd475P.mjs.map
