import { _ as _sfc_main$2$1, a as _sfc_main$1$1, b as _sfc_main$5 } from './DashboardSidebarCollapse-CtCG-tPp.mjs';
import { _ as _sfc_main$4 } from './Badge-BVxjrbdp.mjs';
import { _ as _sfc_main$3 } from './Tabs-4lGXKqQB.mjs';
import { d as useFetch, c as _sfc_main$e, e as __nuxt_component_8, _ as _sfc_main$d, u as useToast, a as _sfc_main$9, b as _sfc_main$c } from './server.mjs';
import { defineComponent, ref, withAsyncContext, computed, watch, withCtx, createVNode, mergeModels, useModel, mergeProps, unref, isRef, withModifiers, toDisplayString, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderAttrs, ssrRenderList, ssrRenderClass, ssrInterpolate } from 'vue/server-renderer';
import { isToday, format } from 'date-fns';
import { d as defineShortcuts } from './defineShortcuts-tuhgUtyW.mjs';
import { _ as _sfc_main$6 } from './Tooltip-BVNuEb6A.mjs';
import { _ as _sfc_main$7 } from './DropdownMenu-DlW5ut9G.mjs';
import { _ as _sfc_main$8 } from './Card-DCvmyi07.mjs';
import { _ as _sfc_main$a } from './Textarea-8n4rVp6_.mjs';
import { u as useBreakpoints, b as breakpointsTailwind } from './index-Cc9owYnb.mjs';
import './DashboardSidebarToggle-BZQ1O4qq.mjs';
import '../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';
import 'reka-ui';
import 'vue-router';
import '@vue/shared';
import 'perfect-debounce';
import 'tailwindcss/colors';
import '@iconify/vue';
import 'tailwind-variants';
import '@iconify/utils/lib/css/icon';
import '../routes/renderer.mjs';
import 'vue-bundle-renderer/runtime';
import 'unhead/server';
import 'devalue';
import 'unhead/plugins';
import 'unhead/utils';
import './Kbd-DpYM52pA.mjs';
import 'reka-ui/namespaced';

