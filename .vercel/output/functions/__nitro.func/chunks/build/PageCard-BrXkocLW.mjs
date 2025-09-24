import { useSlots, ref, computed, watch, unref, mergeProps, withCtx, createVNode, createBlock, createCommentVNode, openBlock, renderSlot, createTextVNode, toDisplayString, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderClass, ssrRenderSlot, ssrInterpolate } from 'vue/server-renderer';
import { Primitive } from 'reka-ui';
import { g as useMouseInElement } from './index-Btsu36yb.mjs';
import { I as pausableFilter, u as useAppConfig, t as tv, J as getSlotChildrenText, _ as _sfc_main$e, F as _sfc_main$a } from './server.mjs';

const theme = {
  "slots": {
    "root": "relative flex rounded-lg",
    "spotlight": "absolute inset-0 rounded-[inherit] pointer-events-none bg-default/90",
    "container": "relative flex flex-col flex-1 lg:grid gap-x-8 gap-y-4 p-4 sm:p-6",
    "wrapper": "flex flex-col flex-1 items-start",
    "header": "mb-4",
    "body": "flex-1",
    "footer": "pt-4 mt-auto",
    "leading": "inline-flex items-center mb-2.5",
    "leadingIcon": "size-5 shrink-0 text-primary",
    "title": "text-base text-pretty font-semibold text-highlighted",
    "description": "text-[15px] text-pretty"
  },
  "variants": {
    "orientation": {
      "horizontal": {
        "container": "lg:grid-cols-2 lg:items-center"
      },
      "vertical": {
        "container": ""
      }
    },
    "reverse": {
      "true": {
        "wrapper": "lg:order-last"
      }
    },
    "variant": {
      "solid": {
        "root": "bg-inverted text-inverted",
        "title": "text-inverted",
        "description": "text-dimmed"
      },
      "outline": {
        "root": "bg-default ring ring-default",
        "description": "text-muted"
      },
      "soft": {
        "root": "bg-elevated/50",
        "description": "text-toned"
      },
      "subtle": {
        "root": "bg-elevated/50 ring ring-default",
        "description": "text-toned"
      },
      "ghost": {
        "description": "text-muted"
      },
      "naked": {
        "container": "p-0 sm:p-0",
        "description": "text-muted"
      }
    },
    "to": {
      "true": {
        "root": [
          "transition"
        ]
      }
    },
    "title": {
      "true": {
        "description": "mt-1"
      }
    },
    "highlight": {
      "true": {
        "root": "ring-2"
      }
    },
    "highlightColor": {
      "primary": "",
      "secondary": "",
      "success": "",
      "info": "",
      "warning": "",
      "error": "",
      "neutral": ""
    },
    "spotlight": {
      "true": {
        "root": "[--spotlight-size:400px] before:absolute before:-inset-px before:pointer-events-none before:rounded-[inherit] before:bg-[radial-gradient(var(--spotlight-size)_var(--spotlight-size)_at_calc(var(--spotlight-x,0px))_calc(var(--spotlight-y,0px)),var(--spotlight-color),transparent_70%)]"
      }
    },
    "spotlightColor": {
      "primary": "",
      "secondary": "",
      "success": "",
      "info": "",
      "warning": "",
      "error": "",
      "neutral": ""
    }
  },
  "compoundVariants": [
    {
      "variant": "solid",
      "to": true,
      "class": {
        "root": "hover:bg-inverted/90"
      }
    },
    {
      "variant": "outline",
      "to": true,
      "class": {
        "root": "hover:bg-elevated/50"
      }
    },
    {
      "variant": "soft",
      "to": true,
      "class": {
        "root": "hover:bg-elevated"
      }
    },
    {
      "variant": "subtle",
      "to": true,
      "class": {
        "root": "hover:bg-elevated"
      }
    },
    {
      "variant": "subtle",
      "to": true,
      "highlight": false,
      "class": {
        "root": "hover:ring-accented"
      }
    },
    {
      "variant": "ghost",
      "to": true,
      "class": {
        "root": "hover:bg-elevated/50"
      }
    },
    {
      "highlightColor": "primary",
      "highlight": true,
      "class": {
        "root": "ring-primary"
      }
    },
    {
      "highlightColor": "secondary",
      "highlight": true,
      "class": {
        "root": "ring-secondary"
      }
    },
    {
      "highlightColor": "success",
      "highlight": true,
      "class": {
        "root": "ring-success"
      }
    },
    {
      "highlightColor": "info",
      "highlight": true,
      "class": {
        "root": "ring-info"
      }
    },
    {
      "highlightColor": "warning",
      "highlight": true,
      "class": {
        "root": "ring-warning"
      }
    },
    {
      "highlightColor": "error",
      "highlight": true,
      "class": {
        "root": "ring-error"
      }
    },
    {
      "highlightColor": "neutral",
      "highlight": true,
      "class": {
        "root": "ring-inverted"
      }
    },
    {
      "spotlightColor": "primary",
      "spotlight": true,
      "class": {
        "root": "[--spotlight-color:var(--ui-primary)]"
      }
    },
    {
      "spotlightColor": "secondary",
      "spotlight": true,
      "class": {
        "root": "[--spotlight-color:var(--ui-secondary)]"
      }
    },
    {
      "spotlightColor": "success",
      "spotlight": true,
      "class": {
        "root": "[--spotlight-color:var(--ui-success)]"
      }
    },
    {
      "spotlightColor": "info",
      "spotlight": true,
      "class": {
        "root": "[--spotlight-color:var(--ui-info)]"
      }
    },
    {
      "spotlightColor": "warning",
      "spotlight": true,
      "class": {
        "root": "[--spotlight-color:var(--ui-warning)]"
      }
    },
    {
      "spotlightColor": "error",
      "spotlight": true,
      "class": {
        "root": "[--spotlight-color:var(--ui-error)]"
      }
    },
    {
      "spotlightColor": "neutral",
      "spotlight": true,
      "class": {
        "root": "[--spotlight-color:var(--ui-bg-inverted)]"
      }
    },
    {
      "to": true,
      "class": {
        "root": "has-focus-visible:ring-2 has-focus-visible:ring-primary"
      }
    }
  ],
  "defaultVariants": {
    "variant": "outline",
    "highlightColor": "primary",
    "spotlightColor": "primary"
  }
};
const _sfc_main = /* @__PURE__ */ Object.assign({ inheritAttrs: false }, {
  __name: "UPageCard",
  __ssrInlineRender: true,
  props: {
    as: { type: null, required: false },
    icon: { type: [String, Object], required: false },
    title: { type: String, required: false },
    description: { type: String, required: false },
    orientation: { type: null, required: false, default: "vertical" },
    reverse: { type: Boolean, required: false },
    highlight: { type: Boolean, required: false },
    highlightColor: { type: null, required: false },
    spotlight: { type: Boolean, required: false },
    spotlightColor: { type: null, required: false },
    variant: { type: null, required: false },
    to: { type: null, required: false },
    target: { type: [String, Object, null], required: false },
    onClick: { type: Function, required: false },
    class: { type: null, required: false },
    ui: { type: null, required: false }
  },
  setup(__props) {
    const props = __props;
    const slots = useSlots();
    const cardRef = ref();
    const motionControl = pausableFilter();
    const appConfig = useAppConfig();
    const { elementX, elementY } = useMouseInElement(cardRef, {
      eventFilter: motionControl.eventFilter
    });
    const spotlight = computed(() => props.spotlight && (elementX.value !== 0 || elementY.value !== 0));
    watch(() => props.spotlight, (value) => {
      if (value) {
        motionControl.resume();
      } else {
        motionControl.pause();
      }
    }, { immediate: true });
    const ui = computed(() => tv({ extend: tv(theme), ...appConfig.ui?.pageCard || {} })({
      orientation: props.orientation,
      reverse: props.reverse,
      variant: props.variant,
      to: !!props.to || !!props.onClick,
      title: !!props.title || !!slots.title,
      highlight: props.highlight,
      highlightColor: props.highlightColor,
      spotlight: spotlight.value,
      spotlightColor: props.spotlightColor
    }));
    const ariaLabel = computed(() => {
      const slotText = slots.title && getSlotChildrenText(slots.title());
      return (slotText || props.title || "Card link").trim();
    });
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(unref(Primitive), mergeProps({
        ref_key: "cardRef",
        ref: cardRef,
        as: __props.as,
        "data-orientation": __props.orientation,
        class: ui.value.root({ class: [props.ui?.root, props.class] }),
        style: spotlight.value && { "--spotlight-x": `${unref(elementX)}px`, "--spotlight-y": `${unref(elementY)}px` },
        onClick: __props.onClick
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (props.spotlight) {
              _push2(`<div class="${ssrRenderClass(ui.value.spotlight({ class: props.ui?.spotlight }))}"${_scopeId}></div>`);
            } else {
              _push2(`<!---->`);
            }
            _push2(`<div class="${ssrRenderClass(ui.value.container({ class: props.ui?.container }))}"${_scopeId}>`);
            if (!!slots.header || (__props.icon || !!slots.leading) || !!slots.body || (__props.title || !!slots.title) || (__props.description || !!slots.description) || !!slots.footer) {
              _push2(`<div class="${ssrRenderClass(ui.value.wrapper({ class: props.ui?.wrapper }))}"${_scopeId}>`);
              if (!!slots.header) {
                _push2(`<div class="${ssrRenderClass(ui.value.header({ class: props.ui?.header }))}"${_scopeId}>`);
                ssrRenderSlot(_ctx.$slots, "header", {}, null, _push2, _parent2, _scopeId);
                _push2(`</div>`);
              } else {
                _push2(`<!---->`);
              }
              if (__props.icon || !!slots.leading) {
                _push2(`<div class="${ssrRenderClass(ui.value.leading({ class: props.ui?.leading }))}"${_scopeId}>`);
                ssrRenderSlot(_ctx.$slots, "leading", {}, () => {
                  if (__props.icon) {
                    _push2(ssrRenderComponent(_sfc_main$e, {
                      name: __props.icon,
                      class: ui.value.leadingIcon({ class: props.ui?.leadingIcon })
                    }, null, _parent2, _scopeId));
                  } else {
                    _push2(`<!---->`);
                  }
                }, _push2, _parent2, _scopeId);
                _push2(`</div>`);
              } else {
                _push2(`<!---->`);
              }
              if (!!slots.body || (__props.title || !!slots.title) || (__props.description || !!slots.description)) {
                _push2(`<div class="${ssrRenderClass(ui.value.body({ class: props.ui?.body }))}"${_scopeId}>`);
                ssrRenderSlot(_ctx.$slots, "body", {}, () => {
                  if (__props.title || !!slots.title) {
                    _push2(`<div class="${ssrRenderClass(ui.value.title({ class: props.ui?.title }))}"${_scopeId}>`);
                    ssrRenderSlot(_ctx.$slots, "title", {}, () => {
                      _push2(`${ssrInterpolate(__props.title)}`);
                    }, _push2, _parent2, _scopeId);
                    _push2(`</div>`);
                  } else {
                    _push2(`<!---->`);
                  }
                  if (__props.description || !!slots.description) {
                    _push2(`<div class="${ssrRenderClass(ui.value.description({ class: props.ui?.description }))}"${_scopeId}>`);
                    ssrRenderSlot(_ctx.$slots, "description", {}, () => {
                      _push2(`${ssrInterpolate(__props.description)}`);
                    }, _push2, _parent2, _scopeId);
                    _push2(`</div>`);
                  } else {
                    _push2(`<!---->`);
                  }
                }, _push2, _parent2, _scopeId);
                _push2(`</div>`);
              } else {
                _push2(`<!---->`);
              }
              if (!!slots.footer) {
                _push2(`<div class="${ssrRenderClass(ui.value.footer({ class: props.ui?.footer }))}"${_scopeId}>`);
                ssrRenderSlot(_ctx.$slots, "footer", {}, null, _push2, _parent2, _scopeId);
                _push2(`</div>`);
              } else {
                _push2(`<!---->`);
              }
              _push2(`</div>`);
            } else {
              _push2(`<!---->`);
            }
            ssrRenderSlot(_ctx.$slots, "default", {}, null, _push2, _parent2, _scopeId);
            _push2(`</div>`);
            if (__props.to) {
              _push2(ssrRenderComponent(_sfc_main$a, mergeProps({ "aria-label": ariaLabel.value }, { to: __props.to, target: __props.target, ..._ctx.$attrs }, {
                class: "focus:outline-none peer",
                raw: ""
              }), {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<span class="absolute inset-0" aria-hidden="true"${_scopeId2}></span>`);
                  } else {
                    return [
                      createVNode("span", {
                        class: "absolute inset-0",
                        "aria-hidden": "true"
                      })
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
            } else {
              _push2(`<!---->`);
            }
          } else {
            return [
              props.spotlight ? (openBlock(), createBlock("div", {
                key: 0,
                class: ui.value.spotlight({ class: props.ui?.spotlight })
              }, null, 2)) : createCommentVNode("", true),
              createVNode("div", {
                class: ui.value.container({ class: props.ui?.container })
              }, [
                !!slots.header || (__props.icon || !!slots.leading) || !!slots.body || (__props.title || !!slots.title) || (__props.description || !!slots.description) || !!slots.footer ? (openBlock(), createBlock("div", {
                  key: 0,
                  class: ui.value.wrapper({ class: props.ui?.wrapper })
                }, [
                  !!slots.header ? (openBlock(), createBlock("div", {
                    key: 0,
                    class: ui.value.header({ class: props.ui?.header })
                  }, [
                    renderSlot(_ctx.$slots, "header")
                  ], 2)) : createCommentVNode("", true),
                  __props.icon || !!slots.leading ? (openBlock(), createBlock("div", {
                    key: 1,
                    class: ui.value.leading({ class: props.ui?.leading })
                  }, [
                    renderSlot(_ctx.$slots, "leading", {}, () => [
                      __props.icon ? (openBlock(), createBlock(_sfc_main$e, {
                        key: 0,
                        name: __props.icon,
                        class: ui.value.leadingIcon({ class: props.ui?.leadingIcon })
                      }, null, 8, ["name", "class"])) : createCommentVNode("", true)
                    ])
                  ], 2)) : createCommentVNode("", true),
                  !!slots.body || (__props.title || !!slots.title) || (__props.description || !!slots.description) ? (openBlock(), createBlock("div", {
                    key: 2,
                    class: ui.value.body({ class: props.ui?.body })
                  }, [
                    renderSlot(_ctx.$slots, "body", {}, () => [
                      __props.title || !!slots.title ? (openBlock(), createBlock("div", {
                        key: 0,
                        class: ui.value.title({ class: props.ui?.title })
                      }, [
                        renderSlot(_ctx.$slots, "title", {}, () => [
                          createTextVNode(toDisplayString(__props.title), 1)
                        ])
                      ], 2)) : createCommentVNode("", true),
                      __props.description || !!slots.description ? (openBlock(), createBlock("div", {
                        key: 1,
                        class: ui.value.description({ class: props.ui?.description })
                      }, [
                        renderSlot(_ctx.$slots, "description", {}, () => [
                          createTextVNode(toDisplayString(__props.description), 1)
                        ])
                      ], 2)) : createCommentVNode("", true)
                    ])
                  ], 2)) : createCommentVNode("", true),
                  !!slots.footer ? (openBlock(), createBlock("div", {
                    key: 3,
                    class: ui.value.footer({ class: props.ui?.footer })
                  }, [
                    renderSlot(_ctx.$slots, "footer")
                  ], 2)) : createCommentVNode("", true)
                ], 2)) : createCommentVNode("", true),
                renderSlot(_ctx.$slots, "default")
              ], 2),
              __props.to ? (openBlock(), createBlock(_sfc_main$a, mergeProps({
                key: 1,
                "aria-label": ariaLabel.value
              }, { to: __props.to, target: __props.target, ..._ctx.$attrs }, {
                class: "focus:outline-none peer",
                raw: ""
              }), {
                default: withCtx(() => [
                  createVNode("span", {
                    class: "absolute inset-0",
                    "aria-hidden": "true"
                  })
                ]),
                _: 1
              }, 16, ["aria-label"])) : createCommentVNode("", true)
            ];
          }
        }),
        _: 3
      }, _parent));
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_axios@1.12.2_change-ca_9e32dd265ffe56b992951caaa30208b5/node_modules/@nuxt/ui/dist/runtime/components/PageCard.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as _ };
//# sourceMappingURL=PageCard-BrXkocLW.mjs.map
