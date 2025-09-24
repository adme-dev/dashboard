import { useSlots, computed, unref, mergeProps, withCtx, renderSlot, createBlock, createCommentVNode, openBlock, createTextVNode, toDisplayString, createVNode, Fragment, renderList, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderClass, ssrRenderList, ssrRenderSlot, ssrInterpolate } from 'vue/server-renderer';
import { Primitive } from 'reka-ui';
import { h as useLocale, u as useAppConfig, t as tv, F as _sfc_main$a, G as pickLinkProps, H as _sfc_main$b, _ as _sfc_main$e, a as _sfc_main$c, g as get } from './server.mjs';

const theme = {
  "slots": {
    "root": "relative min-w-0",
    "list": "flex items-center gap-1.5",
    "item": "flex min-w-0",
    "link": "group relative flex items-center gap-1.5 text-sm min-w-0 focus-visible:outline-primary",
    "linkLeadingIcon": "shrink-0 size-5",
    "linkLeadingAvatar": "shrink-0",
    "linkLeadingAvatarSize": "2xs",
    "linkLabel": "truncate",
    "separator": "flex",
    "separatorIcon": "shrink-0 size-5 text-muted"
  },
  "variants": {
    "active": {
      "true": {
        "link": "text-primary font-semibold"
      },
      "false": {
        "link": "text-muted font-medium"
      }
    },
    "disabled": {
      "true": {
        "link": "cursor-not-allowed opacity-75"
      }
    },
    "to": {
      "true": ""
    }
  },
  "compoundVariants": [
    {
      "disabled": false,
      "active": false,
      "to": true,
      "class": {
        "link": [
          "hover:text-default",
          "transition-colors"
        ]
      }
    }
  ]
};
const _sfc_main = {
  __name: "UBreadcrumb",
  __ssrInlineRender: true,
  props: {
    as: { type: null, required: false, default: "nav" },
    items: { type: Array, required: false },
    separatorIcon: { type: [String, Object], required: false },
    labelKey: { type: null, required: false, default: "label" },
    class: { type: null, required: false },
    ui: { type: null, required: false }
  },
  setup(__props) {
    const props = __props;
    const slots = useSlots();
    const { dir } = useLocale();
    const appConfig = useAppConfig();
    const separatorIcon = computed(() => props.separatorIcon || (dir.value === "rtl" ? appConfig.ui.icons.chevronLeft : appConfig.ui.icons.chevronRight));
    const ui = computed(() => tv({ extend: tv(theme), ...appConfig.ui?.breadcrumb || {} })());
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(unref(Primitive), mergeProps({
        as: __props.as,
        "aria-label": "breadcrumb",
        class: ui.value.root({ class: [props.ui?.root, props.class] })
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<ol class="${ssrRenderClass(ui.value.list({ class: props.ui?.list }))}"${_scopeId}><!--[-->`);
            ssrRenderList(__props.items, (item, index) => {
              _push2(`<!--[--><li class="${ssrRenderClass(ui.value.item({ class: [props.ui?.item, item.ui?.item] }))}"${_scopeId}>`);
              _push2(ssrRenderComponent(_sfc_main$a, mergeProps({ ref_for: true }, unref(pickLinkProps)(item), { custom: "" }), {
                default: withCtx(({ active, ...slotProps }, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(ssrRenderComponent(_sfc_main$b, mergeProps({ ref_for: true }, slotProps, {
                      as: "span",
                      "aria-current": active && index === __props.items.length - 1 ? "page" : void 0,
                      class: ui.value.link({ class: [props.ui?.link, item.ui?.link, item.class], active: index === __props.items.length - 1, disabled: !!item.disabled, to: !!item.to })
                    }), {
                      default: withCtx((_2, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          ssrRenderSlot(_ctx.$slots, item.slot || "item", {
                            item,
                            index
                          }, () => {
                            ssrRenderSlot(_ctx.$slots, item.slot ? `${item.slot}-leading` : "item-leading", {
                              item,
                              active: index === __props.items.length - 1,
                              index
                            }, () => {
                              if (item.icon) {
                                _push4(ssrRenderComponent(_sfc_main$e, {
                                  name: item.icon,
                                  class: ui.value.linkLeadingIcon({ class: [props.ui?.linkLeadingIcon, item.ui?.linkLeadingIcon], active: index === __props.items.length - 1 })
                                }, null, _parent4, _scopeId3));
                              } else if (item.avatar) {
                                _push4(ssrRenderComponent(_sfc_main$c, mergeProps({
                                  size: props.ui?.linkLeadingAvatarSize || ui.value.linkLeadingAvatarSize()
                                }, { ref_for: true }, item.avatar, {
                                  class: ui.value.linkLeadingAvatar({ class: [props.ui?.linkLeadingAvatar, item.ui?.linkLeadingAvatar], active: index === __props.items.length - 1 })
                                }), null, _parent4, _scopeId3));
                              } else {
                                _push4(`<!---->`);
                              }
                            }, _push4, _parent4, _scopeId3);
                            if (unref(get)(item, props.labelKey) || !!slots[item.slot ? `${item.slot}-label` : "item-label"]) {
                              _push4(`<span class="${ssrRenderClass(ui.value.linkLabel({ class: [props.ui?.linkLabel, item.ui?.linkLabel] }))}"${_scopeId3}>`);
                              ssrRenderSlot(_ctx.$slots, item.slot ? `${item.slot}-label` : "item-label", {
                                item,
                                active: index === __props.items.length - 1,
                                index
                              }, () => {
                                _push4(`${ssrInterpolate(unref(get)(item, props.labelKey))}`);
                              }, _push4, _parent4, _scopeId3);
                              _push4(`</span>`);
                            } else {
                              _push4(`<!---->`);
                            }
                            ssrRenderSlot(_ctx.$slots, item.slot ? `${item.slot}-trailing` : "item-trailing", {
                              item,
                              active: index === __props.items.length - 1,
                              index
                            }, null, _push4, _parent4, _scopeId3);
                          }, _push4, _parent4, _scopeId3);
                        } else {
                          return [
                            renderSlot(_ctx.$slots, item.slot || "item", {
                              item,
                              index
                            }, () => [
                              renderSlot(_ctx.$slots, item.slot ? `${item.slot}-leading` : "item-leading", {
                                item,
                                active: index === __props.items.length - 1,
                                index
                              }, () => [
                                item.icon ? (openBlock(), createBlock(_sfc_main$e, {
                                  key: 0,
                                  name: item.icon,
                                  class: ui.value.linkLeadingIcon({ class: [props.ui?.linkLeadingIcon, item.ui?.linkLeadingIcon], active: index === __props.items.length - 1 })
                                }, null, 8, ["name", "class"])) : item.avatar ? (openBlock(), createBlock(_sfc_main$c, mergeProps({
                                  key: 1,
                                  size: props.ui?.linkLeadingAvatarSize || ui.value.linkLeadingAvatarSize()
                                }, { ref_for: true }, item.avatar, {
                                  class: ui.value.linkLeadingAvatar({ class: [props.ui?.linkLeadingAvatar, item.ui?.linkLeadingAvatar], active: index === __props.items.length - 1 })
                                }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                              ]),
                              unref(get)(item, props.labelKey) || !!slots[item.slot ? `${item.slot}-label` : "item-label"] ? (openBlock(), createBlock("span", {
                                key: 0,
                                class: ui.value.linkLabel({ class: [props.ui?.linkLabel, item.ui?.linkLabel] })
                              }, [
                                renderSlot(_ctx.$slots, item.slot ? `${item.slot}-label` : "item-label", {
                                  item,
                                  active: index === __props.items.length - 1,
                                  index
                                }, () => [
                                  createTextVNode(toDisplayString(unref(get)(item, props.labelKey)), 1)
                                ])
                              ], 2)) : createCommentVNode("", true),
                              renderSlot(_ctx.$slots, item.slot ? `${item.slot}-trailing` : "item-trailing", {
                                item,
                                active: index === __props.items.length - 1,
                                index
                              })
                            ])
                          ];
                        }
                      }),
                      _: 2
                    }, _parent3, _scopeId2));
                  } else {
                    return [
                      createVNode(_sfc_main$b, mergeProps({ ref_for: true }, slotProps, {
                        as: "span",
                        "aria-current": active && index === __props.items.length - 1 ? "page" : void 0,
                        class: ui.value.link({ class: [props.ui?.link, item.ui?.link, item.class], active: index === __props.items.length - 1, disabled: !!item.disabled, to: !!item.to })
                      }), {
                        default: withCtx(() => [
                          renderSlot(_ctx.$slots, item.slot || "item", {
                            item,
                            index
                          }, () => [
                            renderSlot(_ctx.$slots, item.slot ? `${item.slot}-leading` : "item-leading", {
                              item,
                              active: index === __props.items.length - 1,
                              index
                            }, () => [
                              item.icon ? (openBlock(), createBlock(_sfc_main$e, {
                                key: 0,
                                name: item.icon,
                                class: ui.value.linkLeadingIcon({ class: [props.ui?.linkLeadingIcon, item.ui?.linkLeadingIcon], active: index === __props.items.length - 1 })
                              }, null, 8, ["name", "class"])) : item.avatar ? (openBlock(), createBlock(_sfc_main$c, mergeProps({
                                key: 1,
                                size: props.ui?.linkLeadingAvatarSize || ui.value.linkLeadingAvatarSize()
                              }, { ref_for: true }, item.avatar, {
                                class: ui.value.linkLeadingAvatar({ class: [props.ui?.linkLeadingAvatar, item.ui?.linkLeadingAvatar], active: index === __props.items.length - 1 })
                              }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                            ]),
                            unref(get)(item, props.labelKey) || !!slots[item.slot ? `${item.slot}-label` : "item-label"] ? (openBlock(), createBlock("span", {
                              key: 0,
                              class: ui.value.linkLabel({ class: [props.ui?.linkLabel, item.ui?.linkLabel] })
                            }, [
                              renderSlot(_ctx.$slots, item.slot ? `${item.slot}-label` : "item-label", {
                                item,
                                active: index === __props.items.length - 1,
                                index
                              }, () => [
                                createTextVNode(toDisplayString(unref(get)(item, props.labelKey)), 1)
                              ])
                            ], 2)) : createCommentVNode("", true),
                            renderSlot(_ctx.$slots, item.slot ? `${item.slot}-trailing` : "item-trailing", {
                              item,
                              active: index === __props.items.length - 1,
                              index
                            })
                          ])
                        ]),
                        _: 2
                      }, 1040, ["aria-current", "class"])
                    ];
                  }
                }),
                _: 2
              }, _parent2, _scopeId));
              _push2(`</li>`);
              if (index < __props.items.length - 1) {
                _push2(`<li role="presentation" aria-hidden="true" class="${ssrRenderClass(ui.value.separator({ class: [props.ui?.separator, item.ui?.separator] }))}"${_scopeId}>`);
                ssrRenderSlot(_ctx.$slots, "separator", {}, () => {
                  _push2(ssrRenderComponent(_sfc_main$e, {
                    name: separatorIcon.value,
                    class: ui.value.separatorIcon({ class: [props.ui?.separatorIcon, item.ui?.separatorIcon] })
                  }, null, _parent2, _scopeId));
                }, _push2, _parent2, _scopeId);
                _push2(`</li>`);
              } else {
                _push2(`<!---->`);
              }
              _push2(`<!--]-->`);
            });
            _push2(`<!--]--></ol>`);
          } else {
            return [
              createVNode("ol", {
                class: ui.value.list({ class: props.ui?.list })
              }, [
                (openBlock(true), createBlock(Fragment, null, renderList(__props.items, (item, index) => {
                  return openBlock(), createBlock(Fragment, { key: index }, [
                    createVNode("li", {
                      class: ui.value.item({ class: [props.ui?.item, item.ui?.item] })
                    }, [
                      createVNode(_sfc_main$a, mergeProps({ ref_for: true }, unref(pickLinkProps)(item), { custom: "" }), {
                        default: withCtx(({ active, ...slotProps }) => [
                          createVNode(_sfc_main$b, mergeProps({ ref_for: true }, slotProps, {
                            as: "span",
                            "aria-current": active && index === __props.items.length - 1 ? "page" : void 0,
                            class: ui.value.link({ class: [props.ui?.link, item.ui?.link, item.class], active: index === __props.items.length - 1, disabled: !!item.disabled, to: !!item.to })
                          }), {
                            default: withCtx(() => [
                              renderSlot(_ctx.$slots, item.slot || "item", {
                                item,
                                index
                              }, () => [
                                renderSlot(_ctx.$slots, item.slot ? `${item.slot}-leading` : "item-leading", {
                                  item,
                                  active: index === __props.items.length - 1,
                                  index
                                }, () => [
                                  item.icon ? (openBlock(), createBlock(_sfc_main$e, {
                                    key: 0,
                                    name: item.icon,
                                    class: ui.value.linkLeadingIcon({ class: [props.ui?.linkLeadingIcon, item.ui?.linkLeadingIcon], active: index === __props.items.length - 1 })
                                  }, null, 8, ["name", "class"])) : item.avatar ? (openBlock(), createBlock(_sfc_main$c, mergeProps({
                                    key: 1,
                                    size: props.ui?.linkLeadingAvatarSize || ui.value.linkLeadingAvatarSize()
                                  }, { ref_for: true }, item.avatar, {
                                    class: ui.value.linkLeadingAvatar({ class: [props.ui?.linkLeadingAvatar, item.ui?.linkLeadingAvatar], active: index === __props.items.length - 1 })
                                  }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                                ]),
                                unref(get)(item, props.labelKey) || !!slots[item.slot ? `${item.slot}-label` : "item-label"] ? (openBlock(), createBlock("span", {
                                  key: 0,
                                  class: ui.value.linkLabel({ class: [props.ui?.linkLabel, item.ui?.linkLabel] })
                                }, [
                                  renderSlot(_ctx.$slots, item.slot ? `${item.slot}-label` : "item-label", {
                                    item,
                                    active: index === __props.items.length - 1,
                                    index
                                  }, () => [
                                    createTextVNode(toDisplayString(unref(get)(item, props.labelKey)), 1)
                                  ])
                                ], 2)) : createCommentVNode("", true),
                                renderSlot(_ctx.$slots, item.slot ? `${item.slot}-trailing` : "item-trailing", {
                                  item,
                                  active: index === __props.items.length - 1,
                                  index
                                })
                              ])
                            ]),
                            _: 2
                          }, 1040, ["aria-current", "class"])
                        ]),
                        _: 2
                      }, 1040)
                    ], 2),
                    index < __props.items.length - 1 ? (openBlock(), createBlock("li", {
                      key: 0,
                      role: "presentation",
                      "aria-hidden": "true",
                      class: ui.value.separator({ class: [props.ui?.separator, item.ui?.separator] })
                    }, [
                      renderSlot(_ctx.$slots, "separator", {}, () => [
                        createVNode(_sfc_main$e, {
                          name: separatorIcon.value,
                          class: ui.value.separatorIcon({ class: [props.ui?.separatorIcon, item.ui?.separatorIcon] })
                        }, null, 8, ["name", "class"])
                      ])
                    ], 2)) : createCommentVNode("", true)
                  ], 64);
                }), 128))
              ], 2)
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_axios@1.12.2_change-ca_9e32dd265ffe56b992951caaa30208b5/node_modules/@nuxt/ui/dist/runtime/components/Breadcrumb.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as _ };
//# sourceMappingURL=Breadcrumb-1kD8Xb-9.mjs.map