const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "InboxList",
  __ssrInlineRender: true,
  props: /* @__PURE__ */ mergeModels({
    mails: {}
  }, {
    "modelValue": {},
    "modelModifiers": {}
  }),
  emits: ["update:modelValue"],
  setup(__props) {
    const props = __props;
    const mailsRefs = ref([]);
    const selectedMail = useModel(__props, "modelValue");
    watch(selectedMail, () => {
      if (!selectedMail.value) {
        return;
      }
      const ref2 = mailsRefs.value[selectedMail.value.id];
      if (ref2) {
        ref2.scrollIntoView({ block: "nearest" });
      }
    });
    defineShortcuts({
      arrowdown: () => {
        const index = props.mails.findIndex((mail) => mail.id === selectedMail.value?.id);
        if (index === -1) {
          selectedMail.value = props.mails[0];
        } else if (index < props.mails.length - 1) {
          selectedMail.value = props.mails[index + 1];
        }
      },
      arrowup: () => {
        const index = props.mails.findIndex((mail) => mail.id === selectedMail.value?.id);
        if (index === -1) {
          selectedMail.value = props.mails[props.mails.length - 1];
        } else if (index > 0) {
          selectedMail.value = props.mails[index - 1];
        }
      }
    });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UChip = _sfc_main$d;
      _push(`<div${ssrRenderAttrs(mergeProps({ class: "overflow-y-auto divide-y divide-default" }, _attrs))}><!--[-->`);
      ssrRenderList(_ctx.mails, (mail, index) => {
        _push(`<div><div class="${ssrRenderClass([[
          mail.unread ? "text-highlighted" : "text-toned)",
          selectedMail.value && selectedMail.value.id === mail.id ? "border-primary bg-primary/10" : "border-(--ui-bg) hover:border-primary hover:bg-primary/5"
        ], "p-4 sm:px-6 text-sm cursor-pointer border-l-2 transition-colors"])}"><div class="${ssrRenderClass([[mail.unread && "font-semibold"], "flex items-center justify-between"])}"><div class="flex items-center gap-3">${ssrInterpolate(mail.from.name)} `);
        if (mail.unread) {
          _push(ssrRenderComponent(_component_UChip, null, null, _parent));
        } else {
          _push(`<!---->`);
        }
        _push(`</div><span>${ssrInterpolate(unref(isToday)(new Date(mail.date)) ? unref(format)(new Date(mail.date), "HH:mm") : unref(format)(new Date(mail.date), "dd MMM"))}</span></div><p class="${ssrRenderClass([[mail.unread && "font-semibold"], "truncate"])}">${ssrInterpolate(mail.subject)}</p><p class="text-dimmed line-clamp-1">${ssrInterpolate(mail.body)}</p></div></div>`);
      });
      _push(`<!--]--></div>`);
    };
  }
});
const _sfc_setup$2 = _sfc_main$2.setup;
_sfc_main$2.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/inbox/InboxList.vue");
  return _sfc_setup$2 ? _sfc_setup$2(props, ctx) : void 0;
};
const __nuxt_component_5 = Object.assign(_sfc_main$2, { __name: "InboxList" });
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "InboxMail",
  __ssrInlineRender: true,
  props: {
    mail: {}
  },
  emits: ["close"],
  setup(__props, { emit: __emit }) {
    const emits = __emit;
    const dropdownItems = [[{
      label: "Mark as unread",
      icon: "i-lucide-check-circle"
    }, {
      label: "Mark as important",
      icon: "i-lucide-triangle-alert"
    }], [{
      label: "Star thread",
      icon: "i-lucide-star"
    }, {
      label: "Mute thread",
      icon: "i-lucide-circle-pause"
    }]];
    const toast = useToast();
    const reply = ref("");
    const loading = ref(false);
    function onSubmit() {
      loading.value = true;
      setTimeout(() => {
        reply.value = "";
        toast.add({
          title: "Email sent",
          description: "Your email has been sent successfully",
          icon: "i-lucide-check-circle",
          color: "success"
        });
        loading.value = false;
      }, 1e3);
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDashboardPanel = _sfc_main$2$1;
      const _component_UDashboardNavbar = _sfc_main$1$1;
      const _component_UButton = _sfc_main$9;
      const _component_UTooltip = _sfc_main$6;
      const _component_UDropdownMenu = _sfc_main$7;
      const _component_UAvatar = _sfc_main$c;
      const _component_UCard = _sfc_main$8;
      const _component_UIcon = _sfc_main$e;
      const _component_UTextarea = _sfc_main$a;
      _push(ssrRenderComponent(_component_UDashboardPanel, mergeProps({ id: "inbox-2" }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UDashboardNavbar, {
              title: _ctx.mail.subject,
              toggle: false
            }, {
              leading: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UButton, {
                    icon: "i-lucide-x",
                    color: "neutral",
                    variant: "ghost",
                    class: "-ms-1.5",
                    onClick: ($event) => emits("close")
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UButton, {
                      icon: "i-lucide-x",
                      color: "neutral",
                      variant: "ghost",
                      class: "-ms-1.5",
                      onClick: ($event) => emits("close")
                    }, null, 8, ["onClick"])
                  ];
                }
              }),
              right: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UTooltip, { text: "Archive" }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UButton, {
                          icon: "i-lucide-inbox",
                          color: "neutral",
                          variant: "ghost"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UButton, {
                            icon: "i-lucide-inbox",
                            color: "neutral",
                            variant: "ghost"
                          })
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UTooltip, { text: "Reply" }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UButton, {
                          icon: "i-lucide-reply",
                          color: "neutral",
                          variant: "ghost"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UButton, {
                            icon: "i-lucide-reply",
                            color: "neutral",
                            variant: "ghost"
                          })
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UDropdownMenu, { items: dropdownItems }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UButton, {
                          icon: "i-lucide-ellipsis-vertical",
                          color: "neutral",
                          variant: "ghost"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UButton, {
                            icon: "i-lucide-ellipsis-vertical",
                            color: "neutral",
                            variant: "ghost"
                          })
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UTooltip, { text: "Archive" }, {
                      default: withCtx(() => [
                        createVNode(_component_UButton, {
                          icon: "i-lucide-inbox",
                          color: "neutral",
                          variant: "ghost"
                        })
                      ]),
                      _: 1
                    }),
                    createVNode(_component_UTooltip, { text: "Reply" }, {
                      default: withCtx(() => [
                        createVNode(_component_UButton, {
                          icon: "i-lucide-reply",
                          color: "neutral",
                          variant: "ghost"
                        })
                      ]),
                      _: 1
                    }),
                    createVNode(_component_UDropdownMenu, { items: dropdownItems }, {
                      default: withCtx(() => [
                        createVNode(_component_UButton, {
                          icon: "i-lucide-ellipsis-vertical",
                          color: "neutral",
                          variant: "ghost"
                        })
                      ]),
                      _: 1
                    })
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(`<div class="flex flex-col sm:flex-row justify-between gap-1 p-4 sm:px-6 border-b border-default"${_scopeId}><div class="flex items-start gap-4 sm:my-1.5"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UAvatar, mergeProps(_ctx.mail.from.avatar, {
              alt: _ctx.mail.from.name,
              size: "3xl"
            }), null, _parent2, _scopeId));
            _push2(`<div class="min-w-0"${_scopeId}><p class="font-semibold text-highlighted"${_scopeId}>${ssrInterpolate(_ctx.mail.from.name)}</p><p class="text-muted"${_scopeId}>${ssrInterpolate(_ctx.mail.from.email)}</p></div></div><p class="max-sm:pl-16 text-muted text-sm sm:mt-2"${_scopeId}>${ssrInterpolate(unref(format)(new Date(_ctx.mail.date), "dd MMM HH:mm"))}</p></div><div class="flex-1 p-4 sm:p-6 overflow-y-auto"${_scopeId}><p class="whitespace-pre-wrap"${_scopeId}>${ssrInterpolate(_ctx.mail.body)}</p></div><div class="pb-4 px-4 sm:px-6 shrink-0"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UCard, {
              variant: "subtle",
              class: "mt-auto",
              ui: { header: "flex items-center gap-1.5 text-dimmed" }
            }, {
              header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UIcon, {
                    name: "i-lucide-reply",
                    class: "size-5"
                  }, null, _parent3, _scopeId2));
                  _push3(`<span class="text-sm truncate"${_scopeId2}> Reply to ${ssrInterpolate(_ctx.mail.from.name)} (${ssrInterpolate(_ctx.mail.from.email)}) </span>`);
                } else {
                  return [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-reply",
                      class: "size-5"
                    }),
                    createVNode("span", { class: "text-sm truncate" }, " Reply to " + toDisplayString(_ctx.mail.from.name) + " (" + toDisplayString(_ctx.mail.from.email) + ") ", 1)
                  ];
                }
              }),
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(`<form${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UTextarea, {
                    modelValue: unref(reply),
                    "onUpdate:modelValue": ($event) => isRef(reply) ? reply.value = $event : null,
                    color: "neutral",
                    variant: "none",
                    required: "",
                    autoresize: "",
                    placeholder: "Write your reply...",
                    rows: 4,
                    disabled: unref(loading),
                    class: "w-full",
                    ui: { base: "p-0 resize-none" }
                  }, null, _parent3, _scopeId2));
                  _push3(`<div class="flex items-center justify-between"${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UTooltip, { text: "Attach file" }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UButton, {
                          color: "neutral",
                          variant: "ghost",
                          icon: "i-lucide-paperclip"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UButton, {
                            color: "neutral",
                            variant: "ghost",
                            icon: "i-lucide-paperclip"
                          })
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(`<div class="flex items-center justify-end gap-2"${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UButton, {
                    color: "neutral",
                    variant: "ghost",
                    label: "Save draft"
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    type: "submit",
                    color: "neutral",
                    loading: unref(loading),
                    label: "Send",
                    icon: "i-lucide-send"
                  }, null, _parent3, _scopeId2));
                  _push3(`</div></div></form>`);
                } else {
                  return [
                    createVNode("form", {
                      onSubmit: withModifiers(onSubmit, ["prevent"])
                    }, [
                      createVNode(_component_UTextarea, {
                        modelValue: unref(reply),
                        "onUpdate:modelValue": ($event) => isRef(reply) ? reply.value = $event : null,
                        color: "neutral",
                        variant: "none",
                        required: "",
                        autoresize: "",
                        placeholder: "Write your reply...",
                        rows: 4,
                        disabled: unref(loading),
                        class: "w-full",
                        ui: { base: "p-0 resize-none" }
                      }, null, 8, ["modelValue", "onUpdate:modelValue", "disabled"]),
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode(_component_UTooltip, { text: "Attach file" }, {
                          default: withCtx(() => [
                            createVNode(_component_UButton, {
                              color: "neutral",
                              variant: "ghost",
                              icon: "i-lucide-paperclip"
                            })
                          ]),
                          _: 1
                        }),
                        createVNode("div", { class: "flex items-center justify-end gap-2" }, [
                          createVNode(_component_UButton, {
                            color: "neutral",
                            variant: "ghost",
                            label: "Save draft"
                          }),
                          createVNode(_component_UButton, {
                            type: "submit",
                            color: "neutral",
                            loading: unref(loading),
                            label: "Send",
                            icon: "i-lucide-send"
                          }, null, 8, ["loading"])
                        ])
                      ])
                    ], 32)
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(`</div>`);
          } else {
            return [
              createVNode(_component_UDashboardNavbar, {
                title: _ctx.mail.subject,
                toggle: false
              }, {
                leading: withCtx(() => [
                  createVNode(_component_UButton, {
                    icon: "i-lucide-x",
                    color: "neutral",
                    variant: "ghost",
                    class: "-ms-1.5",
                    onClick: ($event) => emits("close")
                  }, null, 8, ["onClick"])
                ]),
                right: withCtx(() => [
                  createVNode(_component_UTooltip, { text: "Archive" }, {
                    default: withCtx(() => [
                      createVNode(_component_UButton, {
                        icon: "i-lucide-inbox",
                        color: "neutral",
                        variant: "ghost"
                      })
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UTooltip, { text: "Reply" }, {
                    default: withCtx(() => [
                      createVNode(_component_UButton, {
                        icon: "i-lucide-reply",
                        color: "neutral",
                        variant: "ghost"
                      })
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UDropdownMenu, { items: dropdownItems }, {
                    default: withCtx(() => [
                      createVNode(_component_UButton, {
                        icon: "i-lucide-ellipsis-vertical",
                        color: "neutral",
                        variant: "ghost"
                      })
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }, 8, ["title"]),
              createVNode("div", { class: "flex flex-col sm:flex-row justify-between gap-1 p-4 sm:px-6 border-b border-default" }, [
                createVNode("div", { class: "flex items-start gap-4 sm:my-1.5" }, [
                  createVNode(_component_UAvatar, mergeProps(_ctx.mail.from.avatar, {
                    alt: _ctx.mail.from.name,
                    size: "3xl"
                  }), null, 16, ["alt"]),
                  createVNode("div", { class: "min-w-0" }, [
                    createVNode("p", { class: "font-semibold text-highlighted" }, toDisplayString(_ctx.mail.from.name), 1),
                    createVNode("p", { class: "text-muted" }, toDisplayString(_ctx.mail.from.email), 1)
                  ])
                ]),
                createVNode("p", { class: "max-sm:pl-16 text-muted text-sm sm:mt-2" }, toDisplayString(unref(format)(new Date(_ctx.mail.date), "dd MMM HH:mm")), 1)
              ]),
              createVNode("div", { class: "flex-1 p-4 sm:p-6 overflow-y-auto" }, [
                createVNode("p", { class: "whitespace-pre-wrap" }, toDisplayString(_ctx.mail.body), 1)
              ]),
              createVNode("div", { class: "pb-4 px-4 sm:px-6 shrink-0" }, [
                createVNode(_component_UCard, {
                  variant: "subtle",
                  class: "mt-auto",
                  ui: { header: "flex items-center gap-1.5 text-dimmed" }
                }, {
                  header: withCtx(() => [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-reply",
                      class: "size-5"
                    }),
                    createVNode("span", { class: "text-sm truncate" }, " Reply to " + toDisplayString(_ctx.mail.from.name) + " (" + toDisplayString(_ctx.mail.from.email) + ") ", 1)
                  ]),
                  default: withCtx(() => [
                    createVNode("form", {
                      onSubmit: withModifiers(onSubmit, ["prevent"])
                    }, [
                      createVNode(_component_UTextarea, {
                        modelValue: unref(reply),
                        "onUpdate:modelValue": ($event) => isRef(reply) ? reply.value = $event : null,
                        color: "neutral",
                        variant: "none",
                        required: "",
                        autoresize: "",
                        placeholder: "Write your reply...",
                        rows: 4,
                        disabled: unref(loading),
                        class: "w-full",
                        ui: { base: "p-0 resize-none" }
                      }, null, 8, ["modelValue", "onUpdate:modelValue", "disabled"]),
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode(_component_UTooltip, { text: "Attach file" }, {
                          default: withCtx(() => [
                            createVNode(_component_UButton, {
                              color: "neutral",
                              variant: "ghost",
                              icon: "i-lucide-paperclip"
                            })
                          ]),
                          _: 1
                        }),
                        createVNode("div", { class: "flex items-center justify-end gap-2" }, [
                          createVNode(_component_UButton, {
                            color: "neutral",
                            variant: "ghost",
                            label: "Save draft"
                          }),
                          createVNode(_component_UButton, {
                            type: "submit",
                            color: "neutral",
                            loading: unref(loading),
                            label: "Send",
                            icon: "i-lucide-send"
                          }, null, 8, ["loading"])
                        ])
                      ])
                    ], 32)
                  ]),
                  _: 1
                })
              ])
            ];
          }
        }),
        _: 1
      }, _parent));
    };
  }
});
const _sfc_setup$1 = _sfc_main$1.setup;
_sfc_main$1.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/inbox/InboxMail.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const __nuxt_component_6 = Object.assign(_sfc_main$1, { __name: "InboxMail" });
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "inbox",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const tabItems = [{
      label: "All",
      value: "all"
    }, {
      label: "Unread",
      value: "unread"
    }];
    const selectedTab = ref("all");
    const { data: mails } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/mails", { default: () => [] }, "$_PsmgsIljy")), __temp = await __temp, __restore(), __temp);
    const filteredMails = computed(() => {
      if (selectedTab.value === "unread") {
        return mails.value.filter((mail) => !!mail.unread);
      }
      return mails.value;
    });
    const selectedMail = ref();
    computed({
      get() {
        return !!selectedMail.value;
      },
      set(value) {
        if (!value) {
          selectedMail.value = null;
        }
      }
    });
    watch(filteredMails, () => {
      if (!filteredMails.value.find((mail) => mail.id === selectedMail.value?.id)) {
        selectedMail.value = null;
      }
    });
    const breakpoints = useBreakpoints(breakpointsTailwind);
    breakpoints.smaller("lg");
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDashboardPanel = _sfc_main$2$1;
      const _component_UDashboardNavbar = _sfc_main$1$1;
      const _component_UDashboardSidebarCollapse = _sfc_main$5;
      const _component_UBadge = _sfc_main$4;
      const _component_UTabs = _sfc_main$3;
      const _component_InboxList = __nuxt_component_5;
      const _component_InboxMail = __nuxt_component_6;
      const _component_UIcon = _sfc_main$e;
      const _component_ClientOnly = __nuxt_component_8;
      _push(`<!--[-->`);
      _push(ssrRenderComponent(_component_UDashboardPanel, {
        id: "inbox-1",
        "default-size": 25,
        "min-size": 20,
        "max-size": 30,
        resizable: ""
      }, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UDashboardNavbar, { title: "Inbox" }, {
              leading: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UDashboardSidebarCollapse, null, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UDashboardSidebarCollapse)
                  ];
                }
              }),
              trailing: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UBadge, {
                    label: filteredMails.value.length,
                    variant: "subtle"
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UBadge, {
                      label: filteredMails.value.length,
                      variant: "subtle"
                    }, null, 8, ["label"])
                  ];
                }
              }),
              right: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UTabs, {
                    modelValue: selectedTab.value,
                    "onUpdate:modelValue": ($event) => selectedTab.value = $event,
                    items: tabItems,
                    content: false,
                    size: "xs"
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UTabs, {
                      modelValue: selectedTab.value,
                      "onUpdate:modelValue": ($event) => selectedTab.value = $event,
                      items: tabItems,
                      content: false,
                      size: "xs"
                    }, null, 8, ["modelValue", "onUpdate:modelValue"])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_InboxList, {
              modelValue: selectedMail.value,
              "onUpdate:modelValue": ($event) => selectedMail.value = $event,
              mails: filteredMails.value
            }, null, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UDashboardNavbar, { title: "Inbox" }, {
                leading: withCtx(() => [
                  createVNode(_component_UDashboardSidebarCollapse)
                ]),
                trailing: withCtx(() => [
                  createVNode(_component_UBadge, {
                    label: filteredMails.value.length,
                    variant: "subtle"
                  }, null, 8, ["label"])
                ]),
                right: withCtx(() => [
                  createVNode(_component_UTabs, {
                    modelValue: selectedTab.value,
                    "onUpdate:modelValue": ($event) => selectedTab.value = $event,
                    items: tabItems,
                    content: false,
                    size: "xs"
                  }, null, 8, ["modelValue", "onUpdate:modelValue"])
                ]),
                _: 1
              }),
              createVNode(_component_InboxList, {
                modelValue: selectedMail.value,
                "onUpdate:modelValue": ($event) => selectedMail.value = $event,
                mails: filteredMails.value
              }, null, 8, ["modelValue", "onUpdate:modelValue", "mails"])
            ];
          }
        }),
        _: 1
      }, _parent));
      if (selectedMail.value) {
        _push(ssrRenderComponent(_component_InboxMail, {
          mail: selectedMail.value,
          onClose: ($event) => selectedMail.value = null
        }, null, _parent));
      } else {
        _push(`<div class="hidden lg:flex flex-1 items-center justify-center">`);
        _push(ssrRenderComponent(_component_UIcon, {
          name: "i-lucide-inbox",
          class: "size-32 text-dimmed"
        }, null, _parent));
        _push(`</div>`);
      }
      _push(ssrRenderComponent(_component_ClientOnly, null, {}, _parent));
      _push(`<!--]-->`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/inbox.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=inbox-CsUxFeWs.mjs.map
